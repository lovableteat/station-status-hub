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
    await db.exec(await read("../docs/security-proposals/01-close-anonymous-access.sql"));
    await db.exec(await read("../docs/security-proposals/02-bind-rpc-identities.sql"));
    await db.exec(await read("../docs/security-proposals/03-private-attachments.sql"));
    assert.equal(await snapshot(), before, "all fixture business rows and Storage objects must be byte-for-byte unchanged");

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

    await t.test("both delete RPC schemas reject anonymous, unrelated, inactive and view-only callers", async () => {
      for (const schema of ["public","workspace"]) {
        const sql = "select " + schema + ".delete_test_system('20000000-0000-4000-8000-000000000001')";
        await assert.rejects(as("anon", null, sql), /permission denied/);
        for (const actor of [3, 4, 5]) await assert.rejects(as("authenticated", uid(actor), sql), /access denied/);
        await assert.rejects(as("authenticated", uid(2), sql), /not found/, "authorized editor reaches existence validation");
      }
      for (const name of ["cleanup_old_notifications","calculate_daily_production_stats"]) {
        await assert.rejects(as("authenticated", uid(1), "select workspace." + name + "()"), /permission denied/);
        await as("service_role", null, "select workspace." + name + "()");
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
