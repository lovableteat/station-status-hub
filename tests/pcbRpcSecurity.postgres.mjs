import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
// Runs only in a new in-memory PostgreSQL instance; no network or hosted database.
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the local PGlite module');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const read=n=>readFile(new URL(n,import.meta.url),'utf8');
const functions=JSON.parse(await read('fixtures/pcb-rpc-security/functions.json'));
const targets=functions.filter(f=>f.schema_name==='workspace'&&f.proname.includes('pcb_designer')&&f.anon_execute);
const schema=JSON.parse(await read('fixtures/pcb-rpc-security/schema.json'));
const constraints=JSON.parse(await read('fixtures/pcb-rpc-security/constraints.json'));
const cut=await read('../docs/security-proposals/pcb-rpc-cutover-PENDING.sql');
const retiredRollback=await read('../docs/security-proposals/pcb-rpc-rollback-RETIRED.sql');
const stage02=await read('../docs/security-proposals/02-bind-rpc-identities.sql');
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const payload={projects:[{id:'board-one',name:'Synthetic board',updatedAt:'2026-01-01T00:00:00Z'}],templates:[{id:'template-one'}],library:[{id:'component-one',source:'custom',name:'Synthetic component'}],activeProjectId:'board-one',updatedAt:'2026-01-01T00:00:00Z',remoteDeletions:{projects:[],library:[],templates:[]}};
const payloadSql=q(JSON.stringify(payload))+'::jsonb';
function argsFor(f,id=1){
 const a=[q(uid(id))+'::uuid'];
 if(f.proname==='acquire_pcb_designer_project_lock')a.push("'board-one'","'Synthetic board'","'client-one'",'30');
 else if(f.proname==='delete_pcb_designer_project_locked'||f.proname==='release_pcb_designer_project_lock')a.push("'board-one'","'client-one'");
 else if(f.proname==='load_pcb_designer_project_lock')a.push("'board-one'");
 else if(f.proname==='save_pcb_designer_workspace_locked')a.push("'board-one'","'client-one'",payloadSql);
 else if(f.proname.startsWith('save_pcb_designer_workspace'))a.push(payloadSql);
 else if(f.proname==='save_pcb_designer_model_asset')a.push("'asset-one'","'{\"id\":\"asset-one\"}'::jsonb","'eA=='");
 else if(f.proname==='load_pcb_designer_model_asset')a.push("'asset-one'");
 return a.join(',');
}
async function role(db,role,authId,sql){
 await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[authId?uid(authId):'']);
 try{return await db.query(sql);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
}
async function installPcbMetadata(db) {
 for(const rel of schema.relations){
  const cols=schema.columns.filter(c=>c.table===rel.name).map(c=>`${c.name} ${c.type}${c.not_null?' not null':''}${c.default?' default '+c.default:''}`);
  await db.exec(`create table ${rel.name}(${cols.join(',')});alter table ${rel.name} enable row level security;grant select,insert,update,delete on ${rel.name} to service_role;`);
 }
 for(const c of constraints.constraints.filter(c=>c.table!=='workspace.system_users'))await db.exec(`alter table ${c.table} add constraint ${c.name} ${c.definition}`);
 for(const f of functions.filter(f=>f.schema_name==='workspace'&&(f.proname.includes('pcb_designer')||f.proname==='current_system_user_id'))){
  await db.exec(f.definition);await db.exec(`revoke all on function ${f.signature} from public,anon,authenticated,service_role`);
  const grants=[...(f.anon_execute?['anon']:[]),...(f.authenticated_execute?['authenticated']:[]),...(f.service_execute?['service_role']:[])];
  if(grants.length)await db.exec(`grant execute on function ${f.signature} to ${grants.join(',')}`);
  if(f.proacl.startsWith('{=X/'))await db.exec(`grant execute on function ${f.signature} to public`);
 }
 for(const tr of constraints.triggers)await db.exec(tr.definition);
}
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema workspace;create schema auth;
 grant usage on schema workspace,auth,public to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table workspace.system_users(id uuid primary key,username text unique,display_name text,role text,status text,auth_user_id uuid,permissions jsonb);
 create table workspace.unrelated_machine(id int primary key,status text);insert into workspace.unrelated_machine values(1,'running');`);
 await installPcbMetadata(db);
 for(const [id,roleName,status,access,authId] of [[1,'engineer','active','edit',101],[2,'engineer','active','view',102],[3,'engineer','active','none',103],[4,'admin','active','none',104],[5,'engineer','disabled','edit',105],[6,'engineer','active','edit',null],[7,'engineer','active','edit',107]]){
  const permissions={workspaceAccess:{'pcb-designer':access}};
  if(id<=5) permissions.pcbDesignerWorkspace={synthetic:true,projects:[{id:'legacy-synthetic-'+id,name:'Fake legacy board '+id}],privateMarker:'synthetic-owner-'+id};
  await db.query('insert into workspace.system_users values($1,$2,$3,$4,$5,$6,$7)',[uid(id),'synthetic-'+id,'Synthetic '+id,roleName,status,authId?uid(authId):null,permissions]);
 }
 return db;
}
async function dataSnapshot(db){const data={};for(const table of ['workspace.system_users','workspace.unrelated_machine',...schema.relations.map(r=>r.name)])data[table]=(await db.query(`select to_jsonb(t) data from ${table} t order by to_jsonb(t)::text`)).rows;return data;}
async function legacySnapshots(db){return (await db.query("select to_jsonb(account) data from workspace.system_users account where permissions ? 'pcbDesignerWorkspace' order by id")).rows;}
async function configuration(db){return (await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,array(select x::text from unnest(p.proacl) x order by x::text) acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','auth') order by n.nspname,p.proname")).rows;}
test('Synthetic-only PCB RPC hardening against repository candidate',async t=>{
 const db=await fixture();
 try{
  console.log((await db.query('select version()')).rows[0]);
  assert.equal(targets.length, 12, 'all twelve reviewed RPC entry points are covered');
  await t.test('Demonstrate pre-fix anonymous impersonation in isolated fixture only',async()=>{
   const r=await role(db,'anon',null,`select workspace.load_pcb_designer_workspace_shared('${uid(1)}') as result`);assert.equal(r.rows[0].result.projects.length,0);
  });
  // Populate every PCB table with synthetic values before proving preservation.
  await role(db,'authenticated',101,`select workspace.save_pcb_designer_workspace_shared('${uid(1)}',${payloadSql})`);
  await role(db,'authenticated',101,`select workspace.save_pcb_designer_model_asset('${uid(1)}','asset-one','{"id":"asset-one"}','eA==')`);
  await role(db,'authenticated',101,`select workspace.acquire_pcb_designer_project_lock('${uid(1)}','board-one','Synthetic board','client-one',30)`);
  const beforeData=await dataSnapshot(db);
  const fiveLegacySnapshots=await legacySnapshots(db);
  assert.equal(fiveLegacySnapshots.length,5);
  await t.test('Atomic candidate changes no row or unrelated machine status',async()=>{await db.exec(cut);assert.deepEqual(await dataSnapshot(db),beforeData);});
  await t.test('All five distinct synthetic legacy snapshots, complete permissions and account rows remain unchanged',async()=>{
   assert.equal(new Set(fiveLegacySnapshots.map(row=>JSON.stringify(row.data.permissions.pcbDesignerWorkspace))).size,5);
   assert.deepEqual(await legacySnapshots(db),fiveLegacySnapshots);
  });
  for(const f of targets){
   await t.test(`anon cannot execute ${f.proname}`,async()=>{await assert.rejects(role(db,'anon',null,`select workspace.${f.proname}(${argsFor(f)})`),e=>e.code==='42501');});
   await t.test(`authenticated cannot impersonate on ${f.proname}`,async()=>{await assert.rejects(role(db,'authenticated',102,`select workspace.${f.proname}(${argsFor(f)})`),e=>e.code==='42501'&&/identity mismatch/.test(e.message));});
   await t.test(`authenticated without identity cannot execute ${f.proname}`,async()=>{await assert.rejects(role(db,'authenticated',null,`select workspace.${f.proname}(${argsFor(f)})`),e=>e.code==='42501');});
  }
  await t.test('Null supplied IDs and service-role execute remain denied on all twelve RPCs', async()=>{
   for(const f of targets) {
    const args=argsFor(f).replace(q(uid(1))+'::uuid','null::uuid');
    await assert.rejects(role(db,'authenticated',101,`select workspace.${f.proname}(${args})`),error=>error.code==='42501');
    await assert.rejects(role(db,'service_role',101,`select workspace.${f.proname}(${argsFor(f)})`),error=>error.code==='42501');
   }
  });
  await t.test('Rejected calls changed no rows, locks, model data or unrelated machine data',async()=>{assert.deepEqual(await dataSnapshot(db),beforeData);});
  await t.test('Owner authenticated save, shared load and private templates preserve behavior',async()=>{
   await role(db,'authenticated',101,`select workspace.save_pcb_designer_workspace_shared('${uid(1)}',${payloadSql})`);
   const own=(await role(db,'authenticated',101,`select workspace.load_pcb_designer_workspace_shared('${uid(1)}') as v`)).rows[0].v;
   const viewer=(await role(db,'authenticated',102,`select workspace.load_pcb_designer_workspace_shared('${uid(2)}') as v`)).rows[0].v;
   assert.equal(own.projects[0].id,'board-one');assert.equal(own.templates.length,1);assert.equal(own.library[0].id,'component-one');assert.equal(viewer.projects[0].id,'board-one');assert.equal(viewer.templates.length,0);
  });
  await t.test('Viewer own-ID read succeeds; view permission cannot save; no-access and disabled accounts fail',async()=>{
   await assert.rejects(role(db,'authenticated',102,`select workspace.save_pcb_designer_workspace('${uid(2)}',${payloadSql})`),/edit access denied/);
   await assert.rejects(role(db,'authenticated',103,`select workspace.load_pcb_designer_workspace('${uid(3)}')`),/access denied/);
   await assert.rejects(role(db,'authenticated',105,`select workspace.load_pcb_designer_workspace('${uid(5)}')`),e=>e.code==='42501');
   await assert.rejects(role(db,'authenticated',106,`select workspace.load_pcb_designer_workspace('${uid(6)}')`),e=>e.code==='42501');
   await role(db,'authenticated',104,`select workspace.load_pcb_designer_workspace('${uid(4)}')`);
  });
  await t.test('Acquire, heartbeat, locked save, other client exclusion, own release stay compatible',async()=>{
   const acquire=await role(db,'authenticated',101,`select workspace.acquire_pcb_designer_project_lock('${uid(1)}','board-one','Synthetic board','client-one',30) as v`);assert.equal(acquire.rows[0].v.acquired,true);
   const renewal=await role(db,'authenticated',101,`select workspace.acquire_pcb_designer_project_lock('${uid(1)}','board-one','Synthetic board','client-one',30) as v`);assert.equal(renewal.rows[0].v.acquired,true);
   const other=await role(db,'authenticated',107,`select workspace.acquire_pcb_designer_project_lock('${uid(7)}','board-one','Synthetic board','client-two',30) as v`);assert.equal(other.rows[0].v.acquired,false);
   const deniedRelease=await role(db,'authenticated',107,`select workspace.release_pcb_designer_project_lock('${uid(7)}','board-one','client-one') as v`);assert.equal(deniedRelease.rows[0].v,false);
   await role(db,'authenticated',101,`select workspace.save_pcb_designer_workspace_locked('${uid(1)}','board-one','client-one',${payloadSql})`);
   await role(db,'authenticated',102,`select workspace.load_pcb_designer_project_lock('${uid(2)}','board-one')`);
   await role(db,'authenticated',101,`select workspace.release_pcb_designer_project_lock('${uid(1)}','board-one','client-one')`);
   await assert.rejects(role(db,'authenticated',101,`select workspace.save_pcb_designer_workspace_locked('${uid(1)}','board-one','client-one',${payloadSql})`),/edit lock required/);
  });
  await t.test('Model save/list/load preserve original synthetic bytes and viewer/edit rules',async()=>{
   await role(db,'authenticated',101,`select workspace.save_pcb_designer_model_asset('${uid(1)}','asset-one','{"id":"asset-one"}','eA==')`);
   const asset=(await role(db,'authenticated',102,`select workspace.load_pcb_designer_model_asset('${uid(2)}','asset-one') as v`)).rows[0].v;assert.equal(asset.payloadBase64,'eA==');
   const list=(await role(db,'authenticated',102,`select workspace.list_pcb_designer_model_assets('${uid(2)}') as v`)).rows[0].v;assert.equal(list.length,1);
   await assert.rejects(role(db,'authenticated',102,`select workspace.save_pcb_designer_model_asset('${uid(2)}','asset-one','{}','eA==')`),/edit access denied/);
  });
  await t.test('Locked deletion keeps tombstone semantics and does not touch machine data',async()=>{
   await role(db,'authenticated',101,`select workspace.acquire_pcb_designer_project_lock('${uid(1)}','board-one','Synthetic board','client-one',30)`);
   await role(db,'authenticated',101,`select workspace.delete_pcb_designer_project_locked('${uid(1)}','board-one','client-one')`);
   const loaded=(await role(db,'authenticated',101,`select workspace.load_pcb_designer_workspace_shared('${uid(1)}') as v`)).rows[0].v;assert.equal(loaded.projects.length,0);assert.deepEqual(loaded.remoteDeletions.projects,['board-one']);
   assert.deepEqual((await dataSnapshot(db))['workspace.unrelated_machine'],beforeData['workspace.unrelated_machine']);
  });
  await t.test('Retired rollback cannot restore vulnerable definitions or anonymous access', async () => {
   const data=await dataSnapshot(db), config=await configuration(db);
   await assert.rejects(db.exec(retiredRollback), /PCB rollback retired/);
   await db.exec('rollback');
   assert.deepEqual(await dataSnapshot(db), data);
   assert.deepEqual(await configuration(db), config);
  });
  await t.test('Duplicate cutover fails closed and retains hardened state',async()=>{
   const data=await dataSnapshot(db), config=await configuration(db);
   await assert.rejects(db.exec(cut),/Preflight failed/);await db.exec('rollback');
   assert.deepEqual(await dataSnapshot(db),data);assert.deepEqual(await configuration(db),config);
  });
  await t.test('Old stage 02 cannot overwrite any of the twelve verified-actor guards', async () => {
   const data=await dataSnapshot(db), config=await configuration(db);
   await assert.rejects(db.exec(stage02), /PCB RPC sequence conflict/);
   await db.exec('rollback');
   assert.deepEqual(await dataSnapshot(db),data);assert.deepEqual(await configuration(db),config);
  });
 }finally{await db.close();}
});

// Each drift uses a new local database. Never undo hardening by regranting anon.
for(const [label,drift] of [
 ['unexpected PUBLIC execute',`grant execute on function workspace.load_pcb_designer_workspace(uuid) to public`],
 ['missing authenticated execute',`revoke execute on function workspace.load_pcb_designer_workspace(uuid) from authenticated`],
 ['changed mapping context',`alter function workspace.current_system_user_id() security invoker`],
 ['changed PCB function context',`alter function workspace.load_pcb_designer_workspace(uuid) security invoker`],
 ['role inheritance',`create role unexpected_role;grant unexpected_role to anon`],
 ['stage 01 mapping ACL change',`revoke execute on function workspace.current_system_user_id() from public,anon`],
 ['stage 01 PCB ACL change',`revoke execute on function workspace.load_pcb_designer_workspace(uuid) from public,anon`]
]) test('Candidate preflight rejects '+label,async()=>{
 const db=await fixture();
 try {
  await db.exec(drift);
  const data=await dataSnapshot(db),config=await configuration(db);
  await assert.rejects(db.exec(cut),/Preflight failed/);await db.exec('rollback');
  assert.deepEqual(await dataSnapshot(db),data);assert.deepEqual(await configuration(db),config);
 } finally {await db.close();}
});

test('Late candidate failure rolls back all function/ACL changes without touching rows', async () => {
 const db=await fixture();
 try {
  const data=await dataSnapshot(db),config=await configuration(db);
  const failing=cut.replace(/COMMIT;\s*$/, 'SELECT 1 / 0;\nCOMMIT;');
  assert.notEqual(failing,cut);
  await assert.rejects(db.exec(failing),/division by zero/);
  await assert.rejects(db.query('select 1'),error=>error.code==='25P02');
  await db.exec('rollback');
  assert.deepEqual(await dataSnapshot(db),data);assert.deepEqual(await configuration(db),config);
 } finally {await db.close();}
});

test('Old stage 02 first invalidates narrow candidate baseline and is never silently overwritten', async () => {
 const db=await fixture();
 try {
  // Minimal synthetic applied prerequisites. None of these data-changing RPCs is called.
  for (const namespace of ['public','workspace']) {
   for (const name of ['calculate_daily_production_stats','cleanup_old_notifications']) {
    await db.exec(`create function ${namespace}.${name}() returns void language sql security definer as $$select$$;
     revoke all on function ${namespace}.${name}() from public,anon,authenticated;
     grant execute on function ${namespace}.${name}() to service_role;`);
   }
   await db.exec(`create function ${namespace}.delete_test_system(p_system_id uuid) returns void language plpgsql security definer as $$begin return;end$$;
    revoke all on function ${namespace}.delete_test_system(uuid) from public,anon;
    grant execute on function ${namespace}.delete_test_system(uuid) to authenticated,service_role;`);
  }
  await db.exec(`create function workspace.current_user_can_workspace(text,text) returns boolean language sql as $$select false$$;`);
  await db.exec(stage02);
  const data=await dataSnapshot(db),config=await configuration(db);
  await assert.rejects(db.exec(cut),/Preflight failed/);await db.exec('rollback');
  assert.deepEqual(await dataSnapshot(db),data);assert.deepEqual(await configuration(db),config);
 } finally {await db.close();}
});

async function broadFixture() {
 const db=new PGlite();
 let sql=await read('fixtures/remaining-security-postgres-setup.sql');
 // Reuse the reviewed broad synthetic fixture without its deliberately simplified
 // PCB tables. Replace only those tables with the metadata-backed PCB fixture.
 sql=sql.split('\n').filter(line => !/^(?:create table|alter table|create policy fixture_permissive on|insert into) workspace\.pcb_designer_/.test(line)).join('\n');
 await db.exec(sql);
 await installPcbMetadata(db);
 // Five fake historical snapshots verify preservation, without importing any
 // real legacy snapshot or asserting that the narrow cutover protects reads.
 await db.exec(`update workspace.system_users set permissions = permissions ||
  jsonb_build_object('pcbDesignerWorkspace', jsonb_build_object('synthetic', true, 'owner', username));`);
 return db;
}
const broadAs=async(db,id,sql)=>{
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",['10000000-0000-4000-8000-'+String(id).padStart(12,'0')]);
 try{return await db.query(sql);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
};
async function allRows(db) {
 const result={};
 for(const {schemaname,tablename} of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('workspace','storage') and tablename<>'buckets' order by 1,2")).rows)
  result[schemaname+'.'+tablename]=(await db.query(`select to_jsonb(t) data from ${schemaname}.${tablename} t order by to_jsonb(t)::text`)).rows;
 return result;
}
async function pcbConfiguration(db) {
 return (await configuration(db)).filter(row=>row.proname.includes('pcb_designer'));
}
const stage01=await read('../docs/security-proposals/01-close-anonymous-access.sql');
const stationOnly=await read('../docs/security-proposals/02-bind-station-delete-identities-after-pcb.sql');
const stage03=await read('../docs/security-proposals/03-private-attachments.sql');

test('Complete narrow PCB -> 01 -> station-only 02 -> 03 sequence preserves PCB contracts and rows', async t=>{
 const db=await broadFixture();
 try {
  const before=await allRows(db);
  const fiveLegacySnapshots=await legacySnapshots(db);
  assert.equal(fiveLegacySnapshots.length,5);
  assert.equal(new Set(fiveLegacySnapshots.map(row=>JSON.stringify(row.data.permissions.pcbDesignerWorkspace))).size,5);
  await t.test('candidate applies to captured PCB baseline in broad synthetic application',async()=>{await db.exec(cut);});
  const hardened=await pcbConfiguration(db);
  for (const [label,sql] of [['stage 01',stage01],['station-only stage 02',stationOnly],['stage 03',stage03]]) {
   await t.test(label+' preserves all PCB definitions/ACLs and every application/object row',async()=>{
    await db.exec(sql);assert.deepEqual(await pcbConfiguration(db),hardened);assert.deepEqual(await allRows(db),before);
    assert.deepEqual(await legacySnapshots(db),fiveLegacySnapshots,'all five legacy snapshots and full account/permission rows remain identical');
   });
  }
  await t.test('all twelve RPCs retain anonymous denial and reject impersonation after the entire sequence',async()=>{
   for (const f of targets) {
    await assert.rejects(role(db,'anon',null,`select workspace.${f.proname}(${argsFor(f,2)})`),error=>error.code==='42501');
    await assert.rejects(broadAs(db,3,`select workspace.${f.proname}(${argsFor(f,2)})`),error=>error.code==='42501');
   }
   assert.deepEqual(await allRows(db),before);
  });
  await t.test('shared save, viewer read, private templates, model bytes and lock/release survive the sequence',async()=>{
   await broadAs(db,2,`select workspace.save_pcb_designer_workspace_shared('${uid(2)}',${payloadSql})`);
   const own=(await broadAs(db,2,`select workspace.load_pcb_designer_workspace_shared('${uid(2)}') v`)).rows[0].v;
   const viewer=(await broadAs(db,3,`select workspace.load_pcb_designer_workspace_shared('${uid(3)}') v`)).rows[0].v;
   assert.equal(own.templates.length,1);assert.equal(viewer.templates.length,0);assert.equal(viewer.projects[0].id,'board-one');
   await broadAs(db,2,`select workspace.acquire_pcb_designer_project_lock('${uid(2)}','board-one','Synthetic board','client-one',30)`);
   await broadAs(db,2,`select workspace.save_pcb_designer_workspace_locked('${uid(2)}','board-one','client-one',${payloadSql})`);
   await broadAs(db,2,`select workspace.release_pcb_designer_project_lock('${uid(2)}','board-one','client-one')`);
   await broadAs(db,2,`select workspace.save_pcb_designer_model_asset('${uid(2)}','asset-one','{"id":"asset-one"}','eA==')`);
   assert.equal((await broadAs(db,3,`select workspace.load_pcb_designer_model_asset('${uid(3)}','asset-one') v`)).rows[0].v.payloadBase64,'eA==');
   await assert.rejects(broadAs(db,3,`select workspace.save_pcb_designer_workspace('${uid(3)}',${payloadSql})`),/edit access denied/);
  });
  await t.test('station-only guards reject viewer before target lookup without data changes',async()=>{
   const data=await allRows(db);
   for (const namespace of ['public','workspace']) await assert.rejects(broadAs(db,3,`select ${namespace}.delete_test_system('${uid(999)}')`),error=>error.code==='42501'&&/Station edit access denied/.test(error.message));
   assert.deepEqual(await allRows(db),data);
  });
  await t.test('old stage02 remains rejected after the complete new sequence',async()=>{
   const data=await allRows(db);
   await assert.rejects(db.exec(stage02),/PCB RPC sequence conflict/);await db.exec('rollback');
   assert.deepEqual(await pcbConfiguration(db),hardened);assert.deepEqual(await allRows(db),data);
  });
 } finally {await db.close();}
});

test('Station-only proposal rejects missing predecessor, hardened drift, and late failure',async t=>{
 const db=await broadFixture();
 try {
  await t.test('original PCB baseline cannot skip the twelve-RPC cutover',async()=>{
   const config=await configuration(db);
   await assert.rejects(db.exec(stationOnly),/Hardened PCB baseline drift/);await db.exec('rollback');assert.deepEqual(await configuration(db),config);
  });
  await db.exec(cut);
  await t.test('narrow cutover alone cannot skip stage01',async()=>{
   const config=await configuration(db);
   await assert.rejects(db.exec(stationOnly),/Hardened PCB baseline drift/);await db.exec('rollback');assert.deepEqual(await configuration(db),config);
  });
  await db.exec(stage01);
  const config=await configuration(db),data=await allRows(db);
  await t.test('late failure leaves all functions, ACLs and rows unchanged',async()=>{
   await assert.rejects(db.exec(stationOnly.replace("notify pgrst, 'reload schema';","select 1 / 0;\nnotify pgrst, 'reload schema';")),/division by zero/);
   await db.exec('rollback');assert.deepEqual(await configuration(db),config);assert.deepEqual(await allRows(db),data);
  });
  for(const drift of [
   `grant execute on function workspace.load_pcb_designer_workspace(uuid) to anon`,
   `alter function workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb) security invoker`,
   `revoke execute on function workspace.load_pcb_designer_workspace_shared(uuid) from authenticated`
  ]) await t.test('station-only preflight rejects hardened PCB drift: '+drift,async()=>{
   await db.exec('begin;'+drift);
   await assert.rejects(db.exec(stationOnly),/Hardened PCB baseline drift/);await db.exec('rollback');
   assert.deepEqual(await configuration(db),config);assert.deepEqual(await allRows(db),data);
  });
 }finally{await db.close();}
});
