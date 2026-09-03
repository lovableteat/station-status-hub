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
  // Latest privacy migration must install its own guard even if the legacy
  // optional manager migration was skipped by an existing deployment.
  await db.exec(
    "drop trigger if exists guard_performance_review_self_update on workspace.performance_reviews",
  );
  if (process.argv[3]) {
    await db.exec(
      "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[])",
    );
    await db.exec(await fs.readFile(process.argv[3], "utf8"));
    check(
      (
        await query(
          "select count(*)::int as total from supabase_migrations.schema_migrations",
        )
      )[0].total,
      5,
      "deployment transaction verifies content and records all migration sources",
    );
  } else {
    await db.exec(
      await migration("20260903120000_add_performance_organization"),
    );
    await db.exec(await migration("20260903130000_protect_performance_groups"));
  }
  if (!process.argv[3]) {
    await db.exec(
      await migration("20260903160000_remove_performance_organization_members"),
    );
    await db.exec(
      await migration("20260903180000_allow_acting_performance_directors"),
    );
    await db.exec(
      await migration("20260903190000_add_direct_performance_review_workflow"),
    );
  }
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
  await assert.rejects(() => save(5, 2, "member"), /section name/);
  checks++;
  console.log("PASS director acting for a chief requires a named section");
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
    ["chief"],
    "director sees the direct chief, never the chief's employees",
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
  check(await visible(), [], "department director also needs section password");
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
  await query("select workspace.unlock_performance_group($1,'secret-123')", [
    id(3),
  ]);
  check(
    await visible(),
    ["chief"],
    "unlocked director still cannot read grandchild employee assessments",
  );
  check(
    (
      await query(
        "update workspace.performance_reviews set manager_feedback='skip chief' where id='a' returning id",
      )
    ).length,
    0,
    "director cannot edit a chief's employee assessment",
  );
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
  const removalVersion = (
    await query(
      "select updated_at from workspace.performance_org_members where employee_id=$1",
      [id(9)],
    )
  )[0].updated_at;
  const removeSql =
    "select workspace.remove_performance_organization_member($1,$2)";
  await actor(8);
  await rejects(
    removeSql,
    [id(9), removalVersion],
    "supervisor cannot remove organization classifications",
  );
  await actor(9);
  await rejects(
    removeSql,
    [id(9), removalVersion],
    "employee cannot remove their classification",
  );
  await actor(1);
  await rejects(
    "select workspace.save_performance_organization_member($1,$2,'','','2000-01-01'::timestamptz,'employee','member','')",
    [id(9), id(8)],
    "stale assignment cannot overwrite an existing organization member",
  );
  await rejects(
    "select workspace.save_performance_organization_member($1,$2,'','',null,'employee','member','')",
    [id(9), id(8)],
    "duplicate addition from another dropdown is rejected",
  );
  await rejects(
    removeSql,
    [id(9), "2000-01-01"],
    "stale removal does not remove a newer classification",
  );
  await query(
    "update workspace.performance_reviews set status='approved',manager_feedback='completed assessment' where id='c'",
  );
  const completedBefore = await query(
    "select reviewer_name,self_feedback,manager_feedback,status from workspace.performance_reviews where id='c'",
  );
  await query(removeSql, [id(9), removalVersion]);
  check(
    (
      await query(
        "select updated_at from workspace.get_performance_organization() where employee_id=$1",
        [id(9)],
      )
    )[0].updated_at,
    null,
    "removed member returns to the unassigned dropdown source",
  );
  check(
    await query(
      "select reviewer_name,self_feedback,manager_feedback,status from workspace.performance_reviews where id='c'",
    ),
    completedBefore,
    "removal retains completed review content and original reviewer",
  );
  await rejects(
    removeSql,
    [id(9), removalVersion],
    "repeating removal cannot act on an absent classification",
  );
  await actor(8);
  check(
    (await visible()).includes("c"),
    false,
    "removal does not reactivate legacy reviewer access to completed records",
  );
  await actor(1);
  await save(9, 8, "member");
  check(
    (
      await query(
        "select updated_at is not null as assigned from workspace.get_performance_organization() where employee_id=$1",
        [id(9)],
      )
    )[0].assigned,
    true,
    "re-added member disappears from the dropdown source again",
  );
  await actor(8);
  check(
    (await visible()).includes("c"),
    true,
    "re-adding restores the actual supervisor relationship",
  );
  await actor(1);
  const directorVersion = (
    await query(
      "select updated_at from workspace.performance_org_members where employee_id=$1",
      [id(2)],
    )
  )[0].updated_at;
  await rejects(
    removeSql,
    [id(2), directorVersion],
    "director with reports cannot be removed",
  );
  const chiefVersion = (
    await query(
      "select updated_at from workspace.performance_org_members where employee_id=$1",
      [id(3)],
    )
  )[0].updated_at;
  await root();
  const secretBefore = await query(
    "select password_hash,version from workspace.performance_group_secrets where owner_id=$1",
    [id(3)],
  );
  const accountBefore = await query(
    "select role, permissions - 'performanceManager' as permissions from workspace.system_users where id=$1",
    [id(3)],
  );
  await actor(1);
  await query(removeSql, [id(3), chiefVersion]);
  check(
    (await visible()).includes("chief"),
    false,
    "removing a supervisor preserves password protection even against administrators",
  );
  await rejects(
    "select * from workspace.performance_org_removed_members",
    [],
    "removal history is private to the database",
  );
  await root();
  check(
    await query(
      "select password_hash,version from workspace.performance_group_secrets where owner_id=$1",
      [id(3)],
    ),
    secretBefore,
    "removal never deletes or resets an existing group password",
  );
  check(
    await query(
      "select role, permissions - 'performanceManager' as permissions from workspace.system_users where id=$1",
      [id(3)],
    ),
    accountBefore,
    "removal preserves global role and other site permissions",
  );
  check(
    (
      await query(
        "select permissions->>'performanceManager' as manager from workspace.system_users where id=$1",
        [id(3)],
      )
    )[0].manager,
    "false",
    "removal revokes only the performance supervisor designation",
  );
  await actor(1);
  await save(10, 2, "member", "ignored department", "代理一課");
  check(
    (
      await query(
        "select manager_id,department,section,org_level from workspace.performance_org_members where employee_id=$1",
        [id(10)],
      )
    )[0],
    {
      manager_id: id(2),
      department: "研發部",
      section: "代理一課",
      org_level: "member",
    },
    "acting section uses the existing director account and inherits its department",
  );
  check(
    (
      await query(
        "select role,permissions from workspace.system_users where id=$1",
        [id(10)],
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
        custom: "preserve",
        performanceManager: false,
      },
    },
    "acting assignment preserves global permissions and keeps the employee role",
  );
  await actor(10);
  await query(
    "insert into workspace.performance_reviews(id,employee_id,employee_name,self_feedback) values ('acting',$1,'人員10','acting section evidence')",
    [id(10)],
  );
  check(
    (
      await query(
        "select reviewer_name from workspace.performance_reviews where id='acting'",
      )
    )[0].reviewer_name,
    "user2",
    "new self-assessment automatically routes to the acting director",
  );
  await actor(2);
  await query("select workspace.unlock_performance_group($1,'director-123')", [
    id(2),
  ]);
  check(
    (await visible()).includes("acting"),
    true,
    "acting director can read their direct employee review",
  );
  await query(
    "update workspace.performance_reviews set manager_feedback='director evaluation' where id='acting'",
  );
  check(
    (
      await query(
        "select manager_feedback from workspace.performance_reviews where id='acting'",
      )
    )[0].manager_feedback,
    "director evaluation",
    "acting director can evaluate the employee",
  );
  await assert.rejects(() => save(10, 4, "member"), /Administrator/);
  checks++;
  console.log("PASS acting director cannot edit organization assignments");
  await actor(4);
  check(
    (await visible()).includes("acting"),
    false,
    "other section chief cannot read an acting section",
  );
  await actor(1);
  check(
    (await visible()).includes("acting"),
    false,
    "acting director password also blocks the site administrator",
  );
  await save(5, 2, "member", "ignored", "代理二課");
  check(
    (
      await query(
        "select count(distinct section)::int as sections from workspace.performance_org_members where manager_id=$1 and org_level='member'",
        [id(2)],
      )
    )[0].sections,
    2,
    "one director can act for multiple named sections",
  );
  await save(2, null, "director", "研發二部");
  check(
    (
      await query(
        "select department,section from workspace.performance_org_members where employee_id=$1",
        [id(10)],
      )
    )[0],
    { department: "研發二部", section: "代理一課" },
    "department rename preserves the acting section name",
  );
  await actor(2);
  check(
    (await visible()).includes("a"),
    false,
    "moving to an acting director cannot bypass the previous chief password",
  );
  await actor(1);
  await save(10, 8, "member", "ignored", "ignored section");
  check(
    (
      await query(
        "select section from workspace.performance_org_members where employee_id=$1",
        [id(10)],
      )
    )[0].section,
    "產品課",
    "appointing a regular chief restores section inheritance",
  );
  await actor(8);
  check(
    (await visible()).includes("acting"),
    false,
    "new chief still needs the former acting director password",
  );
  await query("select workspace.unlock_performance_group($1,'director-123')", [
    id(2),
  ]);
  check(
    (
      await query(
        "select reviewer_name,manager_feedback from workspace.performance_reviews where id='acting'",
      )
    )[0],
    { reviewer_name: "user8", manager_feedback: "director evaluation" },
    "after unlock the new chief receives the open review without losing evaluation content",
  );
  // The section summary is a separate chief-authored document, without raw
  // employee assessment fields. Exercise the complete return/resubmit cycle.
  const reports = async () =>
    (
      await query(
        "select workspace.get_performance_section_reports('2026-q3') as reports",
      )
    )[0].reports;
  const reportSave = (content, submit, version = null) =>
    query(
      "select workspace.save_performance_section_report('2026-q3',$1,$2,$3) as id",
      [content, submit, version],
    );
  await actor(9);
  await assert.rejects(() => reportSave("forged", true));
  checks++;
  console.log("PASS employee cannot submit a chief summary");
  await actor(7);
  await assert.rejects(() => reportSave("forged", true));
  checks++;
  console.log("PASS director cannot impersonate a chief's summary");
  await actor(8);
  await query("select workspace.set_performance_group_password('summary-123')");
  const reportId = (await reportSave("本課成果與改善計畫", false))[0].id;
  const draftReport = (await reports())[0];
  check(
    draftReport.chief_id,
    id(8),
    "summary owner is derived from the authenticated chief",
  );
  check(
    draftReport.director_id,
    id(7),
    "summary is routed to the actual direct department director",
  );
  await assert.rejects(() => reportSave("duplicate", false));
  checks++;
  console.log(
    "PASS a duplicate or stale summary cannot overwrite an existing draft",
  );
  await actor(7);
  check(await reports(), [], "director cannot read an unsubmitted chief draft");
  await actor(8);
  await reportSave("本課成果與改善計畫", true, draftReport.updated_at);
  let submittedReport = (await reports())[0];
  check(
    submittedReport.status,
    "submitted",
    "chief can submit the summary for director review",
  );
  check(
    JSON.stringify(submittedReport).includes("private evidence"),
    false,
    "summary does not embed original employee assessment content",
  );
  await assert.rejects(() =>
    reportSave("rewrite sent", false, submittedReport.updated_at),
  );
  checks++;
  console.log("PASS sent summary is locked until the director returns it");
  await actor(9);
  check(await reports(), [], "employee cannot read chief summaries");
  await actor(4);
  check(
    await reports(),
    [],
    "sibling chief cannot read another chief's summary",
  );
  await actor(1);
  check(
    await reports(),
    [],
    "administrator cannot bypass the chief's summary password",
  );
  await rejects(
    "update workspace.performance_section_reports set status='approved' where id=$1",
    [reportId],
    "client cannot directly mutate summary workflow fields",
  );
  await actor(7);
  check(
    await reports(),
    [],
    "director must unlock a protected submitted summary",
  );
  await query("select workspace.unlock_performance_group($1,'summary-123')", [
    id(8),
  ]);
  check(
    (await reports()).length,
    1,
    "director receives the chief summary after unlocking",
  );
  check(
    (await visible()).includes("c"),
    false,
    "summary password does not expose the underlying employee assessment to the director",
  );
  const reportReview = (action, feedback, version) =>
    query("select workspace.review_performance_section_report($1,$2,$3,$4)", [
      reportId,
      action,
      feedback,
      version,
    ]);
  await rejects(
    "select workspace.review_performance_section_report($1,'return','',$2)",
    [reportId, submittedReport.updated_at],
    "returning a summary requires feedback",
  );
  await reportReview("return", "請補充改善時程", submittedReport.updated_at);
  await actor(8);
  const returnedReport = (await reports())[0];
  check(
    [returnedReport.status, returnedReport.director_feedback],
    ["returned", "請補充改善時程"],
    "chief receives the director's return and feedback",
  );
  await assert.rejects(() =>
    reportSave("stale", true, submittedReport.updated_at),
  );
  checks++;
  console.log("PASS old browser version cannot overwrite returned feedback");
  await reportSave("已補充改善時程", true, returnedReport.updated_at);
  submittedReport = (await reports())[0];
  await actor(1);
  await query("select workspace.unlock_performance_group($1,'summary-123')", [
    id(8),
  ]);
  check(
    (await reports()).length,
    1,
    "unlocked administrator may inspect the summary under existing policy",
  );
  await assert.rejects(() =>
    reportReview("approve", "", submittedReport.updated_at),
  );
  checks++;
  console.log(
    "PASS administrator cannot impersonate the assigned director's approval",
  );
  await actor(7);
  await reportReview("approve", "確認本課成果", submittedReport.updated_at);
  check(
    (await reports())[0].status,
    "approved",
    "director confirms the resubmitted summary",
  );
  await actor(8);
  const approvedReport = (await reports())[0];
  await assert.rejects(() =>
    reportSave("rewrite approved", false, approvedReport.updated_at),
  );
  checks++;
  console.log(
    "PASS completed summary cannot be silently rewritten by its chief",
  );
  await actor(1);
  await save(8, 2, "section_chief", "", "產品課");
  await save(8, 7, "section_chief", "", "產品課");
  await actor(7);
  check(
    await reports(),
    [],
    "reparenting a chief retains intermediate department password protection",
  );
  await query("select workspace.unlock_performance_group($1,'director-123')", [
    id(2),
  ]);
  check(
    (await reports())[0].summary,
    "已補充改善時程",
    "unlocking retained scopes restores the unchanged approved summary",
  );
  await root();
  await query(
    "update workspace.system_users set status='inactive' where id=$1",
    [id(1)],
  );
  await actor(1);
  check(await visible(), [], "inactive administrator cannot read records");
  check(
    await reports(),
    [],
    "inactive administrator cannot read section summaries",
  );
  console.log(
    `\n${checks} database checks passed; migrations executed against PostgreSQL with real RLS and pgcrypto.`,
  );
} catch (error) {
  console.error(error.message, error.detail || "", error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
