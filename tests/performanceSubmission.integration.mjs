// Run with an isolated PGlite install; no production account or database used.
// node tests/performanceSubmission.integration.mjs <path-to-pglite-package>
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
      6,
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
    await db.exec(
      await migration("20260907120000_add_performance_self_context"),
    );
  }

  await actor(1);
  await save(2, null, "director");
  await save(3, 2, "section_chief", "研發部", "韌體課");
  await save(4, 2, "section_chief", "研發部", "硬體課");
  await save(5, 3, "member");
  await save(6, 4, "member");
  await root();
  await db.exec(`create table workspace.user_notifications (
    id uuid primary key default gen_random_uuid(), recipient_id uuid not null,
    sender_id uuid not null, notification_type varchar(50) not null,
    title text not null, message text not null, reference_type varchar(50),
    reference_id uuid, metadata jsonb default '{}', is_read boolean default false,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    archived_at timestamptz,
    category text default 'general' check (category in ('mention','system','task','issue','test','general')),
    priority text default 'normal' check (priority in ('low','normal','high','urgent')),
    status text default 'pending'
  ); grant select,insert,update on workspace.user_notifications to authenticated;`);
  await db.exec(await migration("20260907130000_restrict_performance_scores_to_assigned_supervisors"));
  await db.exec(await migration("20260916100000_atomic_performance_return_notifications"));
  await db.exec(await migration("20260916133000_fix_performance_return_notification_reference_type"));
  await db.exec(await migration("20260916170000_verified_assessment_submission"));
  await db.exec("delete from workspace.performance_reviews where id='legacy'");
  const reviewId = 'performance-10000000-0000-4000-8000-000000000005';
  const baseReview = { id:reviewId, cycle_id:'2026-q3', employee_id:id(5), employee_name:'測試員工',
    department:'研發部',role:'工程師',due_date:'2026-09-30',goals:[],self_feedback:'第一版自評' };
  const managerPayload = {...baseReview,manager_feedback:'請補充測試證據',score:88};
  let request=100;
  const submit = async (payload,mode,action,version=null,requestId=id(++request)) =>
    (await query('select workspace.submit_performance_assessment($1,$2,$3,$4,$5) as result',
      [requestId,payload,mode,action,version]))[0].result;
  await actor(5);
  let response = await submit(baseReview,'self','submit');
  check(response.review.status,'submitted','employee submits a prefixed TEXT review ID');
  check(response.review.score,null,'employee response contains no supervisor score');
  await actor(3);
  response = await submit(managerPayload,'manager','return',response.review.updated_at);
  check(response.review.status,'in-progress','assigned supervisor returns the review');
  check(!!response.notification_id,true,'return is confirmed only with committed notification ID');
  const firstNotice=response.notification_id;
  await actor(5);
  let notices=await query('select * from workspace.user_notifications');
  check(notices.length,1,'employee receives exactly one return notice through real RLS');
  check(notices[0].reference_id,null,'text review ID is never forced into UUID reference column');
  check(notices[0].metadata.review_id,reviewId,'notice links to exact text review ID');
  check(/score|manager_feedback|88/.test(JSON.stringify(notices[0])),false,'notice contains no ratings');
  await actor(6);
  check((await query('select * from workspace.user_notifications')).length,0,'another employee cannot see the return notice');
  await actor(1);
  check((await query('select * from workspace.user_notifications')).length,0,'administrator cannot see employee return notice');
  await assert.rejects(()=>submit(managerPayload,'manager','return',response.review.updated_at)); checks++;
  await actor(3);
  response = await submit(managerPayload,'manager','return',response.review.updated_at);
  check(response.notification_id,firstNotice,'repeated return reuses unread notice');
  const oldVersion=response.review.updated_at;
  await actor(5);
  const resubmission={...baseReview,self_feedback:'第二版自評，已附證據',score:0,manager_feedback:'overwrite attack'};
  const retryId=id(++request);
  response=await submit(resubmission,'self','submit',oldVersion,retryId);
  check(response.review.status,'submitted','employee resubmits after return');
  check(response.review.manager_feedback,'','employee confirmation hides manager assessment');
  const retry=await submit(resubmission,'self','submit',oldVersion,retryId);
  check(retry.review.updated_at,response.review.updated_at,'lost response retry returns same committed version');
  await actor(3);
  let stored=(await query('select score,manager_feedback from workspace.performance_reviews where id=$1',[reviewId]))[0];
  check(Number(stored.score),88,'self resubmission preserves private supervisor score');
  check(stored.manager_feedback,'請補充測試證據','self resubmission cannot overwrite supervisor feedback');
  await assert.rejects(()=>submit(managerPayload,'manager','return',oldVersion),/另一個視窗/); checks++;
  response=await submit({...managerPayload,score:92,manager_feedback:'複驗完成'},'manager','submit',response.review.updated_at);
  check(response.review.status,'approved','supervisor completes resubmitted assessment');
  await actor(5);
  await assert.rejects(()=>submit(baseReview,'self','submit',response.review.updated_at),/考核已完成/); checks++;
  await actor(4);
  await assert.rejects(()=>submit(managerPayload,'manager','return',response.review.updated_at)); checks++;
  await actor(3);
  response=await submit(managerPayload,'manager','return',response.review.updated_at);
  check(response.review.status,'in-progress','supervisor can return an approved assessment for correction');
  // Force a real insertion failure in an isolated database. Return must roll back.
  await actor(5);
  response=await submit(baseReview,'self','submit',response.review.updated_at);
  await root();
  await db.exec("update workspace.user_notifications set is_read=true; alter table workspace.user_notifications add constraint test_delivery_failure check (notification_type <> 'performance_review_returned') not valid");
  await actor(3);
  await assert.rejects(()=>submit(managerPayload,'manager','return',response.review.updated_at)); checks++;
  check((await query('select status from workspace.performance_reviews where id=$1',[reviewId]))[0].status,'submitted','notification failure rolls back return, no half-success');
  await root();
  await db.exec('alter table workspace.user_notifications drop constraint test_delivery_failure');
  await actor(3);
  response=await submit(managerPayload,'manager','return',response.review.updated_at);
  check(response.review.status,'in-progress','same return succeeds after delivery service recovers');
  // Repeat the full cycle to prove the fix is not a one-off first submission.
  for(let round=0;round<2;round++) {
    await actor(5); response=await submit({...baseReview,self_feedback:'復驗 '+round},'self','submit',response.review.updated_at);
    await actor(3); response=await submit(managerPayload,'manager','return',response.review.updated_at);
    check(!!response.notification_id,true,'repeat full submit/return cycle '+(round+1));
  }
  // Exercise chief/director summaries under the same latest privacy policies.
  const reports = async () => (await query("select workspace.get_performance_section_reports('2026-q3') as rows"))[0].rows;
  const saveSummary = (text, version = null) => query("select workspace.save_performance_section_report('2026-q3',$1,true,$2)", [text, version]);
  await actor(5);
  await assert.rejects(() => saveSummary('forged employee summary')); checks++;
  await actor(3);
  await saveSummary('本課測試成果');
  let summary = (await reports())[0];
  check(summary.status, 'submitted', 'chief submits summary with latest privacy policies');
  await actor(4);
  check((await reports()).some(row => row.id === summary.id), false, 'another chief cannot read this summary');
  await actor(2);
  check((await reports()).some(row => row.id === summary.id), true, 'assigned director can read submitted summary');
  await query("select workspace.review_performance_section_report($1,'return','請補量化成果',$2)", [summary.id, summary.updated_at]);
  await actor(3);
  const returnedSummary = (await reports())[0];
  check(returnedSummary.status, 'returned', 'director return reaches chief');
  check(returnedSummary.director_feedback, '請補量化成果', 'chief sees director return reason');
  await assert.rejects(() => saveSummary('stale overwrite', summary.updated_at)); checks++;
  await saveSummary('補充後本課成果', returnedSummary.updated_at);
  summary = (await reports())[0];
  await actor(2);
  await query("select workspace.review_performance_section_report($1,'approve','確認完成',$2)", [summary.id, summary.updated_at]);
  check((await reports()).find(row => row.id === summary.id).status, 'approved', 'director approves resubmitted summary');
  console.log(`\n${checks} actual PostgreSQL workflow checks passed.`);
} catch(error) {
  console.error(error.message,error.detail||'',error.where||'');
  process.exitCode=1;
} finally { await db.close(); }
