import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture,addAccount,as,snapshot,metadata,uid,fields,read } from './fixtures/legacy-pcb-security/database.mjs';
import { installSequenceContext } from './fixtures/legacy-pcb-security/sequence-database.mjs';
const additive=await read('../../../docs/security-proposals/legacy-pcb/01-add-read-apis-PENDING.sql');
const appliedVersion='20261112064452';
const appliedName='add_protected_profile_and_legacy_pcb_read_apis';
const appliedAdditive=await read('../../../supabase/migrations/'+appliedVersion+'_'+appliedName+'.sql');
const appliedVerifier=await read('../../../docs/security-proposals/legacy-pcb/verify-applied-read-apis.sql');
const ledgerRows=async db=>(await db.query('select * from supabase_migrations.schema_migrations order by version')).rows;
// Throwaway fixtures only: model the migration service transaction + ledger write.
async function applyRecordedAdditive(db,version=appliedVersion) {
 await db.exec('begin');
 try {
  await db.exec(appliedAdditive);
  await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[version,appliedName,[appliedAdditive]]);
  await db.exec('commit');
 } catch(error) {await db.exec('rollback');throw error;}
}
const enforcement=await read('../../../docs/security-proposals/legacy-pcb/02-close-raw-permissions-PENDING.sql');
const narrow=await read('../../../docs/security-proposals/pcb-rpc-cutover-PENDING.sql');
import { isolatedEnforcementBody } from './fixtures/legacy-pcb-security/release-gate.mjs';
const body=isolatedEnforcementBody(enforcement);
const stage01=await read('../../../docs/security-proposals/01-close-anonymous-access.sql');
const stationOnly=await read('../../../docs/security-proposals/02-bind-station-delete-identities-after-pcb.sql');
const stage03=await read('../../../docs/security-proposals/03-private-attachments.sql');
const rawSnapshot=n=>({projects:[{id:'project-'+n,updatedAt:'2026-01-01T00:00:00Z',name:'Synthetic board '+n}],library:[{id:'component-'+n,name:'Synthetic part '+n,source:n%2?'custom':'bom'},{id:'builtin-'+n,source:'built-in'}],templates:[{id:'PRIVATE-TEMPLATE-'+n}],activeProjectId:'project-'+n,pendingPlacementsByProject:{['project-'+n]:[{private:'PRIVATE-PENDING-'+n}]},modelAssets:{['PRIVATE-MODEL-'+n]:{}},unknownPrivate:'PRIVATE-UNKNOWN-'+n,remoteDeletions:{projects:['deleted-project-'+n],library:['deleted-component-'+n],templates:['PRIVATE-TOMBSTONE-'+n]},updatedAt:'2026-01-01T00:00:00Z'});
async function seeded() {
 const db=await fixture();
 for(let id=1;id<=5;id++)await addAccount(db,id,{role:id===4?'admin':'engineer',status:id===5?'disabled':'active',permissions:{workspaceAccess:{'pcb-designer':id===3?'none':id===2?'view':'edit','station-status':'edit','material-requests':'none','data-center':'none'},pagePermissions:['dashboard_view'],performanceManager:false,unknown:{nested:[false,null,0,'中文',{pcbDesignerWorkspace:'nested-key-stays'}]},explicitNull:null,pcbDesignerWorkspace:rawSnapshot(id)}});
 await addAccount(db,6,{auth:null});await addAccount(db,7,{access:'edit'});await addAccount(db,8,{role:'super_admin'});
 for(const [id,value] of [[9,null],[10,[]],[15,['pcbDesignerWorkspace']],[16,false],[17,'scalar']])await addAccount(db,id,{permissions:value});
 for(const [id,value] of [[11,null],[12,'malformed scalar'],[13,[]],[14,{projects:'not-an-array',library:[],updatedAt:'now'}]])await addAccount(db,id,{permissions:{workspaceAccess:{'pcb-designer':'view'},pcbDesignerWorkspace:value}});
 await addAccount(db,18,{role:'admin'});await db.exec(`update workspace.system_users set permissions=null where id='${uid(18)}'`);
 return db;
}
async function rejected(db,sql,pattern) {
 const data=await snapshot(db),config=await metadata(db);
 try {await assert.rejects(db.exec(sql),pattern);} finally {await db.exec('rollback');}
 assert.deepEqual(await snapshot(db),data);assert.deepEqual(await metadata(db),config);
}

test('Protected legacy APIs and isolated raw-column enforcement preserve all source data',async t=>{
 const db=await seeded();
 try {
  console.log((await db.query('select version()')).rows[0].version);
  const before=await snapshot(db);
  await t.test('Original raw grant exposes five synthetic object snapshots to a non-PCB account',async()=>{
   assert.equal((await as(db,'authenticated',103,"select count(*)::int n from workspace.system_users where jsonb_typeof(permissions->'pcbDesignerWorkspace')='object' and id <= '"+uid(5)+"'")).rows[0].n,5);
  });
  await t.test('Additive API stage preserves every row, column grant and all five distinct snapshots',async()=>{
   const columns=(await metadata(db)).columns;
   await db.exec(additive);assert.deepEqual(await snapshot(db),before);assert.deepEqual((await metadata(db)).columns,columns);
  });
  await t.test('Roster has exact sixteen columns, filters/orders, and preserves all other fifteen values and JSON shapes',async()=>{
   const rows=(await as(db,'authenticated',103,'select * from workspace.list_system_user_profiles() order by id')).rows;
   assert.equal(rows.length,before.system_users.length);
   for(let index=0;index<rows.length;index++) {
    assert.deepEqual(Object.keys(rows[index]),fields);
    const original=before.system_users[index].data;
    for(const field of fields) {
     let expected=original[field];
     if(field==='permissions'&&expected&&typeof expected==='object'&&!Array.isArray(expected)){expected=structuredClone(expected);delete expected.pcbDesignerWorkspace;}
     const actual=rows[index][field];
     assert.deepEqual(actual instanceof Date?actual.getTime():actual,actual instanceof Date?new Date(expected).getTime():expected,field);
    }
   }
   assert.equal((await as(db,'authenticated',103,`select id from workspace.list_system_user_profiles() where id='${uid(2)}' order by created_at desc`)).rows.length,1);
   const nulls=(await as(db,'authenticated',103,`select id,permissions is null sql_null,jsonb_typeof(permissions) json_type from workspace.list_system_user_profiles() where id in ('${uid(9)}','${uid(18)}') order by id`)).rows;
   assert.deepEqual(nulls.map(x=>[x.sql_null,x.json_type]),[[false,'null'],[true,null]]);
  });
  for(const [role,identity,label] of [['anon',null,'anon'],['service_role',104,'service-role'],['authenticated',null,'no subject'],['authenticated',999,'unmapped'],['authenticated',105,'disabled'],['authenticated',1,'wrong identity domain']])
   await t.test('Profile denies '+label,async()=>assert.rejects(as(db,role,identity,'select * from workspace.list_system_user_profiles()'),e=>e.code==='42501'));
  for(const [role,identity,label] of [['anon',null,'anon'],['service_role',104,'service-role'],['authenticated',null,'no subject'],['authenticated',999,'unmapped'],['authenticated',103,'non-PCB'],['authenticated',105,'disabled'],['authenticated',1,'wrong identity domain']])
   await t.test('Legacy PCB denies '+label,async()=>assert.rejects(as(db,role,identity,'select workspace.load_pcb_designer_legacy_workspace()'),e=>e.code==='42501'));
  for(const identity of [101,102,104]) await t.test('Own exact JSON and allowlisted shared catalog for actor '+identity,async()=>{
   const response=(await as(db,'authenticated',identity,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value;
   assert.deepEqual(Object.keys(response).sort(),['schemaVersion','ownSnapshotPresent','ownSnapshot','sharedCatalog'].sort());
   assert.equal(response.schemaVersion,1);assert.equal(response.ownSnapshotPresent,true);assert.deepEqual(response.ownSnapshot,rawSnapshot(identity-100));
   assert.equal(response.sharedCatalog.length,5);
   for(let index=0;index<5;index++) {
    const row=response.sharedCatalog[index];assert.deepEqual(Object.keys(row).sort(),['projects','library','updatedAt','remoteDeletions'].sort());
    assert.deepEqual(Object.keys(row.remoteDeletions).sort(),['library','projects']);
    assert.equal(row.projects[0].id,'project-'+(index+1));assert.equal(row.library.length,1);
    assert.equal(JSON.stringify(row).includes('PRIVATE-'),false);
   }
  });
  for(const identity of [107,108,118])await t.test('No own snapshot never takes another owner private state: '+identity,async()=>{
   const x=(await as(db,'authenticated',identity,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value;
   assert.equal(x.ownSnapshotPresent,false);assert.equal(x.ownSnapshot,null);assert.equal(x.sharedCatalog.length,5);
  });
  for(const [identity,value] of [[111,null],[112,'malformed scalar'],[113,[]],[114,{projects:'not-an-array',library:[],updatedAt:'now'}]])await t.test('Own null/malformed JSON remains exact and present: '+identity,async()=>{
   const x=(await as(db,'authenticated',identity,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value;
   assert.equal(x.ownSnapshotPresent,true);assert.deepEqual(x.ownSnapshot,value);
  });
  await t.test('No target owner parameter exists',async()=>assert.rejects(as(db,'authenticated',101,`select workspace.load_pcb_designer_legacy_workspace('${uid(2)}'::uuid)`),e=>e.code==='42883'));
  await t.test('Unmodified enforcement candidate rejects before all mutation',async()=>rejected(db,enforcement,/enforcement remains pending/));
  await t.test('Additive API alone does not claim raw-column exposure closed',async()=>assert.equal((await as(db,'authenticated',103,'select permissions from workspace.system_users')).rows.length,before.system_users.length));
  await t.test('Enforcement body cannot skip the twelve-RPC predecessor',async()=>rejected(db,body,/Preflight failed/));
  await db.exec(narrow);
  await t.test('Isolated enforcement body revokes only one column and preserves all data',async()=>{
   const prior=(await metadata(db)).columns;await db.exec(body);assert.deepEqual(await snapshot(db),before);
   const after=(await metadata(db)).columns;
   assert.deepEqual(after.filter(x=>x.attname!=='permissions'),prior.filter(x=>x.attname!=='permissions'));
  });
  const rawQueries=['select permissions from workspace.system_users',"select permissions->'pcbDesignerWorkspace' from workspace.system_users",'select * from workspace.system_users','select u from workspace.system_users u','select to_jsonb(u) from workspace.system_users u',"select id from workspace.system_users where permissions ? 'pcbDesignerWorkspace'",'select id from workspace.system_users order by permissions',"select jsonb_path_query(permissions,'$.pcbDesignerWorkspace') from workspace.system_users",'select m.id,u.permissions from workspace.machine_sentinel m cross join workspace.system_users u'];
  for(const actor of [101,103,104])for(const query of rawQueries)await t.test('Raw/whole-row/path/filter/join denied for actor '+actor+': '+query,async()=>assert.rejects(as(db,'authenticated',actor,query),e=>e.code==='42501'));
  await t.test('Every other profile column and normal machine read/update remain usable',async()=>{
   assert.equal((await as(db,'authenticated',103,`select ${fields.filter(x=>x!=='permissions').join(',')} from workspace.system_users`)).rows.length,before.system_users.length);
   assert.equal((await as(db,'authenticated',103,'select * from workspace.list_system_user_profiles()')).rows.length,before.system_users.length);
   await as(db,'authenticated',103,"update workspace.machine_sentinel set state='running' where id=1");
  });
  await t.test('Raw permission and mapping writes remain denied',async()=>{
   for(const statement of ["update workspace.system_users set permissions='{}'::jsonb",'update workspace.system_users set auth_user_id=null'])await assert.rejects(as(db,'authenticated',104,statement),e=>e.code==='42501');
  });
  await t.test('Reads and rejections preserve every source row and all original snapshot bytes',async()=>assert.deepEqual(await snapshot(db),before));
  await t.test('Unauthorized normal permission setter fails without modifying permissions or snapshots',async()=>{
   const data=await snapshot(db);
   await assert.rejects(as(db,'authenticated',103,`select workspace.set_user_access_permissions($1,array['dashboard_edit']::public.page_permission[],$2,$3,$4)`,[uid(2),{'station-status':'edit','material-requests':'none','data-center':'none','pcb-designer':'edit'},'Synthetic unauthorized editor',true]),e=>e.code==='42501');
   assert.deepEqual(await snapshot(db),data);
  });
  await t.test('Existing normal permission setter preserves the exact legacy key and unrelated JSON',async()=>{
   const original=before.system_users.find(r=>r.data.id===uid(2)).data.permissions;
   const access={'station-status':'view','material-requests':'none','data-center':'none','pcb-designer':'view'};
   await as(db,'authenticated',104,`select workspace.set_user_access_permissions($1,array['dashboard_edit']::public.page_permission[],$2,$3,$4)`,[uid(2),access,'Synthetic admin',true]);
   const after=(await db.query('select permissions from workspace.system_users where id=$1',[uid(2)])).rows[0].permissions;
   assert.deepEqual(after.pcbDesignerWorkspace,original.pcbDesignerWorkspace);assert.deepEqual(after.unknown,original.unknown);assert.equal(after.explicitNull,null);
   assert.deepEqual(after.workspaceAccess,access);assert.deepEqual(after.pagePermissions,['dashboard_edit']);assert.equal(after.performanceManager,true);
  });
  await t.test('Committed PCB permission revocation is respected on the next protected load',async()=>{
   const beforeSnapshot=(await db.query("select permissions->'pcbDesignerWorkspace' value from workspace.system_users where id=$1",[uid(2)])).rows[0].value;
   await as(db,'authenticated',104,`select workspace.set_user_access_permissions($1,array['dashboard_view']::public.page_permission[],$2,$3,$4)`,[uid(2),{'station-status':'view','material-requests':'none','data-center':'none','pcb-designer':'none'},'Synthetic revocation',false]);
   const data=await snapshot(db);
   await assert.rejects(as(db,'authenticated',102,'select workspace.load_pcb_designer_legacy_workspace()'),e=>e.code==='42501');
   assert.deepEqual(await snapshot(db),data);
   assert.deepEqual((await db.query("select permissions->'pcbDesignerWorkspace' value from workspace.system_users where id=$1",[uid(2)])).rows[0].value,beforeSnapshot);
  });
 }finally{await db.close();}
});

test('Metadata drift, indirect readers, and late failure stop without partial changes',async t=>{
 const db=await seeded();
 try {
  for(const [label,drift] of [
   ['ledger mismatch',"update supabase_migrations.schema_migrations set name='wrong' where version='20261112001122'"],
   ['table-level SELECT','grant select on workspace.system_users to authenticated'],
   ['unexpected permissions grant option','grant select(permissions) on workspace.system_users to authenticated with grant option'],
   ['changed roster RLS policy','alter policy system_users_authenticated_read on workspace.system_users using(true)'],
   ['applied audit boundary reopened','grant select on workspace.login_audit to anon'],
   ['applied internal boundary reopened','grant execute on function workspace.cleanup_old_notifications() to authenticated'],
   ['mapping definer drift','alter function workspace.current_system_user_id() security invoker'],
   ['new raw definer',"create function public.raw_profiles() returns jsonb language sql security definer as $$select jsonb_agg(to_jsonb(u)) from workspace.system_users u$$"],
   ['raw owner view','create view public.raw_profiles as select permissions from workspace.system_users'],
   ['raw invoker view','create view public.raw_profiles with(security_invoker=true) as select permissions from workspace.system_users'],
   ['raw materialized copy','create materialized view public.raw_profiles as select permissions from workspace.system_users with no data']
  ])await t.test('Additive preflight rejects '+label,async()=>{
   await db.exec('begin;'+drift);await assert.rejects(db.exec(additive),/Legacy PCB/);await db.exec('rollback');
  });
  await t.test('Late additive failure restores exact data and function/ACL configuration',async()=>rejected(db,additive.replace("NOTIFY pgrst, 'reload schema';","SELECT 1/0;\nNOTIFY pgrst, 'reload schema';"),/division by zero/));
  await db.exec(additive);
  await t.test('Repeated additive application fails rather than granting over a collision',async()=>rejected(db,additive,/already present|collision/));
  await db.exec(narrow);
  await t.test('Late enforcement body failure restores the original column ACL and rows',async()=>rejected(db,body.replace("NOTIFY pgrst, 'reload schema';","SELECT 1/0;\nNOTIFY pgrst, 'reload schema';"),/division by zero/));
  await t.test('A committed permission edit between stages survives enforcement without stale restoration',async()=>{
   const original=(await db.query('select permissions from workspace.system_users where id=$1',[uid(2)])).rows[0].permissions;
   await as(db,'authenticated',104,`select workspace.set_user_access_permissions($1,array['dashboard_edit']::public.page_permission[],$2,$3,$4)`,[uid(2),{'station-status':'view','material-requests':'none','data-center':'none','pcb-designer':'view'},'Synthetic between-stage editor',false]);
   const latest=(await db.query('select permissions from workspace.system_users where id=$1',[uid(2)])).rows[0].permissions;
   assert.deepEqual(latest.pcbDesignerWorkspace,original.pcbDesignerWorkspace);
   const data=await snapshot(db);
   await rejected(db,body.replace("NOTIFY pgrst, 'reload schema';","SELECT 1/0;\nNOTIFY pgrst, 'reload schema';"),/division by zero/);
   assert.deepEqual(await snapshot(db),data);
  });
  await t.test('New indirect invoker reader after APIs still blocks enforcement before revoke',async()=>{
   await db.exec('begin;create view public.nested_raw as select permissions from workspace.system_users;create view public.nested_reader as select * from public.nested_raw');
   await assert.rejects(db.exec(body),/unreviewed dependent view/);await db.exec('rollback');
  });
  const latestRows=await snapshot(db);await db.exec(body);assert.deepEqual(await snapshot(db),latestRows);
  await t.test('Repeated raw enforcement rejects stale original-column baseline',async()=>rejected(db,body,/existing column grant changed/));
 }finally{await db.close();}
});

test('Actual SQL envelope and repository frontend parser agree on recovery merge semantics',async t=>{
 const {parsePcbLegacyWorkspace}=await import('../src/components/pcb-designer/core/legacyWorkspace.ts');
 const {createBlankProject,BUILT_IN_COMPONENTS}=await import('../src/components/pcb-designer/defaults.ts');
 const {isPcbSaveState}=await import('../src/components/pcb-designer/core/storage.ts');
 const db=await fixture();
 const project=(id,name,date)=>({...createBlankProject(),id,name,createdAt:'2026-01-01T00:00:00Z',updatedAt:date});
 const part=(id,name)=>({...structuredClone(BUILT_IN_COMPONENTS[0]),id,name,source:'custom'});
 const state=(id,projects,library,date,deleted=[])=>({projects,library,templates:[],activeProjectId:projects[0]?.id??null,modelAssets:{},pendingPlacementsByProject:{},remoteDeletions:{projects:deleted,library:[],templates:[]},updatedAt:date,privateExtra:'PRIVATE-'+id});
 const one=state(1,[project('tie','first owner wins tie','2026-01-02T00:00:00Z'),project('revision','old','2026-01-01T00:00:00Z'),project('deleted','new but tombstoned','2026-01-09T00:00:00Z')],[part('tie-part','first component'),part('removed-part','remove me')],'2026-01-02T00:00:00Z');
 const two=state(2,[project('tie','second owner loses tie','2026-01-02T00:00:00Z'),project('revision','newest','2026-01-03T00:00:00Z')],[part('tie-part','last component wins tie'),structuredClone(BUILT_IN_COMPONENTS[0])],'2026-01-02T00:00:00Z');
 const three=state(3,[],[],'2026-01-01T00:00:00Z',['deleted']);three.remoteDeletions.library=['removed-part'];
 const values=[one,two,three];
 for(let index=0;index<values.length;index++) {assert.equal(isPcbSaveState(values[index]),true);await addAccount(db,index+1,{permissions:{workspaceAccess:{'pcb-designer':'view'},pcbDesignerWorkspace:values[index]}});}
 await addAccount(db,4,{role:'admin'});
 try {
  await db.exec(additive);await db.exec(narrow);await db.exec(body);
  const before=await snapshot(db);
  const load=async id=>(await as(db,'authenticated',100+id,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value;
  await t.test('Revision wins, deterministic project/library ties, and union tombstones match real frontend fold',async()=>{
   const parsed=parsePcbLegacyWorkspace(await load(1));
   assert.equal(parsed.source,'legacy');assert.equal(parsed.ownSnapshotPresent,true);
   assert.equal(parsed.state.projects.find(p=>p.id==='tie').name,'first owner wins tie');
   assert.equal(parsed.state.projects.find(p=>p.id==='revision').name,'newest');
   assert.equal(parsed.state.projects.some(p=>p.id==='deleted'),false);
   assert.equal(parsed.state.library.find(p=>p.id==='tie-part').name,'last component wins tie');
   assert.equal(parsed.state.library.some(p=>p.id==='removed-part'),false);
   assert.deepEqual(parsed.state.remoteDeletions.projects,['deleted']);assert.deepEqual(parsed.state.remoteDeletions.library,['removed-part']);
   assert.equal(parsed.state.privateExtra,'PRIVATE-1');assert.equal(parsed.state.activeProjectId,'tie');
   assert.deepEqual(parsed.state.projects.map(p=>p.id),['revision','tie']);
  });
  await t.test('Absent own snapshot gets shared catalog without another owner private/default selection',async()=>{
   const parsed=parsePcbLegacyWorkspace(await load(4));assert.equal(parsed.ownSnapshotPresent,false);
   assert.equal(parsed.state.activeProjectId,null);assert.equal(parsed.state.privateExtra,undefined);assert.deepEqual(parsed.state.modelAssets,{});assert.deepEqual(parsed.state.pendingPlacementsByProject,{});
  });
  await t.test('Source rows remain exact after SQL and actual frontend parsing',async()=>assert.deepEqual(await snapshot(db),before));
  await t.test('Actual SQL null/malformed own snapshots fail frontend parsing without changing a retained draft',async()=>{
   const draft=structuredClone(one),retained=structuredClone(draft);
   for(const value of [null,'bad-value',[],{projects:'invalid',library:[],updatedAt:'now'}]) {
    await db.query("update workspace.system_users set permissions=jsonb_build_object('workspaceAccess',jsonb_build_object('pcb-designer','view'),'pcbDesignerWorkspace',$2::jsonb) where id=$1",[uid(1),JSON.stringify(value)]);
    const sqlResult=await load(1);assert.equal(sqlResult.ownSnapshotPresent,true);assert.deepEqual(sqlResult.ownSnapshot,value);
    assert.throws(()=>parsePcbLegacyWorkspace(sqlResult),/legacy recovery is unavailable/);assert.deepEqual(draft,retained);
   }
  });
 }finally{await db.close();}
});

test('An ambiguous active Auth mapping cannot choose an arbitrary snapshot owner',async()=>{
 const db=await fixture();
 try {
  await addAccount(db,1,{auth:101,permissions:{workspaceAccess:{'pcb-designer':'view'},pcbDesignerWorkspace:rawSnapshot(1)}});
  await addAccount(db,2,{auth:101,permissions:{workspaceAccess:{'pcb-designer':'view'},pcbDesignerWorkspace:rawSnapshot(2)}});
  const before=await snapshot(db);await db.exec(additive);
  for(const sql of ['select * from workspace.list_system_user_profiles()','select workspace.load_pcb_designer_legacy_workspace()'])
   await assert.rejects(as(db,'authenticated',101,sql),e=>e.code==='42501');
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('Exact API identities reject overloads and aliases before either stage can commit',async t=>{
 const db=await seeded();
 const collisions=[];
 for(const name of ['list_system_user_profiles','load_pcb_designer_legacy_workspace']) {
  collisions.push([name+' harmless defaulted overload',`create function workspace.${name}(ignored integer default 0) returns jsonb language sql security definer as $$select null::jsonb$$`]);
  collisions.push([name+' raw overload',`create function workspace.${name}(owner uuid) returns jsonb language sql security definer as $$select jsonb_agg(permissions) from workspace.system_users$$`]);
  collisions.push([name+' public zero-arg alias',`create function public.${name}() returns jsonb language sql security definer as $$select null::jsonb$$`]);
 }
 collisions.push(['new raw alias',`create function public.unreviewed_raw_alias() returns jsonb language sql security definer as $$select jsonb_agg(permissions) from workspace.system_users$$`]);
 collisions.push(['new non-exposed raw alias',`create schema fixture_private;create function fixture_private.unreviewed_raw_alias() returns jsonb language sql security definer as $$select jsonb_agg(permissions) from workspace.system_users$$`]);
 try {
  for(const [stage,sql] of [['additive',additive],['enforcement body',body]]) {
   if(stage==='enforcement body'){await db.exec(additive);await db.exec(narrow);}
   for(const [label,ddl] of collisions)await t.test(stage+' rejects '+label+' without partial changes',async()=>{
    const data=await snapshot(db),config=await metadata(db);
    await db.exec('begin;'+ddl);
    try {await assert.rejects(db.exec(sql),/Legacy PCB (?:API drift|read surface|additive stage already present)/);}
    finally {await db.exec('rollback');}
    assert.deepEqual(await snapshot(db),data);assert.deepEqual(await metadata(db),config);
   });
  }
 }finally{await db.close();}
});

test('Full applied additive ledger -> twelve PCB -> raw body -> broad 01 -> station-only 02 -> 03 sequence',async t=>{
 const db=await seeded();
 try {
  await installSequenceContext(db);
  const legacyRows=async()=>(await db.query(`select id,permissions->'pcbDesignerWorkspace' value from workspace.system_users where id<= '${uid(5)}' order by id`)).rows;
  const fiveSnapshots=await legacyRows();
  assert.equal(fiveSnapshots.length,5);assert.equal(new Set(fiveSnapshots.map(r=>JSON.stringify(r.value))).size,5);
  const originalObjects=(await db.query('select * from storage.objects order by id')).rows;
  let protectedFunctions;
  const apiConfig=async()=>(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='workspace' and (p.proname like '%pcb_designer%' or p.proname='list_system_user_profiles') order by 1,2,3")).rows;
  for(const [index,[label,sql]] of [
   ['exact applied additive APIs and ledger',appliedAdditive],['twelve PCB guards',narrow],['isolated raw enforcement body',body],
   ['broad stage 01',stage01],['station-only stage 02',stationOnly],['private attachments stage 03',stage03]
  ].entries())await t.test(label+' preserves protected APIs, setter, snapshots and ordinary operations',async()=>{
   const before=await snapshot(db);
   if(index===0)await applyRecordedAdditive(db);else await db.exec(sql);
   await db.exec(appliedVerifier);
   assert.deepEqual((await ledgerRows(db)).find(row=>row.version===appliedVersion),{version:appliedVersion,name:appliedName,statements:[appliedAdditive]});
   assert.deepEqual(await snapshot(db),before,'stage DDL changes no account, permission or application row');
   assert.deepEqual(await legacyRows(),fiveSnapshots);
   assert.deepEqual((await db.query('select * from storage.objects order by id')).rows,originalObjects);
   if(index===1)protectedFunctions=await apiConfig();
   if(index>1)assert.deepEqual(await apiConfig(),protectedFunctions,'all twelve PCB and both new API definitions/owners/ACLs stay fixed');

   const rows=(await as(db,'authenticated',103,'select * from workspace.list_system_user_profiles() order by id')).rows;
   assert.equal(rows.length,before.system_users.length);
   for(const row of rows) {
    const original=before.system_users.find(r=>r.data.id===row.id).data;
    assert.deepEqual(Object.keys(row),fields);
    for(const key of fields) {
     let expected=original[key];
     if(key==='permissions'&&expected&&typeof expected==='object'&&!Array.isArray(expected)){expected=structuredClone(expected);delete expected.pcbDesignerWorkspace;}
     assert.deepEqual(row[key] instanceof Date?row[key].getTime():row[key],row[key] instanceof Date?new Date(expected).getTime():expected,key);
    }
   }
   const own=(await as(db,'authenticated',101,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value;
   assert.deepEqual(own.ownSnapshot,rawSnapshot(1));assert.equal(own.ownSnapshotPresent,true);assert.equal(own.sharedCatalog.length,5);
   assert.equal(JSON.stringify(own.sharedCatalog).includes('PRIVATE-'),false);
   await assert.rejects(as(db,'authenticated',103,'select workspace.load_pcb_designer_legacy_workspace()'),e=>e.code==='42501');
   for(const query of ['select permissions from workspace.system_users','select * from workspace.system_users','select to_jsonb(u) from workspace.system_users u',"select id from workspace.system_users where permissions ? 'pcbDesignerWorkspace'"]) {
    if(index>=2)for(const identity of [101,103,104])await assert.rejects(as(db,'authenticated',identity,query),e=>e.code==='42501');
    // Additive/narrow are explicitly not raw-read enforcement stages.
    else if(query==='select permissions from workspace.system_users')assert.equal((await as(db,'authenticated',103,query)).rows.length,before.system_users.length);
   }
   assert.equal((await as(db,'authenticated',103,`select ${fields.filter(f=>f!=='permissions').join(',')} from workspace.system_users`)).rows.length,before.system_users.length);
   await as(db,'authenticated',103,"update workspace.machine_sentinel set state='running' where id=1");
   assert.equal((await as(db,'authenticated',103,'select state from workspace.machine_sentinel where id=1')).rows[0].state,'running');
   assert.deepEqual(await snapshot(db),before,'reads, denied paths and idempotent machine operation change no source rows');

   // Commit a normal edit at every stage; never restore an old permission JSON.
   const access={'station-status':index%2?'edit':'view','material-requests':'none','data-center':'none','pcb-designer':'view'};
   await assert.rejects(as(db,'authenticated',103,`select workspace.set_user_access_permissions($1,array['dashboard_edit']::public.page_permission[],$2,$3,$4)`,[uid(2),access,'Synthetic unauthorized sequence editor',true]),e=>e.code==='42501');
   assert.deepEqual(await snapshot(db),before,'denied setter changes nothing at every stage');
   await as(db,'authenticated',104,`select workspace.set_user_access_permissions($1,array['dashboard_edit']::public.page_permission[],$2,$3,$4)`,[uid(2),access,'Synthetic sequence admin '+index,index%2===0]);
   const accounts=(await snapshot(db)).system_users;
   for(const row of accounts) {
    const expected=structuredClone(before.system_users.find(r=>r.data.id===row.data.id));
    if(row.data.id===uid(2))expected.data.permissions={...expected.data.permissions,workspaceAccess:access,pagePermissions:['dashboard_edit'],performanceManager:index%2===0};
    assert.deepEqual(row,expected,'only explicitly requested permission fields change');
   }
   assert.deepEqual(await legacyRows(),fiveSnapshots,'all five exact original snapshots survive committed permission edits');
   assert.deepEqual((await as(db,'authenticated',102,'select workspace.load_pcb_designer_legacy_workspace() value')).rows[0].value.ownSnapshot,rawSnapshot(2));
   if(index>=3) {
    const mapping=(await db.query("select has_function_privilege('anon','workspace.current_system_user_id()','execute') anon,has_function_privilege('authenticated','workspace.current_system_user_id()','execute') authenticated")).rows[0];
    assert.deepEqual(mapping,{anon:false,authenticated:true});
   }
  });
  assert.deepEqual((await db.query('select * from storage.buckets order by id')).rows,[{id:'issue-attachments',public:false},{id:'task-attachments',public:false},{id:'unrelated',public:true}]);
 }finally{await db.close();}
});


test('Exact applied additive transport, ledger and read-only reconciliation stay atomic',async t=>{
 const db=await seeded(),reference=await seeded();
 try {
  const before=await snapshot(db),config=await metadata(db),oldLedger=await ledgerRows(db);
  await t.test('Read-only reconciliation rejects an unapplied database without changing rows or metadata',async()=>{
   await rejected(db,appliedVerifier,/Applied legacy PCB ledger mismatch/);
   assert.deepEqual(await ledgerRows(db),oldLedger);
  });
  await t.test('A late runner ledger failure rolls back both new APIs and all ACL effects',async()=>{
   await assert.rejects(applyRecordedAdditive(db,'20261112001122'),error=>error.code==='23505');
   assert.deepEqual(await snapshot(db),before);assert.deepEqual(await metadata(db),config);assert.deepEqual(await ledgerRows(db),oldLedger);
  });
  await t.test('Fresh synthetic install of exact server transport matches candidate functions and ACLs',async()=>{
   await db.exec('begin');await db.exec(appliedAdditive);await db.exec('rollback');
   assert.deepEqual(await metadata(db),config);assert.deepEqual(await snapshot(db),before);
   await applyRecordedAdditive(db);await reference.exec(additive);
   assert.deepEqual(await metadata(db),await metadata(reference));assert.deepEqual(await snapshot(db),before);
   assert.deepEqual(await ledgerRows(db),[...oldLedger,{version:appliedVersion,name:appliedName,statements:[appliedAdditive]}]);
  });
  await t.test('Read-only applied verifier preserves all rows, metadata and exact ledger statements',async()=>{
   const current=await metadata(db),ledger=await ledgerRows(db);
   await db.exec(appliedVerifier);
   assert.deepEqual(await snapshot(db),before);assert.deepEqual(await metadata(db),current);assert.deepEqual(await ledgerRows(db),ledger);
  });
  await t.test('Both applied transport and historical candidate reject replay rather than replacing APIs',async()=>{
   const ledger=await ledgerRows(db);
   await assert.rejects(applyRecordedAdditive(db),/already present|collision/);
   await rejected(db,additive,/already present|collision/);
   assert.deepEqual(await ledgerRows(db),ledger);assert.deepEqual(await snapshot(db),before);
  });
  await t.test('Read-only verifier rejects ledger/name/statement and new API ACL/body drift',async()=>{
   const current=await metadata(db),ledger=await ledgerRows(db);
   for(const drift of [
    `update supabase_migrations.schema_migrations set name='synthetic_drift' where version='${appliedVersion}'`,
    `update supabase_migrations.schema_migrations set statements=array[statements[1]||chr(10)] where version='${appliedVersion}'`,
    'grant execute on function workspace.load_pcb_designer_legacy_workspace() to anon',
    'alter function workspace.list_system_user_profiles() security invoker',
    "create or replace function workspace.load_pcb_designer_legacy_workspace() returns jsonb language sql security definer as $$select null::jsonb$$"
   ]) {
    await db.exec('begin;'+drift);
    try {await assert.rejects(db.exec(appliedVerifier),/Applied legacy PCB ledger mismatch|Legacy PCB API drift/);}
    finally {await db.exec('rollback');}
    assert.deepEqual(await snapshot(db),before);assert.deepEqual(await metadata(db),current);assert.deepEqual(await ledgerRows(db),ledger);
   }
  });
 }finally{await db.close();await reference.close();}
});
