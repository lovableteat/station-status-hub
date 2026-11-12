import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadSanitizedSubset } from './support/historicalCredentialSanitization.mjs';

// Selected historical slice only, not a full replay or a hosted deployment plan.
// No URL/network client, production data, Git history or old credential baseline.
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the local PGlite module');
const migrations = await loadSanitizedSubset();
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);

async function isolated(run) {
  const db = new PGlite();
  try {
    await db.exec(`
      create function public.update_updated_at_column() returns trigger language plpgsql
        as $$begin new.updated_at = now(); return new; end$$;
      create function public.hash_password(text) returns text language plpgsql
        as $$begin raise exception 'credential helper invocation prohibited'; end$$;
      create function public.verify_password(text,text) returns boolean language plpgsql
        as $$begin raise exception 'credential helper invocation prohibited'; end$$;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
      insert into supabase_migrations.schema_migrations values
        ('synthetic-unmatched-version', array['synthetic historical statement'], 'synthetic_history');
    `);
    await run(db);
  } finally { await db.close(); }
}

async function prepareHistoricalPredecessor(db) {
  await db.exec(migrations[0].sql);
  // Minimal synthetic bridge for intervening migrations, not a substitute for them.
  await db.exec(`
    alter table public.system_users add column display_name varchar(100), add column auth_user_id uuid;
    drop policy "Allow anonymous access to system_users" on public.system_users;
    create policy "Service role can insert users" on public.system_users for insert with check (false);
    create policy "Users can view their own record" on public.system_users for select using (false);
    create policy "Users can update their own record" on public.system_users for update using (false);
    create policy "Service role can delete users" on public.system_users for delete using (false);
  `);
}

async function seedSyntheticAccounts(db) {
  for (const [role, status] of [['admin', 'active'], ['engineer', 'pending'], ['user', 'inactive']]) {
    await db.query(`insert into public.system_users
      (id,username,password_hash,role,permissions,status,created_by,display_name,auth_user_id,created_at,updated_at)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`, [
      randomUUID(), `synthetic-${randomUUID().slice(0, 16)}`, randomUUID(), role,
      JSON.stringify({ synthetic_scope: { view: true, edit: false } }), status,
      'synthetic-operator', 'Synthetic account', randomUUID(),
      '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z',
    ]);
  }
}

async function snapshot(db) {
  return {
    accounts: (await db.query('select to_jsonb(u) row from public.system_users u order by id')).rows,
    ledger: (await db.query('select * from supabase_migrations.schema_migrations order by version')).rows,
  };
}

async function applyRemainingSubset(db) {
  for (const { sql } of migrations.slice(1)) await db.exec(sql);
}

test('fresh reviewed subset creates zero accounts and leaves unmatched history intact', async () => {
  await isolated(async db => {
    await prepareHistoricalPredecessor(db);
    const before = await snapshot(db);
    await applyRemainingSubset(db);
    assert.deepEqual(await snapshot(db), before);
    assert.deepEqual(before.accounts, []);
    assert.deepEqual((await db.query('select daily_target,weekly_target from public.production_targets')).rows, [{ daily_target: 10, weekly_target: 50 }]);
    assert.equal((await db.query('select count(*)::int n from public.login_audit')).rows[0].n, 0);
  });
});

test('existing synthetic account fields and ledger remain exactly unchanged', async () => {
  await isolated(async db => {
    await prepareHistoricalPredecessor(db);
    await seedSyntheticAccounts(db);
    const before = await snapshot(db);
    await applyRemainingSubset(db);
    assert.deepEqual(await snapshot(db), before, 'preserve hashes, roles, permissions, status, creator, identity mapping and timestamps');
  });
});

test('both credential-only placeholders are inert on populated databases and repeated execution', async () => {
  await isolated(async db => {
    await prepareHistoricalPredecessor(db);
    await seedSyntheticAccounts(db);
    const before = await snapshot(db);
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const index of [2, 4]) await db.exec(migrations[index].sql);
    }
    assert.deepEqual(await snapshot(db), before);
  });
});

test('retained tables, RLS, triggers and login RPC metadata remain compatible without calling login', async () => {
  await isolated(async db => {
    await prepareHistoricalPredecessor(db);
    await applyRemainingSubset(db);
    const relations = (await db.query(`select relname,relrowsecurity from pg_class
      where relnamespace='public'::regnamespace and relname in ('system_users','production_targets','login_audit') order by relname`)).rows;
    assert.deepEqual(relations, [
      { relname: 'login_audit', relrowsecurity: true },
      { relname: 'production_targets', relrowsecurity: true },
      { relname: 'system_users', relrowsecurity: true },
    ]);
    assert.deepEqual((await db.query(`select tgname from pg_trigger where not tgisinternal
      and tgrelid in ('public.system_users'::regclass,'public.production_targets'::regclass) order by tgname`)).rows,
    [{ tgname: 'update_production_targets_updated_at' }, { tgname: 'update_system_users_updated_at' }]);
    assert.equal((await db.query(`select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name='login_audit'`)).rows[0].n, 9);
    const rpc = (await db.query(`select prosecdef, proconfig, pg_get_function_identity_arguments(oid) args,
      pg_get_function_result(oid) result from pg_proc where oid='public.authenticate_user(text,text)'::regprocedure`)).rows[0];
    assert.equal(rpc.prosecdef, true);
    assert.deepEqual(rpc.proconfig, ['search_path=""']);
    assert.equal(rpc.args, 'username_input text, password_input text');
    assert.equal(rpc.result, 'TABLE(user_id uuid, username character varying, role character varying, display_name character varying, success boolean)');
    assert.equal((await db.query(`select count(*)::int n from pg_policies where schemaname='public'
      and tablename in ('system_users','production_targets','login_audit')`)).rows[0].n, 3);
  });
});

test('structural migration is not safe to replay as a live repair on existing schema', async () => {
  await isolated(async db => {
    await prepareHistoricalPredecessor(db);
    await seedSyntheticAccounts(db);
    const before = await snapshot(db);
    await db.exec('begin');
    await assert.rejects(db.exec(migrations[0].sql), error => error.code === '42P07');
    await db.exec('rollback');
    assert.deepEqual(await snapshot(db), before);
  });
});
