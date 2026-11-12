import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Synthetic only. No URL, network client, production role or hosted database.
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the local PGlite module');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const fixture = await readFile(new URL('fixtures/remaining-security-postgres-setup.sql', import.meta.url), 'utf8');
const proposals = await Promise.all(['01-close-anonymous-access', '02-bind-rpc-identities', '03-private-attachments']
  .map(name => readFile(new URL(`../docs/security-proposals/${name}.sql`, import.meta.url), 'utf8')));
async function isolated(run) {
  const db = new PGlite();
  try { await db.exec(fixture); await run(db); } finally { await db.close(); }
}
async function snapshot(db) {
  const rows = async sql => (await db.query(sql)).rows;
  const data = {};
  for (const table of await rows("select schemaname,tablename from pg_tables where schemaname in ('workspace','storage') order by 1,2")) {
    data[`${table.schemaname}.${table.tablename}`] = await rows(`select to_jsonb(t) as value from "${table.schemaname}"."${table.tablename}" t order by to_jsonb(t)::text`);
  }
  return JSON.stringify({
    data,
    policies: await rows("select * from pg_policies where schemaname in ('workspace','public','storage') order by schemaname,tablename,policyname"),
    relations: await rows("select n.nspname,c.relname,c.relacl::text,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('workspace','public','storage') order by 1,2"),
    columns: await rows("select n.nspname,c.relname,a.attname,a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('workspace','public','storage') and a.attnum>0 order by 1,2,3"),
    functions: await rows("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl::text,p.proowner::regrole::text owner,p.prosecdef security_definer,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public','storage') and p.prokind='f' order by 1,2,3"),
    schemas: await rows("select nspname,nspowner::regrole::text,nspacl::text from pg_namespace where nspname in ('workspace','public','storage') order by 1"),
    defaults: await rows("select defaclrole::regrole::text,defaclnamespace::regnamespace::text,defaclobjtype,defaclacl::text from pg_default_acl order by 1,2,3"),
  });
}
async function rejectedAndRolledBack(db, sql, expected) {
  const before = await snapshot(db);
  await assert.rejects(db.exec(sql), expected);
  await assert.rejects(db.query('select 1'), error => error.code === '25P02', 'failed transactions require explicit rollback or connection close');
  await db.exec('rollback');
  assert.equal(await snapshot(db), before, 'failed stage must retain all rows, objects, definitions, policies and ACLs');
}

test('each stage rolls back late failure without leaving partial metadata or data changes', async () => {
  await isolated(async db => {
    for (const proposal of proposals) {
      const failing = proposal.replace("notify pgrst, 'reload schema';", "select 1 / 0;\nnotify pgrst, 'reload schema';");
      await rejectedAndRolledBack(db, failing, /division by zero/);
      await db.exec(proposal);
    }
  });
});

test('duplicate policy-stage replay fails atomically while RPC replacement remains repeatable', async () => {
  await isolated(async db => {
    await db.exec(proposals[0]);
    await rejectedAndRolledBack(db, proposals[0], /already exists/);
    await db.exec(proposals[1]);
    const replaced = await snapshot(db);
    await db.exec(proposals[1]);
    assert.equal(await snapshot(db), replaced);
    await db.exec(proposals[2]);
    await rejectedAndRolledBack(db, proposals[2], /already exists/);
  });
});

test('missing RPC signature stops replacement instead of creating a new public API', async () => {
  await isolated(async db => {
    await db.exec('drop function workspace.release_pcb_designer_project_lock(uuid,text,text)');
    await rejectedAndRolledBack(db, proposals[1], /prerequisite missing/);
    assert.equal((await db.query("select to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') as value")).rows[0].value, null);
  });
});

test('PUBLIC-only authenticated helper access is detected before revocation breaks clients', async () => {
  await isolated(async db => {
    await db.exec('revoke execute on function workspace.current_system_user_id() from authenticated');
    assert.equal((await db.query("select has_function_privilege('authenticated','workspace.current_system_user_id()','execute') as allowed")).rows[0].allowed, true);
    await rejectedAndRolledBack(db, proposals[0], /required helper lacks authenticated EXECUTE/);
    await db.exec('grant execute on function workspace.current_system_user_id() to authenticated; create function workspace.fixture_legacy_browser() returns int language sql as $$select 1$$');
    await rejectedAndRolledBack(db, proposals[0], /authenticated RPC depends only on PUBLIC/);
  });
});

test('owner-only required helpers cannot silently break new table or Storage guards', async () => {
  await isolated(async db => {
    await db.exec('revoke execute on function workspace.current_system_user_id() from public, anon, authenticated');
    await rejectedAndRolledBack(db, proposals[0], /required helper lacks authenticated EXECUTE/);
    await db.exec('grant execute on function workspace.current_system_user_id() to authenticated; revoke execute on function workspace.can_manage_system_users() from public, anon, authenticated');
    await rejectedAndRolledBack(db, proposals[0], /required helper lacks authenticated EXECUTE/);
    await db.exec('grant execute on function workspace.can_manage_system_users() to authenticated; revoke execute on function workspace.current_user_can_workspace(text,text) from public, anon, authenticated');
    await rejectedAndRolledBack(db, proposals[2], /Storage helper lacks authenticated EXECUTE/);
  });
});

test('disabled RLS or missing attachment bucket is a failed prerequisite, never a partial cutover', async () => {
  await isolated(async db => {
    await db.exec('alter table workspace.tasks disable row level security');
    await rejectedAndRolledBack(db, proposals[0], /workspace table without RLS/);
    await db.exec('alter table workspace.tasks enable row level security; alter table storage.objects disable row level security');
    await rejectedAndRolledBack(db, proposals[2], /Storage objects RLS is disabled/);
    await db.exec("alter table storage.objects enable row level security; delete from storage.buckets where id='task-attachments'");
    await rejectedAndRolledBack(db, proposals[2], /both reviewed attachment buckets/);
  });
});

test('generic legacy policies retain unrelated bucket access while target buckets deny anonymous reads', async () => {
  await isolated(async db => {
    // Make a generic legacy name the only policy granting unrelated-bucket SELECT.
    const policies = (await db.query("select policyname from pg_policies where schemaname='storage' and tablename='objects'")).rows;
    for (const { policyname } of policies) await db.exec(`drop policy "${policyname.replaceAll('"','""')}" on storage.objects`);
    await db.exec('create policy "Allow public downloads" on storage.objects for select to public using (true)');
    await db.exec(proposals[2]);
    await db.exec('set role anon');
    assert.deepEqual((await db.query('select distinct bucket_id from storage.objects order by bucket_id')).rows, [{ bucket_id: 'unrelated' }]);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='storage' and policyname='Allow public downloads'")).rows[0].n, 1);
  });
});

test('RPC stage closes drifted anonymous ACLs without widening helper grants', async () => {
  await isolated(async db => {
    await db.exec('revoke execute on function workspace.pcb_designer_can_view(uuid), workspace.pcb_designer_can_edit(uuid) from public, anon, authenticated, service_role');
    await db.exec('grant execute on function workspace.release_pcb_designer_project_lock(uuid,text,text) to public, anon');
    await db.exec(proposals[1]);
    for (const signature of ['public.delete_test_system(uuid)', 'workspace.delete_test_system(uuid)', 'workspace.pcb_designer_can_view(uuid)', 'workspace.pcb_designer_can_edit(uuid)', 'workspace.release_pcb_designer_project_lock(uuid,text,text)', 'workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)']) {
      assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') as allowed", [signature])).rows[0].allowed, false);
    }
    assert.equal((await db.query("select has_function_privilege('authenticated','workspace.pcb_designer_can_view(uuid)','execute') as allowed")).rows[0].allowed, false, 'owner-only helper ACL must not be widened');
    assert.equal((await db.query("select has_function_privilege('authenticated','workspace.release_pcb_designer_project_lock(uuid,text,text)','execute') as allowed")).rows[0].allowed, true);
  });
});

test('schema-specific anon defaults close future tables without claiming to change global PUBLIC function defaults', async () => {
  await isolated(async db => {
    await db.exec('alter default privileges for role postgres in schema workspace, public grant all on tables to anon; alter default privileges for role postgres in schema workspace, public grant all on sequences to anon; alter default privileges for role postgres in schema workspace, public grant execute on functions to anon');
    await db.exec(proposals[0]);
    await db.exec('create table workspace.future_fixture(id serial primary key); create function workspace.future_fixture_fn() returns int language sql as $$select 1$$');
    assert.equal((await db.query("select has_table_privilege('anon','workspace.future_fixture','select') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_sequence_privilege('anon','workspace.future_fixture_id_seq','usage') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('anon','workspace.future_fixture_fn()','execute') as allowed")).rows[0].allowed, true, 'PostgreSQL global PUBLIC default is a distinct, documented boundary');
    await db.exec('revoke execute on function workspace.future_fixture_fn() from public, anon');
    assert.equal((await db.query("select has_function_privilege('anon','workspace.future_fixture_fn()','execute') as allowed")).rows[0].allowed, false);
  });
});


// Internal RPC ACLs are already applied, not work for either pending SQL stage.
test('applied internal RPC baseline drift fails closed without silent ACL repair', async () => {
  await isolated(async db => {
    for (const proposal of proposals.slice(0, 2)) {
      for (const schema of ['public', 'workspace']) {
        for (const name of ['calculate_daily_production_stats', 'cleanup_old_notifications']) {
          const signature = schema + '.' + name + '()';
          for (const role of ['public', 'anon', 'authenticated']) {
            await db.exec('grant execute on function ' + signature + ' to ' + role);
            await rejectedAndRolledBack(db, proposal, /Applied internal RPC baseline drift: browser EXECUTE/);
            await db.exec('revoke execute on function ' + signature + ' from ' + role);
          }
          await db.exec('revoke execute on function ' + signature + ' from service_role');
          await rejectedAndRolledBack(db, proposal, /Applied internal RPC baseline drift: maintenance access missing/);
          await db.exec('grant execute on function ' + signature + ' to service_role');
        }
      }
    }
  });
});

test('missing internal signature or schema access cannot silently pass pending stage preflight', async () => {
  await isolated(async db => {
    // public schema USAGE can be inherited from PUBLIC; remove both sources.
    for (const schema of ['workspace', 'public']) {
      await db.exec('revoke usage on schema ' + schema + ' from public, service_role');
      for (const proposal of proposals.slice(0, 2)) {
        await rejectedAndRolledBack(db, proposal, /Applied internal RPC baseline drift: maintenance access missing/);
      }
      await db.exec('grant usage on schema ' + schema + ' to service_role');
    }
    await db.exec('drop function workspace.cleanup_old_notifications()');
    for (const proposal of proposals.slice(0, 2)) {
      await rejectedAndRolledBack(db, proposal, /Applied internal RPC baseline missing/);
    }
  });
});

// Both delete aliases already have the anonymous ACL fix. Stage 02 changes only
// their authorization bodies, never repairs/repeats that applied ACL cutover.
const deleteSignatures = ['public.delete_test_system(uuid)', 'workspace.delete_test_system(uuid)'];
const deleteMetadata = async db => (await db.query(`
  select p.oid::regprocedure::text signature, p.proacl::text,
    p.proowner::regrole::text owner, p.prosecdef security_definer
  from pg_proc p where p.oid in (
    'public.delete_test_system(uuid)'::regprocedure,
    'workspace.delete_test_system(uuid)'::regprocedure
  ) order by 1
`)).rows;

test('applied delete RPC anonymous and existing caller ACL drift fail closed without repair', async () => {
  await isolated(async db => {
    for (const signature of deleteSignatures) {
      for (const role of ['public', 'anon']) {
        await db.exec('grant execute on function ' + signature + ' to ' + role);
        for (const proposal of proposals.slice(0, 2)) {
          await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline drift: anonymous EXECUTE/);
        }
        await db.exec('revoke execute on function ' + signature + ' from ' + role);
      }
      for (const role of ['authenticated', 'service_role']) {
        await db.exec('revoke execute on function ' + signature + ' from ' + role);
        for (const proposal of proposals.slice(0, 2)) {
          await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline drift: existing caller access missing/);
        }
        await db.exec('grant execute on function ' + signature + ' to ' + role);
      }
    }
    // Effective inherited access is drift too, even without a direct anon ACL.
    await db.exec('create role fixture_inherited_execute; grant fixture_inherited_execute to anon');
    for (const signature of deleteSignatures) {
      await db.exec('grant execute on function ' + signature + ' to fixture_inherited_execute');
      for (const proposal of proposals.slice(0, 2)) {
        await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline drift: anonymous EXECUTE/);
      }
      await db.exec('revoke execute on function ' + signature + ' from fixture_inherited_execute');
    }
  });
});

test('missing delete signature, owner or definer drift stops both pending stages without data changes', async () => {
  for (const signature of deleteSignatures) {
    await isolated(async db => {
      for (const [mutation, restoration] of [
        ['alter function ' + signature + ' security invoker', 'alter function ' + signature + ' security definer'],
        ['alter function ' + signature + ' owner to service_role', 'alter function ' + signature + ' owner to postgres'],
      ]) {
        await db.exec(mutation);
        for (const proposal of proposals.slice(0, 2)) {
          await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline drift: owner or SECURITY DEFINER/);
        }
        await db.exec(restoration);
      }
      await db.exec('drop function ' + signature);
      for (const proposal of proposals.slice(0, 2)) {
        await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline missing/);
      }
      assert.equal((await db.query('select to_regprocedure($1) as signature', [signature])).rows[0].signature, null);
    });
  }
});

async function modelNonSuperuserPostgres(db) {
  // The bootstrap role must stay SUPERUSER. Rename that synthetic bootstrap
  // and create a non-superuser postgres to test lost effective privileges.
  // No external database or real role is involved.
  await db.exec('create role fixture_maintenance superuser; set session authorization fixture_maintenance; alter role postgres rename to fixture_bootstrap; create role postgres');
  await db.exec('grant usage on schema workspace, public to postgres');
  await db.exec('grant execute on function public.calculate_daily_production_stats(), workspace.calculate_daily_production_stats(), public.cleanup_old_notifications(), workspace.cleanup_old_notifications() to postgres');
  for (const signature of deleteSignatures) await db.exec('alter function ' + signature + ' owner to postgres');
}

test('delete baseline checks effective postgres EXECUTE and every existing caller schema USAGE', async () => {
  await isolated(async db => {
    await modelNonSuperuserPostgres(db);
    for (const signature of deleteSignatures) {
      await db.exec('revoke execute on function ' + signature + ' from postgres');
      for (const proposal of proposals.slice(0, 2)) {
        await rejectedAndRolledBack(db, proposal, /Applied delete RPC baseline drift: existing caller access missing/);
      }
      await db.exec('grant execute on function ' + signature + ' to postgres');
    }
    for (const schema of ['workspace', 'public']) {
      for (const role of ['authenticated', 'service_role', 'postgres']) {
        const sharedUsage = (await db.query(`
          select case when permission.grantee = 0 then 'public'
            else permission.grantee::regrole::text end grantee
          from pg_namespace n, lateral aclexplode(n.nspacl) permission
          where n.nspname = $1 and permission.privilege_type = 'USAGE'
            and permission.grantee in (0, 'pg_database_owner'::regrole::oid)
        `, [schema])).rows;
        // public schema may inherit USAGE from PUBLIC or pg_database_owner.
        await db.exec('revoke usage on schema ' + schema + ' from public, pg_database_owner, ' + role);
        assert.equal((await db.query("select has_schema_privilege($1,$2,'usage') allowed", [role, schema])).rows[0].allowed, false);
        for (const proposal of proposals.slice(0, 2)) {
          // The earlier internal-RPC preflight also guards shared service/postgres
          // schema access. Verify the delete-specific readonly check separately.
          await rejectedAndRolledBack(db, proposal, /Applied (internal|delete) RPC baseline drift: (maintenance|existing caller) access missing/);
          const check = proposal.match(/do \$delete_rpc_preflight\$[\s\S]*?\$delete_rpc_preflight\$;/)?.[0];
          assert.ok(check);
          await rejectedAndRolledBack(db, 'begin;\n' + check + '\ncommit;', /Applied delete RPC baseline drift: existing caller access missing/);
        }
        await db.exec('grant usage on schema ' + schema + ' to ' + role);
        for (const { grantee } of sharedUsage) await db.exec('grant usage on schema ' + schema + ' to ' + grantee);
      }
    }
  });
});

test('CREATE OR REPLACE preserves exact applied delete grants under broad defaults and duplicate 02 replay', async () => {
  await isolated(async db => {
    await db.exec('create role fixture_future_default; alter default privileges for role postgres in schema workspace, public grant execute on functions to public, anon, authenticated, service_role, fixture_future_default');
    await db.exec('grant execute on function public.delete_test_system(uuid), workspace.delete_test_system(uuid) to authenticated with grant option');
    const before = await deleteMetadata(db);
    // Confirm the defaults really are broad, without invoking any delete RPC.
    for (const schema of ['public', 'workspace']) {
      await db.exec('create function ' + schema + '.fixture_future_default() returns int language sql as $$select 1$$');
      for (const role of ['anon', 'fixture_future_default']) {
        assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed", [role, schema + '.fixture_future_default()'])).rows[0].allowed, true);
      }
    }
    for (let replay = 0; replay < 2; replay++) {
      await db.exec(proposals[1]);
      assert.deepEqual(await deleteMetadata(db), before, 'replacement retains exact ACLs including grant options');
      for (const signature of deleteSignatures) {
        for (const role of ['anon', 'fixture_future_default']) {
          assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed", [role, signature])).rows[0].allowed, false);
        }
      }
    }
  });
});

test('delete replacement postflight rejects unexpected ACL or metadata changes atomically', async () => {
  await isolated(async db => {
    const proposal = proposals[1];
    const secondDefinition = proposal.indexOf('CREATE OR REPLACE FUNCTION workspace.delete_test_system');
    const postflight = proposal.indexOf('  select jsonb_agg(', secondDefinition);
    assert.ok(secondDefinition > 0 && postflight > secondDefinition);
    for (const drift of [
      'grant execute on function public.delete_test_system(uuid) to anon;',
      'alter function workspace.delete_test_system(uuid) security invoker;',
      'alter function public.delete_test_system(uuid) owner to service_role;',
    ]) {
      const changed = proposal.slice(0, postflight) + drift + '\n' + proposal.slice(postflight);
      await rejectedAndRolledBack(db, changed, /Applied delete RPC baseline changed during identity replacement/);
    }
  });
});

test('stage 01 excludes only the applied UUID delete signatures, not unrelated overloads', async () => {
  await isolated(async db => {
    const before = await deleteMetadata(db);
    for (const schema of ['public', 'workspace']) {
      await db.exec('create function ' + schema + '.delete_test_system(p_system_id text) returns void language sql as $$select$$');
      await db.exec('grant execute on function ' + schema + '.delete_test_system(text) to anon, authenticated, service_role');
    }
    await db.exec(proposals[0]);
    assert.deepEqual(await deleteMetadata(db), before);
    for (const schema of ['public', 'workspace']) {
      const signature = schema + '.delete_test_system(text)';
      assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') allowed", [signature])).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed", [signature])).rows[0].allowed, true);
    }
  });
});

test('drift before delete metadata capture cannot become an accepted replacement baseline', async () => {
  await isolated(async db => {
    const proposal = proposals[1];
    const capture = proposal.indexOf('  select jsonb_agg(');
    assert.ok(capture > proposal.indexOf('$delete_rpc_preflight$;'));
    await db.exec('create role fixture_late_inherited_execute; grant fixture_late_inherited_execute to anon');
    for (const signature of deleteSignatures) {
      for (const [drift, expected] of [
        ['grant execute on function ' + signature + ' to public;', /Applied delete RPC postflight drift: anonymous EXECUTE/],
        ['grant execute on function ' + signature + ' to anon;', /Applied delete RPC postflight drift: anonymous EXECUTE/],
        ['grant execute on function ' + signature + ' to fixture_late_inherited_execute;', /Applied delete RPC postflight drift: anonymous EXECUTE/],
        ['revoke execute on function ' + signature + ' from authenticated;', /Applied delete RPC postflight drift: existing caller access missing/],
        ['revoke execute on function ' + signature + ' from service_role;', /Applied delete RPC postflight drift: existing caller access missing/],
        ['alter function ' + signature + ' owner to service_role;', /Applied delete RPC postflight drift: owner or SECURITY DEFINER/],
        ['alter function ' + signature + ' security invoker;', /Applied delete RPC baseline changed during identity replacement/],
      ]) {
        const changed = proposal.slice(0, capture) + drift + '\n' + proposal.slice(capture);
        await rejectedAndRolledBack(db, changed, expected);
      }
    }
    for (const schema of ['public', 'workspace']) {
      for (const role of ['authenticated', 'service_role']) {
        const drift = 'revoke usage on schema ' + schema + ' from public, ' + role + ';';
        const changed = proposal.slice(0, capture) + drift + '\n' + proposal.slice(capture);
        await rejectedAndRolledBack(db, changed, /Applied delete RPC postflight drift: existing caller access missing/);
      }
    }
  });
});


test('pre-capture loss of effective postgres EXECUTE or schema USAGE cannot pass delete postflight', async () => {
  await isolated(async db => {
    await modelNonSuperuserPostgres(db);
    const proposal = proposals[1];
    const capture = proposal.indexOf('  select jsonb_agg(');
    assert.ok(capture > proposal.indexOf('$delete_rpc_preflight$;'));
    const mutations = [
      ...deleteSignatures.map(signature => 'revoke execute on function ' + signature + ' from postgres;'),
      ...['public', 'workspace'].map(schema => 'revoke usage on schema ' + schema + ' from public, pg_database_owner, postgres;'),
    ];
    for (const drift of mutations) {
      const changed = proposal.slice(0, capture) + drift + '\n' + proposal.slice(capture);
      await rejectedAndRolledBack(db, changed, /Applied delete RPC postflight drift: existing caller access missing/);
    }
  });
});

test('final delete postflight independently rejects missing signatures and definer drift', async () => {
  await isolated(async db => {
    const proposal = proposals[1];
    const postflight = proposal.indexOf('do $delete_rpc_postflight$');
    assert.ok(postflight > proposal.indexOf('$delete_rpc_replacements$;'));
    for (const signature of deleteSignatures) {
      for (const [drift, expected] of [
        ['drop function ' + signature + ';', /Applied delete RPC postflight missing/],
        ['alter function ' + signature + ' security invoker;', /Applied delete RPC postflight drift: owner or SECURITY DEFINER/],
      ]) {
        const changed = proposal.slice(0, postflight) + drift + '\n' + proposal.slice(postflight);
        await rejectedAndRolledBack(db, changed, expected);
      }
    }
  });
});
