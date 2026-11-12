import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Isolated, synthetic PostgreSQL test. No network or production URL is used.
// Set PGLITE_MODULE to a local @electric-sql/pglite/dist/index.js installation.
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error("Set PGLITE_MODULE to the local PGlite module path");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
const uid = (number) => "10000000-0000-4000-8000-" + String(number).padStart(12, "0");
const systemId = (number) => "00000000-0000-4000-8000-" + String(number).padStart(12, "0");

test("remaining exposure proposals preserve rows and reject anonymous and forged identities", async (t) => {
  const db = new PGlite();
  const as = async (role, identity, sql) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [identity ?? ""]);
    await db.exec("set role " + role);
    try { return (await db.query(sql)).rows; }
    finally { await db.exec("reset role"); }
  };
  const count = async (role, identity, table) => Number((await as(role, identity, "select count(*) as n from " + table))[0].n);
  const snapshot = async () => {
    await db.exec("reset role");
    const tables = (await db.query("select tablename from pg_tables where schemaname='workspace' order by tablename")).rows;
    const result = {};
    for (const { tablename } of tables) {
      result[tablename] = (await db.query('select to_jsonb(t) as value from workspace."' + tablename + '" t order by to_jsonb(t)::text')).rows;
    }
    result.storageObjects = (await db.query("select to_jsonb(t) as value from storage.objects t order by id")).rows;
    return JSON.stringify(result);
  };
  try {
    await db.exec(await read("fixtures/remaining-security-postgres-setup.sql"));
    const before = await snapshot();
    assert.equal(await count("anon", null, "workspace.tasks"), 1);
    const internalState = async () => (await db.query(`
      select n.nspname, p.proname, p.proacl::text, p.proowner::regrole::text owner,
        p.prosecdef security_definer, pg_get_functiondef(p.oid) definition,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authenticated,
        has_function_privilege('service_role', p.oid, 'execute') service_role,
        has_function_privilege('postgres', p.oid, 'execute') postgres
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','workspace') and p.pronargs=0
        and p.proname in ('calculate_daily_production_stats','cleanup_old_notifications')
      order by 1,2
    `)).rows;
    const internalBefore = await internalState();
    assert.equal(internalBefore.length, 4);
    for (const row of internalBefore) {
      assert.equal(row.anon, false);
      assert.equal(row.authenticated, false);
      assert.equal(row.service_role, true);
      assert.equal(row.postgres, true);
    }
    const deleteState = async () => (await db.query(`
      select p.oid::regprocedure::text signature, p.proacl::text,
        p.proowner::regrole::text owner, p.prosecdef security_definer,
        pg_get_functiondef(p.oid) definition,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authenticated,
        has_function_privilege('service_role', p.oid, 'execute') service_role,
        has_function_privilege('postgres', p.oid, 'execute') postgres
      from pg_proc p where p.oid in (
        'public.delete_test_system(uuid)'::regprocedure,
        'workspace.delete_test_system(uuid)'::regprocedure
      ) order by 1
    `)).rows;
    const deleteBefore = await deleteState();
    const withoutDefinition = rows => rows.map(({ definition, ...metadata }) => metadata);
    const identityGuard = "  IF NOT coalesce(workspace.current_user_can_workspace('station-status', 'edit'), false) THEN\n"
      + "    RAISE EXCEPTION 'Station edit access denied' USING ERRCODE = '42501';\n"
      + "  END IF;\n\n";
    assert.equal(deleteBefore.length, 2);
    for (const row of deleteBefore) {
      assert.equal(row.owner, 'postgres');
      assert.equal(row.security_definer, true);
      assert.equal(row.anon, false);
      assert.equal(row.authenticated, true);
      assert.equal(row.service_role, true);
      assert.equal(row.postgres, true);
      assert.ok(!row.definition.includes(identityGuard), 'applied ACL migration did not add the pending authorization guard');
    }
    const auditState = async () => (await db.query(`
      select c.relowner::regrole::text owner, c.relrowsecurity rls, c.relforcerowsecurity force_rls,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') anon_table,
        has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') anon_column,
        has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
        has_table_privilege('authenticated',c.oid,'MAINTAIN') authenticated_maintain,
        has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') authenticated_write,
        (select jsonb_agg(to_jsonb(permission) order by permission.grantee, permission.privilege_type)
          from aclexplode(c.relacl) permission where permission.grantee in
            ('postgres'::regrole::oid,'service_role'::regrole::oid)) maintenance_acl
      from pg_class c where c.oid='workspace.login_audit'::regclass
    `)).rows[0];
    const loginState = async () => (await db.query(`
      select p.oid::regprocedure::text signature, p.proacl::text,
        p.proowner::regrole::text owner, p.prosecdef security_definer,
        pg_get_functiondef(p.oid) definition
      from pg_proc p where p.oid in ('public.authenticate_user(text,text)'::regprocedure,
        'workspace.authenticate_user(text,text)'::regprocedure) order by 1
    `)).rows;
    const auditBefore = await auditState();
    const loginBefore = await loginState();
    assert.equal(auditBefore.anon_table, false);
    assert.equal(auditBefore.anon_column, false);
    assert.equal(auditBefore.authenticated_select, true);
    assert.equal(auditBefore.authenticated_maintain, true, 'MAINTAIN is outside the reviewed write-revocation scope');
    assert.equal(auditBefore.authenticated_write, true, 'only anonymous audit ACL closure is already applied');
    assert.equal(auditBefore.owner, 'postgres');
    assert.equal(auditBefore.rls, true);
    assert.equal(auditBefore.force_rls, false);
    await assert.rejects(as('anon', null, 'select note from workspace.login_audit'), /permission denied/);
    assert.equal(await count('authenticated', uid(2), 'workspace.login_audit'), 5, 'signed-in row scope narrowing is still pending');
    let deletePrevious = deleteBefore;
    for (const stage of ['01-close-anonymous-access', '02-bind-rpc-identities', '03-private-attachments']) {
      await db.exec(await read('../docs/security-proposals/' + stage + '.sql'));
      assert.equal(await snapshot(), before, stage + ': all business rows and Storage objects remain unchanged');
      assert.deepEqual(await internalState(), internalBefore, stage + ': preserve all four applied internal ACLs and definitions');
      const deleteAfter = await deleteState();
      assert.deepEqual(withoutDefinition(deleteAfter), withoutDefinition(deleteBefore), stage + ': preserve both applied delete ACLs, owners and SECURITY DEFINER flags');
      if (stage === '02-bind-rpc-identities') {
        for (const [index, row] of deleteAfter.entries()) {
          assert.notEqual(row.definition, deletePrevious[index].definition);
          assert.ok(row.definition.includes(identityGuard));
          assert.equal(row.definition.replace(identityGuard, ''), deletePrevious[index].definition, 'only the reviewed authorization guard changes');
        }
      } else {
        assert.deepEqual(deleteAfter, deletePrevious, stage + ': delete definitions are unchanged');
      }
      const auditAfter = await auditState();
      assert.deepEqual(auditAfter, { ...auditBefore, authenticated_write: false },
        stage + ': anonymous audit closure and maintenance grants remain; only browser writes narrow');
      assert.deepEqual(await loginState(), loginBefore, stage + ': credential-verifying login metadata stays unchanged');
      deletePrevious = deleteAfter;
    }

    await t.test("all workspace tables and legacy column grants deny anonymous reads", async () => {
      const tables = (await db.query("select tablename from pg_tables where schemaname='workspace'")).rows;
      for (const { tablename } of tables) {
        await assert.rejects(as("anon", null, 'select * from workspace."' + tablename + '" limit 1'), /permission denied/);
      }
      await assert.rejects(as("anon", null, "select note from workspace.tasks"), /permission denied/);
      await assert.rejects(as("anon", null, "insert into workspace.tasks(note) values ('unauthorized')"), /permission denied/);
      assert.equal(await count("authenticated", uid(2), "workspace.tasks"), 1);
      assert.equal(await count("authenticated", uid(5), "workspace.tasks"), 0);
      assert.equal(await count("authenticated", uid(99), "workspace.tasks"), 0);
      assert.equal(await count("authenticated", null, "workspace.tasks"), 0);
      await assert.rejects(as("authenticated", uid(2), "truncate workspace.tasks"), /permission denied/);
      const allowed = await db.query("select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','workspace') and has_function_privilege('anon',p.oid,'execute')");
      assert.deepEqual(allowed.rows.map(row => row.proname).sort(), ["authenticate_user","authenticate_user","database_healthcheck","register_system_user","register_system_user"].sort());
      assert.equal((await as("anon", null, "select public.database_healthcheck() as ok"))[0].ok, true);
      assert.equal((await as("anon", null, "select workspace.authenticate_user('fixture','invalid') as ok"))[0].ok, false);
    });

    await t.test("audit records and legacy credentials cannot be forged or read indiscriminately", async () => {
      assert.equal(await count("authenticated", uid(2), "workspace.login_audit"), 1);
      assert.equal(await count("authenticated", uid(1), "workspace.login_audit"), 5);
      assert.equal(await count("authenticated", uid(2), "workspace.user_roles"), 0);
      assert.equal(await count("authenticated", uid(1), "workspace.user_roles"), 1);
      await assert.rejects(as("authenticated", uid(2), "delete from workspace.login_audit"), /permission denied/);
      await assert.rejects(as("authenticated", uid(1), "select * from workspace.users"), /permission denied/);
    });

    await t.test("both synthetic login definers still record successful login without browser table writes", async () => {
      const beforeLogin = await snapshot();
      // Local fixture calls only. The inserted synthetic events are rolled back.
      await db.exec('begin');
      try {
        for (const schema of ['public', 'workspace']) {
          assert.equal((await as('anon', null, `select ${schema}.authenticate_user('fixture-2','fixture-only-valid') ok`))[0].ok, true);
        }
        assert.equal((await db.query("select count(*)::int n from workspace.login_audit where note='synthetic definer login event'")).rows[0].n, 2);
        assert.equal(await count('authenticated', uid(2), 'workspace.login_audit'), 3);
        assert.equal(await count('service_role', null, 'workspace.login_audit'), 7);
      } finally { await db.exec('rollback'); }
      assert.equal(await snapshot(), beforeLogin);
    });

    await t.test("both delete RPC schemas reject anonymous, unrelated, inactive and view-only callers", async () => {
      for (const schema of ["public","workspace"]) {
        const sql = "select " + schema + ".delete_test_system('20000000-0000-4000-8000-000000000001')";
        await assert.rejects(as("anon", null, sql), /permission denied/);
        for (const actor of [3, 4, 5]) await assert.rejects(as("authenticated", uid(actor), sql), /access denied/);
        await assert.rejects(as("authenticated", uid(2), sql), /not found/, "authorized editor reaches existence validation");
      }
      for (const name of ["cleanup_old_notifications","calculate_daily_production_stats"]) {
        for (const schema of ["public", "workspace"]) {
          const call = "select " + schema + "." + name + "()";
          await assert.rejects(as("anon", null, call), /permission denied/);
          await assert.rejects(as("authenticated", uid(1), call), /permission denied/);
          // Harmless synthetic stubs only, never the production implementations.
          await as("service_role", null, call);
          await as("postgres", null, call);
        }
      }
      // Execute the destructive workflow only on local, synthetic targets.
      const retained = "20000000-0000-4000-8000-000000000099";
      await db.exec("insert into workspace.test_systems(id,status) values ('" + retained + "','retained')");
      for (const [index,schema] of ["public","workspace"].entries()) {
        const target = "20000000-0000-4000-8000-00000000000" + (index + 1);
        await db.exec("insert into workspace.test_systems(id,status) values ('" + target + "','fixture')");
        await as("authenticated", uid(2), "select " + schema + ".delete_test_system('" + target + "')");
      }
      assert.deepEqual((await db.query("select id,status from workspace.test_systems")).rows, [{id:retained,status:"retained"}]);
    });

    await t.test("PCB never trusts another account ID and preserves legitimate owner loading", async () => {
      const own = "select workspace.load_pcb_designer_workspace('" + systemId(2) + "') as payload";
      const rows = await as("authenticated", uid(2), own);
      assert.ok(Array.isArray(rows[0].payload.projects));
      await assert.rejects(as("anon", null, own), /permission denied/);
      for (const actor of [1,3,4,5]) await assert.rejects(as("authenticated", uid(actor), own), /access denied/);
      const release = "select workspace.release_pcb_designer_project_lock('" + systemId(2) + "','fixture-project','fixture-editor') as released";
      await assert.rejects(as("authenticated", uid(3), release), /access denied/);
      const save = "select workspace.save_pcb_designer_workspace_locked('" + systemId(2) + "','fixture-project','fixture-editor','{}')";
      await assert.rejects(as("authenticated", uid(3), save), /access denied/);
      assert.equal((await as("authenticated", uid(2), release))[0].released, true);
    });

    await t.test("private attachments remain shared by authorized viewers; writes require editor", async () => {
      assert.equal(await count("anon", null, "storage.objects"), 1, "unrelated bucket is unchanged");
      assert.equal(await count("authenticated", uid(3), "storage.objects"), 3);
      await db.exec("create policy unexpected_broad on storage.objects for all to public using(true) with check(true)");
      assert.equal(await count("anon", null, "storage.objects"), 1, "restrictive guard defeats unrelated broad legacy policies");
      for (const actor of [4,5]) assert.equal(await count("authenticated", uid(actor), "storage.objects"), 1);
      const insert = "insert into storage.objects(bucket_id,name) values ('issue-attachments','fixture/new.png') returning id";
      await assert.rejects(as("anon", null, insert), /row-level security/);
      await assert.rejects(as("authenticated", uid(3), insert), /row-level security/);
      assert.equal((await as("authenticated", uid(2), insert)).length, 1);
      assert.equal((await as("authenticated", uid(3), "delete from storage.objects where name='fixture/new.png' returning id")).length, 0);
      assert.equal((await as("authenticated", uid(2), "delete from storage.objects where name='fixture/new.png' returning id")).length, 1);
      assert.deepEqual((await db.query("select id,public from storage.buckets order by id")).rows, [
        {id:"issue-attachments",public:false}, {id:"task-attachments",public:false}, {id:"unrelated",public:true},
      ]);
    });
  } finally { await db.close(); }
});
