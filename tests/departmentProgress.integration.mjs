// The actual RPC runs in isolated PostgreSQL; no real assessment is modified.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2] || 'node_modules/@electric-sql/pglite', 'dist/index.js')));
const db = await PGlite.create();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
const actor = async n => { await db.exec('reset role; set role authenticated'); await q("select set_config('test.actor',$1,false),set_config('test.unlocked','true',false)",[id(n)]); };
const read = async () => (await q("select workspace.get_performance_department_progress('2026-q3') as data"))[0].data;
try {
  await db.exec(`create schema workspace; create role anon; create role authenticated;
    grant usage on schema workspace to anon,authenticated;
    create role service_role;
    create table workspace.system_users(id uuid primary key, display_name text, username text, status text, permissions jsonb);
    create table workspace.performance_org_members(employee_id uuid primary key, manager_id uuid, org_level text, performance_role text, department text, section text);
    create table workspace.performance_reviews(id text primary key, employee_id text, cycle_id text, status text, updated_at timestamptz, score numeric, manager_feedback text);
    create table workspace.performance_section_reports(id uuid primary key, chief_id uuid, cycle_id text, status text, summary text);
    create function workspace.current_system_user_id() returns uuid language sql stable as $$ select current_setting('test.actor',true)::uuid $$;
    create function workspace.current_user_can_workspace(text,text) returns boolean language sql stable as $$ select true $$;
    create function workspace.current_user_is_performance_manager() returns boolean language sql stable as $$ select exists(select 1 from workspace.performance_org_members where employee_id=workspace.current_system_user_id() and performance_role='manager' and org_level in ('director','section_chief')) $$;
    create function workspace.performance_scopes_unlocked(uuid[]) returns boolean language sql stable as $$ select current_setting('test.unlocked',true)='true' $$;
    create function workspace.resolve_performance_employee(text) returns uuid language sql stable as $$ select id from workspace.system_users where id::text=$1 or username=$1 $$;
  `);
  for (let n=1;n<=12;n++) await q("insert into workspace.system_users values($1,$2,$3,'active','{}')",[id(n),`人員${n}`,`user${n}`]);
  for (const [n,parent,level,role] of [[1,null,'director','manager'],[2,1,'section_chief','manager'],[3,1,'section_chief','manager'],[4,2,'member','employee'],[5,2,'member','employee'],[6,3,'member','employee'],[7,null,'director','manager'],[8,7,'section_chief','manager'],[9,8,'member','employee'],[10,3,'member','employee'],[11,2,'member','none']]) {
    await q('insert into workspace.performance_org_members values($1,$2,$3,$4,$5,$6)',[id(n),parent?id(parent):null,level,role,'研發部',`課${parent||n}`]);
  }
  await q("update workspace.system_users set status='inactive' where id=$1",[id(10)]);
  for (const [key,n,cycle,status,date] of [['a',4,'2026-q3','approved','2026-10-01'],['b',5,'2026-q3','submitted','2026-10-01'],['old',5,'2026-q3','draft','2026-09-30'],['c',9,'2026-q3','approved','2026-10-01'],['inactive',10,'2026-q3','approved','2026-10-01'],['prior',6,'2026-q2','approved','2026-07-01']]) {
    await q("insert into workspace.performance_reviews values($1,$2,$3,$4,$5,95,'PRIVATE')",[key,key==='old'?id(n):`user${n}`,cycle,status,date]);
  }
  await q("insert into workspace.performance_section_reports values($1,$2,'2026-q3','draft','PRIVATE DRAFT')",[id(99),id(2)]);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261005074748_add_department_appraisal_progress.sql',import.meta.url),'utf8'));
  await actor(1);
  const progress = await read();
  assert.equal(progress.length,2,'director sees both assigned chiefs before any report is sent');
  const first=progress.find(r=>r.chief_id===id(2));
  assert.equal(first.total_members,2);
  assert.equal(first.completed_members,1);
  assert.equal(first.awaiting_members,1,'UUID and username versions count latest review once');
  assert.equal(first.drafting_members,0);
  assert.equal(first.report_status,'not_submitted');
  assert.equal(progress.find(r=>r.chief_id===id(3)).not_started_members,1,'wrong cycle and inactive member are excluded');
  assert.doesNotMatch(JSON.stringify(progress),/PRIVATE|95|manager_feedback|score|summary|000000000099/,'no individual ratings or draft details escape');
  await actor(2); assert.deepEqual((await read()).map(r=>r.chief_id),[id(2)],'chief sees only own section');
  await actor(7); assert.deepEqual((await read()).map(r=>r.chief_id),[id(8)],'other director sees only own hierarchy');
  await actor(4); assert.deepEqual(await read(),[],'ordinary employee cannot read department counts');
  await actor(12); assert.deepEqual(await read(),[],'account without manager organization gets no counts');
  await actor(1); await q("select set_config('test.unlocked','false',false)");
  await assert.rejects(read,/Unlock/,'locked director cannot read counts');
  await db.exec('reset role');
  await db.exec(`alter table workspace.performance_reviews add self_feedback text, add reviewer_name text, add privacy_scope_ids uuid[];
    create function workspace.performance_org_ancestors(uuid) returns uuid[] language sql stable as $$ select array[]::uuid[] $$;
    create or replace function workspace.performance_scopes_unlocked(uuid[]) returns boolean language sql stable as $$
      select current_setting('test.unlocked',true)='true' and not coalesce(current_setting('test.locked',true)=any($1::text[]),false) $$;`);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261005135104_add_director_completed_score_results.sql',import.meta.url),'utf8'));
  await q('update workspace.performance_reviews set self_feedback=$1, manager_feedback=$2, reviewer_name=$3, privacy_scope_ids=$4',[
    'RD2_SELF_V1\n'+JSON.stringify({employeeNumber:'E004',grade:'29',attachments:['PRIVATE FILE'],sections:{IDP:{selfScore:100}}}),
    'RD2_MANAGER_V1\n'+JSON.stringify({feedback:'PRIVATE FEEDBACK',categoryReviews:{IDP:{score:90},OKR:{score:80},KPI:{score:70}}}),
    '課長甲',[id(2)]
  ]);
  await actor(1);
  const scores = async () => (await q("select workspace.get_performance_department_results('2026-q3') as data"))[0].data;
  let results=await scores();
  assert.equal(results.length,2);
  const result=results.find(r=>r.chief_id===id(2)).results[0];
  assert.equal(result.employee_name,'人員4','uses current display name');
  assert.equal(result.total_score,95,'uses saved manager total, never employee score or assumed weight');
  assert.deepEqual(result.category_scores,{IDP:90,OKR:80,KPI:70});
  assert.equal(result.job_grade,'29'); assert.equal(result.employee_number,'E004');
  assert.doesNotMatch(JSON.stringify(results),/PRIVATE|selfScore|self_feedback|manager_feedback|user9/,'minimal payload excludes raw assessment and other departments');
  await q("select set_config('test.locked',$1,false)",[id(2)]);
  results=await scores();
  assert.equal(results.find(r=>r.chief_id===id(2)).results.length,0,'record scope is required');
  assert.equal(results.find(r=>r.chief_id===id(2)).locked_results,1,'locked result is distinguished from empty');
  await q("select set_config('test.locked','',false)");
  await actor(2); assert.deepEqual((await scores()).map(r=>r.chief_id),[id(2)]);
  await actor(7); assert.deepEqual((await scores()).map(r=>r.chief_id),[id(8)]);
  await actor(4); assert.deepEqual(await scores(),[]);
  await actor(1);
  await db.exec('reset role');
  await q("insert into workspace.performance_reviews(id,employee_id,cycle_id,status,updated_at) values('new-return',$1,'2026-q3','in-progress','2026-10-05')",[id(4)]);
  await actor(1); assert.equal((await scores()).find(r=>r.chief_id===id(2)).results.length,0,'new returned review hides older completed result');
  await q("select set_config('test.unlocked','false',false)");
  await assert.rejects(scores,/Unlock/);
  await db.exec('reset role'); await q("update workspace.system_users set status='inactive' where id=$1",[id(1)]);
  await actor(1); await assert.rejects(read,/access required/,'inactive account is denied');
  await assert.rejects(scores,/access required/);
  await db.exec('reset role; set role anon'); await assert.rejects(read,/permission denied/,'anonymous callers have no execution grant');
  await assert.rejects(scores,/permission denied/);
  await db.exec('reset role');
  assert.equal((await q('select status from workspace.performance_section_reports'))[0].status,'draft','read does not submit a report');
  console.log('PASS director/chief completed scores, canonical totals, current names, latest review, cycle, minimal payload, group locks, inactive and anonymous access; existing progress');
} finally { await db.close(); }
