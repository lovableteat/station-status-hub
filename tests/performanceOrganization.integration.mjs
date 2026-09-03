// Run with an isolated PGlite install; no production account or database used.
// node tests/performanceOrganization.integration.mjs <path-to-pglite-package>
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const packageDir = path.resolve(
  process.argv[2] || "node_modules/@electric-sql/pglite",
);
const { PGlite } = await import(
  pathToFileURL(path.join(packageDir, "dist/index.js"))
);
const { pgcrypto } = await import(
  pathToFileURL(path.join(packageDir, "dist/contrib/pgcrypto.js"))
);
const db = await PGlite.create({ extensions: { pgcrypto } });
const migration = (name) =>
  fs.readFile(
    new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log(`PASS ${label}`);
};
const rejects = async (sql, params, label) => {
  await assert.rejects(() => query(sql, params));
  checks++;
  console.log(`PASS ${label}`);
};
const actor = async (n, session = `session-${n}`) => {
  await db.exec("reset role; set role authenticated");
  await query(
    "select set_config('test.uid', $1, false), set_config('test.session', $2, false), set_config('test.role','authenticated',false)",
    [id(n), session],
  );
};
const root = async () => {
  await db.exec("reset role");
  await query("select set_config('test.role','service_role',false)");
};
const save = (
  n,
  parent,
  level,
  department = "研發部",
  section = "",
  access = level === "member" ? "employee" : "manager",
) =>
  query(
    `select workspace.save_performance_organization_member($1,$2,$3,'工程職務',
  (select updated_at from workspace.performance_org_members where employee_id=$1),$4,$5,$6)`,
    [id(n), parent ? id(parent) : null, department, access, level, section],
  );
const visible = async () =>
  (await query("select id from workspace.performance_reviews order by id")).map(
    (row) => row.id,
  );

try {
  await db.exec(`create schema auth; create schema workspace;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema auth, workspace to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',current_setting('test.session',true)) $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
    create table workspace.system_users(id uuid primary key, auth_user_id uuid unique, username text unique, display_name text, role text, status text, permissions jsonb);
    create table workspace.user_page_permissions(user_id uuid, permission text);
    create function workspace.current_system_user_id() returns uuid language sql stable security definer set search_path='' as $$ select id from workspace.system_users where auth_user_id=auth.uid() $$;
    grant select on workspace.system_users to authenticated;
  `);
  const base = await migration(
    "20260824120000_repair_workspace_schema_and_sensitive_access",
  );
  const tableStart = base.indexOf(
    "create table if not exists workspace.performance_reviews",
  );
  await db.exec(
    base.slice(tableStart, base.indexOf("create index", tableStart)),
  );
  const fnStart = base.indexOf(
    "create or replace function workspace.current_user_can_workspace",
  );
  await db.exec(
    base.slice(fnStart, base.indexOf("-- Remove every legacy", fnStart)),
  );
  await db.exec(
    "alter table workspace.performance_reviews enable row level security; grant select,insert,update,delete on workspace.performance_reviews to authenticated;",
  );
  const guard = await migration("20260901130000_assign_performance_managers");
  await db.exec(
    guard.slice(
      guard.indexOf(
        "create or replace function workspace.guard_performance_review_self_update",
      ),
      guard.indexOf("drop policy"),
    ),
  );
  await db.exec(
    await migration("20260902130000_restore_performance_employee_identity"),
  );
  for (let n = 1; n <= 10; n++) {
    await query(
      "insert into workspace.system_users values ($1,$1,$2,$3,$4,'active',$5)",
      [
        id(n),
        `user${n}`,
        `人員${n}`,
        n === 1 ? "admin" : "engineer",
        {
          workspaceAccess: { "station-status": "view", performance: "edit" },
          pagePermissions: ["dashboard_view"],
          custom: "preserve",
        },
      ],
    );
  }
  await actor(1);
  await root();
  await query(
    "insert into workspace.performance_reviews(id,employee_id,employee_name,reviewer_name) values ('legacy','user5','人員5','user3')",
  );
  await db.exec(await migration("20260903120000_add_performance_organization"));
  // Latest privacy migration must install its own guard even if the legacy
  // optional manager migration was skipped by an existing deployment.
  await db.exec(
    "drop trigger if exists guard_performance_review_self_update on workspace.performance_reviews",
  );
  await db.exec(await migration("20260903130000_protect_performance_groups"));
  check(
    (
      await query(
        "select employee_id from workspace.performance_reviews where id='legacy'",
      )
    )[0].employee_id,
    id(5),
    "legacy identity normalized to account UUID",
  );
  await actor(1);
  await save(2, null, "director");
  await save(3, 2, "section_chief", "ignored", "韌體課");
  await save(4, 2, "section_chief", "ignored", "硬體課");
  await save(5, 3, "member");
  await save(6, 4, "member");
  await save(7, null, "director", "產品部");
  await save(8, 7, "section_chief", "ignored", "產品課");
  await save(9, 8, "member");
  const org = await query(
    "select * from workspace.get_performance_organization()",
  );
  check(org.length, 10, "organization roster includes all site accounts");
  check(
    org.filter((m) => m.manager_id === id(2)).length,
    2,
    "one department has multiple section chiefs",
  );
  check(
    org.find((m) => m.employee_id === id(5)).section,
    "韌體課",
    "member inherits section",
  );
  check(
    (
      await query(
        "select role,permissions from workspace.system_users where id=$1",
        [id(3)],
      )
    )[0],
    {
      role: "engineer",
      permissions: {
        workspaceAccess: { "station-status": "view", performance: "edit" },
        pagePermissions: [
          "dashboard_view",
          "performance_view",
          "performance_edit",
        ],
        performanceManager: true,
        custom: "preserve",
      },
    },
    "performance assignment preserves global role and unrelated permissions",
  );
  await assert.rejects(() => save(5, 2, "member"));
  checks++;
  console.log("PASS rejects skipping section chief level");
  await assert.rejects(() => save(2, 3, "director"));
  checks++;
  console.log("PASS rejects cycle/top-level parent");
  await rejects(
    "select workspace.save_performance_organization_member($1,$2,'研發部','',null,'employee','member','')",
    [id(5), id(3)],
    "stale organization edit cannot overwrite a newer assignment",
  );
  await actor(3);
  await assert.rejects(() => save(5, 4, "member"));
  checks++;
  console.log("PASS supervisor cannot modify hierarchy");
  await actor(5);
  await rejects(
    "select * from workspace.get_performance_organization()",
    [],
    "employee cannot query organization RPC",
  );
  await query(
    "insert into workspace.performance_reviews(id,employee_id,employee_name,self_feedback) values ('a',$1,'人員5','private A')",
    [id(5)],
  );
  check(
    (
      await query(
        "select reviewer_name from workspace.performance_reviews where id='a'",
      )
    )[0].reviewer_name,
    "user3",
    "self submission automatically assigns verified chief",
  );
  await rejects(
    "update workspace.performance_reviews set manager_feedback='forged' where id='a'",
    [],
    "employee cannot write manager feedback",
  );
  await root();
  for (const [record, employee] of [
    ["b", 6],
    ["c", 9],
    ["chief", 3],
  ])
    await query(
      "insert into workspace.performance_reviews(id,employee_id,employee_name,self_feedback) values ($1,$2,$3,'private evidence')",
      [record, id(employee), `人員${employee}`],
    );
  await actor(2);
  check(
    await visible(),
    ["a", "b", "chief", "legacy"],
    "director sees both sections, not another department",
  );
  await actor(3);
  check(
    await visible(),
    ["a", "chief", "legacy"],
    "chief sees own review and own section only",
  );
  await actor(4);
  check(await visible(), ["b"], "sibling chief cannot see other section");
  await actor(3);
  check(
    (
      await query(
        "select workspace.set_performance_group_password('secret-123') as ok",
      )
    )[0].ok,
    true,
    "chief creates a private group password",
  );
  await root();
  check(
    (
      await query(
        "select password_hash like '$2a$10$%' as bcrypt from workspace.performance_group_secrets",
      )
    )[0].bcrypt,
    true,
    "password uses salted bcrypt cost 10",
  );
  await actor(1);
  check(
    await visible(),
    ["b", "c"],
    "administrator cannot read locked group or chief review",
  );
  await rejects(
    "select * from workspace.performance_group_secrets",
    [],
    "administrator cannot read password hashes",
  );
  check(
    (
      await query(
        "update workspace.performance_reviews set self_feedback='tamper' where id='a' returning id",
      )
    ).length,
    0,
    "administrator cannot update locked record",
  );
  check(
    (
      await query(
        "delete from workspace.performance_reviews where id='a' returning id",
      )
    ).length,
    0,
    "administrator cannot delete locked record",
  );
  await actor(2);
  check(
    await visible(),
    ["b"],
    "department director also needs section password",
  );
  await actor(5);
  check(
    await visible(),
    ["a", "legacy"],
    "employee retains own self-assessment under group lock",
  );
  await query(
    "update workspace.performance_reviews set self_feedback='self edit' where id='a'",
  );
  await rejects(
    "select workspace.unlock_performance_group($1,'secret-123')",
    [id(3)],
    "employee cannot use manager unlock RPC",
  );
  await actor(1);
  check(
    (
      await query(
        "select workspace.unlock_performance_group($1,'wrong') as ok",
        [id(3)],
      )
    )[0].ok,
    false,
    "wrong password denied",
  );
  check(
    (
      await query(
        "select workspace.unlock_performance_group($1,'secret-123') as ok",
        [id(3)],
      )
    )[0].ok,
    true,
    "correct password unlocks for administrator",
  );
  check(
    await visible(),
    ["a", "b", "c", "chief", "legacy"],
    "unlocked administrator receives protected rows",
  );
  await actor(1, "different-session");
  check(
    await visible(),
    ["b", "c"],
    "grant cannot be reused in another login session",
  );
  await actor(1);
  await query("select workspace.lock_performance_groups()");
  await save(5, 4, "member");
  check(
    await visible(),
    ["b", "c"],
    "moving employee cannot bypass original group password",
  );
  await actor(4);
  check(
    await visible(),
    ["b"],
    "new chief still needs historic group password",
  );
  await query("select workspace.unlock_performance_group($1,'secret-123')", [
    id(3),
  ]);
  check(
    await visible(),
    ["a", "b", "legacy"],
    "new chief can access moved employee after password unlock",
  );
  await actor(8);
  await query("select workspace.unlock_performance_group($1,'secret-123')", [
    id(3),
  ]);
  check(
    await visible(),
    ["c"],
    "knowing password never grants unrelated organizational access",
  );
  await actor(2);
  await query(
    "select workspace.set_performance_group_password('director-123')",
  );
  await actor(1);
  await save(4, 7, "section_chief", "", "硬體課");
  check(
    await visible(),
    ["c"],
    "moving whole section retains old department protection",
  );
  await actor(3);
  check(
    (
      await query(
        "select workspace.set_performance_group_password('new-secret-123','wrong') as ok",
      )
    )[0].ok,
    false,
    "password rotation requires current password",
  );
  check(
    (
      await query(
        "select workspace.set_performance_group_password('new-secret-123','secret-123') as ok",
      )
    )[0].ok,
    true,
    "owner rotates password with current password",
  );
  await actor(4);
  check(
    await visible(),
    [],
    "rotation revokes previous grants (and old department remains locked)",
  );
  await actor(1);
  for (let i = 0; i < 5; i++)
    await query("select workspace.unlock_performance_group($1,'wrong')", [
      id(3),
    ]);
  check(
    (
      await query(
        "select workspace.unlock_performance_group($1,'new-secret-123') as ok",
        [id(3)],
      )
    )[0].ok,
    false,
    "five failures throttle even a subsequent correct guess",
  );
  await root();
  await query(
    "update workspace.performance_group_attempts set blocked_until=now()-interval '1 minute' where auth_user_id=$1",
    [id(1)],
  );
  await actor(1);
  await query(
    "select workspace.unlock_performance_group($1,'new-secret-123')",
    [id(3)],
  );
  await query("select workspace.unlock_performance_group($1,'director-123')", [
    id(2),
  ]);
  check(
    (await visible()).length,
    5,
    "password retry works after throttle interval",
  );
  await root();
  await db.exec(
    "update workspace.performance_group_unlocks set expires_at=now()-interval '1 minute'",
  );
  await actor(1);
  check(
    await visible(),
    ["c"],
    "expired grants cannot read old protected scopes",
  );
  await root();
  await query(
    "update workspace.system_users set status='inactive' where id=$1",
    [id(1)],
  );
  await actor(1);
  check(await visible(), [], "inactive administrator cannot read records");
  console.log(
    `\n${checks} database checks passed; migrations executed against PostgreSQL with real RLS and pgcrypto.`,
  );
} catch (error) {
  console.error(error.message, error.detail || "", error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
