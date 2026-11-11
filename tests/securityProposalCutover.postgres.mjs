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
    functions: await rows("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl::text,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public','storage') and p.prokind='f' order by 1,2,3"),
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
