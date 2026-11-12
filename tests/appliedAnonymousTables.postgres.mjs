import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {fixture,snapshot,state,as,uid,read} from './fixtures/applied-anonymous-tables/database.mjs';

// Exact already-applied statements. Historical BEGIN/COMMIT and PENDING text
// remain immutable; these are fresh disposable fixtures, never a replay runner.
const auditCut=await read('../../../supabase/migrations/20261112073038_restrict_anonymous_test_progress_audit_access.sql');
const tasksCut=await read('../../../supabase/migrations/20261112073518_restrict_anonymous_tasks_access.sql');
assert.equal(createHash('sha256').update(auditCut).digest('hex'),'5ba847e461c80f9f73f55868f4e0fb56464e87d4a3a00bc1d52c2d4f842d3d49');
assert.equal(createHash('sha256').update(tasksCut).digest('hex'),'144d4ae5ba3667adcb3ddcbf10a408a360c0055114aecb7e37c8bc4b00351c64');
const retired=await read('../../../docs/security-proposals/anonymous-table-rollback-RETIRED.sql');
async function rejected(db,sql,pattern){
 const rows=await snapshot(db),metadata=await state(db);
 await assert.rejects(db.exec(sql),pattern);
 await assert.rejects(db.query('select 1'),error=>error.code==='25P02');
 await db.exec('rollback');
 assert.deepEqual(await snapshot(db),rows);assert.deepEqual(await state(db),metadata);
}
async function changedOnlyAnonACL(db,cut,table){
 const rows=await snapshot(db),original=await state(db);await db.exec(cut);
 const actual=await state(db),expected=structuredClone(original);
 expected.acl.find(row=>row.name===`workspace.${table}`).acl=expected.acl.find(row=>row.name===`workspace.${table}`).acl.filter(entry=>!entry.startsWith('anon='));
 assert.deepEqual(actual,expected);assert.deepEqual(await snapshot(db),rows);
}
async function driftCase(sql,drift,pattern){
 const db=await fixture();try{await db.exec(drift);await rejected(db,sql,pattern);}finally{await db.close();}
}

test('Applied progress-audit ACL preserves all data and captured definer/trigger behavior',async t=>{
 const db=await fixture();
 try {
  console.log((await db.query('select version()')).rows[0].version);
  const before=await snapshot(db);
  await t.test('Exact statement changes only anon audit ACL, not any row, policy, definition, trigger or publication',async()=>changedOnlyAnonACL(db,auditCut,'test_progress_audit'));
  await t.test('Anonymous SELECT/INSERT/UPDATE/DELETE/TRUNCATE reject without changing any data',async()=>{
   for(const sql of ['select id from workspace.test_progress_audit limit 0',`insert into workspace.test_progress_audit(id) values('${uid(9)}')`,'update workspace.test_progress_audit set id=id where false','delete from workspace.test_progress_audit where false','truncate workspace.test_progress_audit'])await assert.rejects(as(db,'anon',sql),error=>error.code==='42501');
   assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Authenticated and service retain direct audit CRUD',async()=>{
   for(const caller of ['authenticated','service_role']) {
    await db.exec('begin');try {
     assert.equal((await as(db,caller,'select count(*)::int n from workspace.test_progress_audit')).rows[0].n,1);
     await as(db,caller,'update workspace.test_progress_audit set id=id');await as(db,caller,'delete from workspace.test_progress_audit');
     await as(db,caller,`insert into workspace.test_progress_audit(system_id,station_id,item_id,change_type) values('${uid(2)}','${uid(3)}','${uid(4)}','synthetic-manual')`);
    }finally{await db.exec('rollback');}assert.deepEqual(await snapshot(db),before);
   }
  });
  await t.test('Both captured login aliases retain successful/failed audit writes for all original caller roles',async()=>{
   await db.exec('begin');try {
    for(const caller of ['anon','authenticated','service_role'])for(const schema of ['public','workspace']) {
     assert.equal((await as(db,caller,`select success from ${schema}.authenticate_user(' SYNTHETIC-USER ','fixture-only')`)).rows[0].success,true);
     assert.equal((await as(db,caller,`select success from ${schema}.authenticate_user('synthetic-user','wrong-fixture')`)).rows[0].success,false);
    }
    assert.equal((await db.query('select count(*)::int n from workspace.login_audit')).rows[0].n,13);
   }finally{await db.exec('rollback');}assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Captured progress trigger keeps automatic audit writes for anon/authenticated/service base-table operations',async()=>{
   await db.exec('begin');try {
    await as(db,'anon',`insert into workspace.test_progress(id,system_id,station_id,item_id,started_at,status,actual_hours) values('${uid(7)}','${uid(2)}','${uid(3)}','${uid(4)}',now(),'On-going',0)`);
    await as(db,'authenticated',`update workspace.test_progress set completed_at=now(),status='Done',actual_hours=1 where id='${uid(7)}'`);
    await as(db,'service_role',`delete from workspace.test_progress where id='${uid(7)}'`);
    assert.equal((await db.query('select count(*)::int n from workspace.test_progress_audit')).rows[0].n,4);
   }finally{await db.exec('rollback');}assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Both captured delete aliases retain authenticated/service cleanup and original delete-trigger audit semantics',async()=>{
   for(const caller of ['authenticated','service_role'])for(const schema of ['public','workspace']) {
    await db.exec('begin');try {
     await db.exec(`insert into workspace.test_systems values('${uid(2)}');insert into workspace.issues values('${uid(21)}','${uid(2)}');insert into workspace.issue_attachments values('${uid(22)}','${uid(21)}');insert into workspace.dashboard_item_exclusions values('${uid(23)}','${uid(2)}');insert into workspace.station_time_records values('${uid(24)}','${uid(2)}');insert into workspace.station_time_settings values('${uid(25)}','${uid(2)}');insert into workspace.test_progress(system_id,station_id,item_id,started_at,status) values('${uid(2)}','${uid(3)}','${uid(4)}',now(),'On-going');`);
     await as(db,caller,`select ${schema}.delete_test_system('${uid(2)}')`);
     for(const table of ['test_systems','issues','issue_attachments','dashboard_item_exclusions','station_time_records','station_time_settings','test_progress'])assert.equal((await db.query(`select count(*)::int n from workspace.${table}`)).rows[0].n,0,table);
     assert.equal((await db.query("select count(*)::int n from workspace.test_progress_audit where change_type='delete'")).rows[0].n,1);
    }finally{await db.exec('rollback');}
   }
   await assert.rejects(as(db,'anon',`select workspace.delete_test_system('${uid(2)}')`),error=>error.code==='42501');assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Already-applied audit statement rejects replay without restoring anonymous access',async()=>rejected(db,auditCut,/Preflight failed/));
  await t.test('Retired recovery entry refuses before any grant or data mutation',async()=>rejected(db,retired,/retired/i));
  await t.test('Late audit-stage failure rolls back all ACL effects and preserves exact rows',async()=>{
   const temp=await fixture();try{await rejected(temp,auditCut.replace(/commit;\s*$/,'select 1/0;\ncommit;\n'),/division by zero/);}finally{await temp.close();}
  });
  for(const [label,drift] of [
   ['PUBLIC privilege','grant select on workspace.test_progress_audit to public'],
   ['column privilege','grant select(id) on workspace.test_progress_audit to anon'],
   ['inherited role','create role extra_reader;grant extra_reader to anon'],
   ['policy drift','alter policy "Allow anonymous access to test_progress_audit" on workspace.test_progress_audit using(false)'],
   ['authenticated grant loss','revoke update on workspace.test_progress_audit from authenticated'],
   ['trigger definer drift','alter function public.log_test_progress_changes() security invoker'],
   ['publication drift','alter publication supabase_realtime add table workspace.test_progress_audit'],
   ['view dependency','create view workspace.unreviewed_audit as select id from workspace.test_progress_audit'],
   ['writer trigger drift','alter table workspace.test_progress disable trigger log_test_progress_trigger'],
   ['unexpected function dependency','create function workspace.unreviewed_audit() returns bigint language sql as $$select count(*) from workspace.test_progress_audit$$']
  ])await t.test('Audit preflight rejects '+label,()=>driftCase(auditCut,drift,/Preflight failed|Audit .*drift|Unexpected audit/));
 }finally{await db.close();}
});

test('Applied tasks ACL preserves normal work, FK, existing grants and Realtime configuration',async t=>{
 const db=await fixture();
 try {
  await db.exec(auditCut);const before=await snapshot(db);
  await t.test('Exact tasks statement changes only anon tasks ACL with audit boundary already closed',async()=>changedOnlyAnonACL(db,tasksCut,'tasks'));
  await t.test('Anonymous task table and column reads/writes/truncate reject',async()=>{
   for(const sql of ['select id from workspace.tasks limit 0',"insert into workspace.tasks(title) values('blocked')",'update workspace.tasks set title=title where false','delete from workspace.tasks where false','truncate workspace.tasks'])await assert.rejects(as(db,'anon',sql),error=>error.code==='42501');
   assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Authenticated/service/owner task CRUD remains available',async()=>{
   for(const caller of ['authenticated','service_role','postgres']) {
    await db.exec('begin');try {
     assert.equal((await as(db,caller,'select count(*)::int n from workspace.tasks')).rows[0].n,1);
     await as(db,caller,"insert into workspace.tasks(title,column_id) values('new synthetic',null)");await as(db,caller,"update workspace.tasks set description='updated synthetic'");await as(db,caller,'delete from workspace.tasks');
    }finally{await db.exec('rollback');}assert.deepEqual(await snapshot(db),before);
   }
  });
  await t.test('Existing parent-column ON DELETE SET NULL behavior remains including anon parent delete',async()=>{
   for(const caller of ['anon','authenticated','service_role']) {
    await db.exec('begin');try {await as(db,caller,`delete from workspace.columns where id='${uid(1)}'`);assert.equal((await db.query(`select column_id from workspace.tasks where id='${uid(2)}'`)).rows[0].column_id,null);}finally{await db.exec('rollback');}
   }assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Already-applied tasks statement refuses replay and retired recovery cannot reopen either table',async()=>{
   await rejected(db,tasksCut,/drift/);await rejected(db,retired,/retired/i);
   for(const table of ['tasks','test_progress_audit'])assert.equal((await db.query(`select has_table_privilege('anon','workspace.${table}','SELECT') allowed`)).rows[0].allowed,false);
  });
  await t.test('Late tasks-stage failure preserves rows and applied audit denial without partial task ACL mutation',async()=>{
   const temp=await fixture();try{await temp.exec(auditCut);await rejected(temp,tasksCut.replace(/commit;\s*$/,'select 1/0;\ncommit;\n'),/division by zero/);}finally{await temp.close();}
  });
  for(const [label,drift] of [
   ['PUBLIC grant','grant select on workspace.tasks to public'],['column grant','grant select(id) on workspace.tasks to anon'],
   ['role inheritance','create role extra_reader;grant extra_reader to anon'],
   ['policy drift','alter policy "Allow anonymous access to tasks" on workspace.tasks using(false)'],
   ['authenticated ACL loss','revoke update on workspace.tasks from authenticated'],
   ['publication loss','alter publication supabase_realtime drop table workspace.tasks'],
   ['anonymous Realtime subscriber',"insert into realtime.subscription values('workspace.tasks'::regclass,'anon'::regrole)"],
   ['business trigger',"create function workspace.extra_trigger() returns trigger language plpgsql as $$begin return new;end$$;create trigger extra before insert on workspace.tasks for each row execute function workspace.extra_trigger()"],
   ['function dependency','create function workspace.unexpected_task_reader() returns bigint language sql as $$select count(*) from workspace.tasks$$']
  ])await t.test('Tasks preflight rejects '+label,()=>driftCase(tasksCut,drift,/drift|anonymous Realtime/));
  await t.test('Authenticated Realtime subscription and effective SELECT survive with publication/filter unchanged',async()=>{
   const temp=await fixture();try {
    await temp.exec("insert into realtime.subscription values('workspace.tasks'::regclass,'authenticated'::regrole)");
    const beforeRows=await snapshot(temp),publication=(await state(temp)).publications;
    await temp.exec(tasksCut);assert.equal((await temp.query("select has_table_privilege('authenticated','workspace.tasks','SELECT') allowed")).rows[0].allowed,true);
    assert.deepEqual((await state(temp)).publications,publication);assert.deepEqual(await snapshot(temp),beforeRows);
   }finally{await temp.close();}
  });
 }finally{await db.close();}
});
