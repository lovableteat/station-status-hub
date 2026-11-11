// Run the actual migration against an isolated PostgreSQL-compatible database.
// node tests/anonymousExposure.integration.mjs <path-to-pglite-package>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageDir = path.resolve(process.argv[2] || 'node_modules/@electric-sql/pglite');
const { PGlite } = await import(pathToFileURL(path.join(packageDir, 'dist/index.js')));
const db = await PGlite.create();
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const name = (await fs.readdir(migrationDir)).filter(name => name.endsWith('_close_anonymous_data_exposure.sql')).sort().at(-1);
assert.ok(name, 'anonymous exposure migration must exist');
const migration = await fs.readFile(new URL(name, migrationDir), 'utf8');
assert.ok(migration.trim(), 'anonymous exposure migration must not be empty');
const issueTables = ['issues', 'test_systems', 'test_flow_stations', 'test_flow_items'];
const protectedRelations = ['public.active_notifications', 'public.issue_details', ...issueTables.map(name => `workspace.${name}`), 'workspace.keep_alive_check'];
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const query = async sql => (await db.query(sql)).rows;
let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log(`PASS ${label}`);
}
async function denied(sql, label) {
  await assert.rejects(() => query(sql), /permission denied/i, label);
  checks++;
  console.log(`PASS ${label}`);
}
async function actor(role, user = '', admin = false) {
  await db.exec('reset role');
  await db.query("select set_config('test.user_id',$1,false), set_config('test.admin',$2,false)", [user, String(admin)]);
  await db.exec(`set role ${role}`);
}
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema workspace;
    create schema auth;
    grant usage on schema public, workspace, auth to anon, authenticated, service_role;
    create function workspace.current_system_user_id() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create function workspace.current_system_user_is_admin() returns boolean language sql stable as
      $$ select coalesce(current_setting('test.admin', true), 'false')::boolean $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select workspace.current_system_user_id() $$;
    create table workspace.user_notifications (
      id integer primary key, recipient_id uuid, sender_id uuid,
      notification_type text, title text, archived_at timestamptz
    );
    alter table workspace.user_notifications enable row level security;
    create policy recipient_read on workspace.user_notifications for select to authenticated
      using (recipient_id = workspace.current_system_user_id() or
        (notification_type = 'admin_announcement' and sender_id = workspace.current_system_user_id()));
    create policy recipient_update on workspace.user_notifications for update to authenticated
      using (recipient_id = workspace.current_system_user_id())
      with check (recipient_id = workspace.current_system_user_id());
    create table workspace.keep_alive_check (id integer primary key, payload text);
    insert into workspace.keep_alive_check values (1, 'private heartbeat data');
  `);
  for (const table of issueTables) {
    await db.exec(`
      create table workspace.${table} (id integer primary key, label text);
      insert into workspace.${table} values (1, '${table} existing');
      alter table workspace.${table} enable row level security;
      create policy "Allow anonymous access to ${table}" on workspace.${table} for all to public using (true);
    `);
  }
  await db.exec(`
    insert into workspace.user_notifications values
      (1, '${uid(1)}', '${uid(2)}', 'issue', 'own active', null),
      (2, '${uid(2)}', '${uid(1)}', 'issue', 'other recipient', null),
      (3, '${uid(1)}', '${uid(2)}', 'issue', 'own archived', now()),
      (4, '${uid(2)}', '${uid(3)}', 'admin_announcement', 'admin sent', null),
      (5, '${uid(2)}', '${uid(3)}', 'issue', 'admin ordinary message', null);
    create view public.active_notifications as select * from workspace.user_notifications where archived_at is null;
    create view public.issue_details as
      select i.id, i.label, s.label as system_label, f.label as station_label, t.label as item_label
      from workspace.issues i join workspace.test_systems s using(id)
      join workspace.test_flow_stations f using(id) join workspace.test_flow_items t using(id);
    grant all on all tables in schema workspace, public to anon, authenticated, service_role;
  `);
  // Deliberately retain column grants alongside table grants. REVOKE ALL ON
  // TABLE alone does not close these alternate access paths.
  for (const relation of protectedRelations) {
    await db.exec(`grant select(id), insert(id), update(id), references(id) on ${relation} to anon, public`);
  }
  await actor('anon');
  check((await query('select id from public.active_notifications order by id')).map(row => row.id), [1, 2, 4, 5], 'fixture reproduces definer-view notification exposure');
  check((await query('select count(*)::int as n from public.issue_details'))[0].n, 1, 'fixture reproduces issue view exposure');
  await actor('postgres');
  await db.exec(migration);
  await db.exec(migration);
  checks++;
  console.log('PASS migration reapplies without error');

  for (const relation of protectedRelations) {
    await actor('anon');
    await denied(`select id from ${relation}`, `anon cannot select ${relation}, including legacy column grant`);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      check((await query(`select has_table_privilege('anon','${relation}','${privilege}') as allowed`))[0].allowed, false, `anon has no ${privilege} table privilege on ${relation}`);
    }
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      check((await query(`select has_any_column_privilege('anon','${relation}','${privilege}') as allowed`))[0].allowed, false, `anon has no ${privilege} column privilege on ${relation}`);
    }
    // Joined issue_details is intrinsically non-updatable. Assert its write ACL
    // above rather than accepting a non-updatable-view error as proof of denial.
    if (relation !== 'public.issue_details') {
      await denied(`insert into ${relation}(id) values (99)`, `anon cannot insert ${relation}`);
      await denied(`update ${relation} set id=99 where id=1`, `anon cannot update ${relation}`);
      await denied(`delete from ${relation} where id=1`, `anon cannot delete ${relation}`);
    }
  }

  await actor('authenticated', uid(1));
  check((await query('select id from public.active_notifications order by id')).map(row => row.id), [1], 'notification view respects recipient RLS and excludes archived rows');
  check((await query('select id from workspace.user_notifications order by id')).map(row => row.id), [1, 3], 'direct authenticated notification contract retains own archived rows');
  await query("update workspace.user_notifications set title='read update' where id=1");
  check((await query('select title from public.active_notifications where id=1'))[0].title, 'read update', 'recipient notification update remains available');
  await actor('authenticated', uid(2));
  check((await query('select id from public.active_notifications order by id')).map(row => row.id), [2, 4, 5], 'second recipient sees only their active notifications');
  await actor('authenticated', uid(3), false);
  check((await query('select id from public.active_notifications order by id')).map(row => row.id), [4], 'announcement sender keeps existing visibility without an additional admin-role requirement');
  await actor('authenticated', uid(3), true);
  check((await query('select id from public.active_notifications order by id')).map(row => row.id), [4], 'admin sender retains announcement visibility but not ordinary other-recipient messages');
  for (const table of issueTables) {
    await query(`insert into workspace.${table} values (2, 'new')`);
    await query(`update workspace.${table} set label='updated' where id=2`);
    check((await query(`select label from workspace.${table} where id=2`))[0].label, 'updated', `authenticated ${table} create/read/update preserved`);
  }
  check((await query('select label,system_label,station_label,item_label from public.issue_details where id=2'))[0], {label:'updated',system_label:'updated',station_label:'updated',item_label:'updated'}, 'authenticated invoker issue view joins unchanged');
  for (const table of issueTables) {
    await query(`delete from workspace.${table} where id=2`);
    check(await query(`select id from workspace.${table} where id=2`), [], `authenticated ${table} delete preserved`);
  }
  await denied('select id from workspace.keep_alive_check', 'authenticated cannot access private keep-alive table');
  await denied('insert into workspace.keep_alive_check(id) values (99)', 'authenticated cannot insert private keep-alive rows');
  await actor('service_role');
  check((await query('select payload from workspace.keep_alive_check where id=1'))[0].payload, 'private heartbeat data', 'service role retains keep-alive read');
  await query("insert into workspace.keep_alive_check values (2,'service write')");
  await query("update workspace.keep_alive_check set payload='updated' where id=2");
  await query('delete from workspace.keep_alive_check where id=2');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await actor(role);
    check((await query('select public.database_healthcheck() as healthy'))[0].healthy, true, `${role} healthcheck returns true without data access`);
  }
  await actor('postgres');
  check((await query("select prosecdef, provolatile, proconfig from pg_proc where oid='public.database_healthcheck()'::regprocedure"))[0], {prosecdef:false, provolatile:'s', proconfig:['search_path=""']}, 'healthcheck is stable invoker with empty search path');
  check((await query("select relrowsecurity from pg_class where oid='workspace.keep_alive_check'::regclass"))[0].relrowsecurity, true, 'keep-alive RLS is enabled');
  for (const view of ['public.active_notifications', 'public.issue_details']) {
    check((await query(`select reloptions from pg_class where oid='${view}'::regclass`))[0].reloptions.includes('security_invoker=true'), true, `${view} is invoker`);
  }
  for (const table of issueTables) {
    check((await query(`select roles::text from pg_policies where schemaname='workspace' and tablename='${table}' and policyname='Allow anonymous access to ${table}'`))[0].roles, '{authenticated}', `${table} legacy policy no longer applies to public`);
  }
  // Even a later accidental read grant must not revive the legacy PUBLIC policy.
  for (const table of issueTables) {
    await actor('postgres');
    await db.exec(`grant select on workspace.${table} to anon`);
    await actor('anon');
    check(await query(`select id from workspace.${table}`), [], `${table} RLS independently denies anonymous rows`);
  }
  console.log(`PASS ${checks} anonymous exposure integration checks (${name})`);
} finally {
  await db.close();
}
