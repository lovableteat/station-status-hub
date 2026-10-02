const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const {React,act,create,deferred,browser,database,loader,flush}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});
const v=n=>`2026-10-02T01:${String(n).padStart(2,'0')}:00Z`;
function permute(value){return Array.isArray(value)?value.map(permute):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,permute(value[k])])):value;}
async function mount({run,normalizeApply=false,user='audit-user',windowTarget}={}){
 const win=windowTarget??browser(),db=database(q=>run(q));
 const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:db}}});
 const {INITIAL_SITE_PLANS}=load('src/components/data-center/dataCenterSeed.ts');
 const document={schemaVersion:1,sites:structuredClone(INITIAL_SITE_PLANS),facilityPlans:{},modelOverrides:{}};
 const row={id:'A',project_key:'a',name:'AUDIT_LOCAL',category:'test',description:'',document,updated_at:v(0),updated_by:'other'};
 run=run??(q=>ok(q.method==='select'?[row]:{...row,...q.payload,updated_at:v(1)}));
 const {useSharedDataCenterProjects}=load('src/components/data-center/useSharedDataCenterProjects.ts');
 let state,doc,edit,account=user;
 function Probe(){const [current,setCurrent]=React.useState(document);doc=current;edit=setCurrent;state=useSharedDataCenterProjects({userId:account,canEdit:true,currentDocument:current,onApplyDocument:d=>setCurrent(normalizeApply?{schemaVersion:1,sites:permute(d.sites),facilityPlans:permute(d.facilityPlans),modelOverrides:permute(d.modelOverrides)}:d)});return null;}
 let root;await act(async()=>{root=create(React.createElement(Probe));});await flush(10);
 return {win,db,load,row,document,get state(){return state;},get doc(){return doc;},edit:d=>act(async()=>edit(d)),run:fn=>{run=fn;},account:async id=>{account=id;await act(async()=>root.update(React.createElement(Probe)));await flush(10);},unmount:()=>act(async()=>root.unmount())};
}
const draft=(d,label)=>({...d,sites:d.sites.map(s=>({...s,label}))});

test('Data-center journal and future deliveries cannot replace a newer snapshot with a provably older commit',async()=>{
 const h=await mount(),pending=deferred();try{
  h.run(()=>pending.promise);await act(async()=>h.state.retry());await flush(5);
  const event={eventType:'UPDATE',old:{},new:{...h.row,document:draft(h.document,'older-commit'),updated_at:v(1)},commit_timestamp:'2026-10-02T01:01:01Z'};
  await act(async()=>h.db.channels[0].emit('data_center_projects',event));await flush();await act(async()=>pending.resolve(ok([{...h.row,document:draft(h.document,'newer-snapshot'),updated_at:v(2)}])));await flush();assert.equal(h.doc.sites[0].label,'newer-snapshot');
  await act(async()=>h.db.channels[0].emit('data_center_projects',{...event,commit_timestamp:'2026-10-02T01:01:30Z'}));await flush();assert.equal(h.doc.sites[0].label,'newer-snapshot');
  await act(async()=>h.db.channels[0].emit('data_center_projects',{...event,commit_timestamp:v(3)}));await flush();assert.equal(h.doc.sites[0].label,'older-commit','later commit with old transaction start remains authoritative');
 }finally{await h.unmount();}
});

test('Chinese search, null/date ordering and PCB JSON/CSV exports retain scoped data and quoted text',()=>{
 const load=loader(),{filterAndSortTrackerSystems}=load('src/components/test-tracker/testTrackerFilters.ts');
 const rows=[{id:'null',system_name:'機台 10',serial_number:null,assigned_engineer:null,created_at:null},{id:'old',system_name:'機台 2',assigned_engineer:'工程師陳',created_at:'2026-10-02T00:00:00Z'},{id:'offset',system_name:'機台 3',created_at:'2026-10-02T08:00:01+08:00'},{id:'invalid',system_name:'備用',created_at:'invalid'}];
 assert.deepEqual(Array.from(filterAndSortTrackerSystems(rows,{search:' 陳 '}),r=>r.id),['old']);assert.deepEqual(Array.from(filterAndSortTrackerSystems(rows,{search:'機台',sort:'machine-asc'}),r=>r.id),['old','offset','null']);assert.deepEqual(Array.from(filterAndSortTrackerSystems(rows,{sort:'created-desc'}),r=>r.id),['offset','old','invalid','null']);assert.deepEqual(rows.map(r=>r.id),['null','old','offset','invalid'],'filters never mutate source rows');
 const {createBlankProject,BUILT_IN_TEMPLATES}=load('src/components/pcb-designer/defaults.ts'),{exportProjectJson,exportBomCsv}=load('src/components/pcb-designer/core/exports.ts'),{parseProjectJson}=load('src/components/pcb-designer/core/validation.ts');
 const project=createBlankProject();project.name='測試,"繁體"\n第二行';const parsed=parseProjectJson(exportProjectJson(project));assert.equal(parsed.ok,true);assert.equal(parsed.value.name,project.name);
 const component=structuredClone(BUILT_IN_TEMPLATES.find(t=>t.project.components.length).project.components[0]);component.name=project.name;const csv=exportBomCsv([component]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"測試,""繁體""\n第二行"'));assert.ok(csv.includes(',1,'));
});

test('workspace access fails closed for inactive accounts and while another account permissions are pending',async()=>{
 let user={userId:'A'},status='active',pending=null,current;
 const db=database(q=>q.table==='system_users'?(pending?.promise??ok({role:'engineer',status,permissions:{workspaceAccess:{'station-status':'edit'},pagePermissions:['dashboard_view','dashboard_edit']}})):ok([]));
 const load=loader({mocks:{'@/components/auth/UserContext':{useUser:()=>({user})},'@/integrations/supabase/client':{supabase:db}}});const {PermissionsProvider,usePermissions}=load('src/hooks/usePermissions.ts');const Probe=()=>{current=usePermissions();return null;};let root;
 try{
  await act(async()=>{root=create(React.createElement(PermissionsProvider,null,React.createElement(Probe)));});await flush();assert.equal(current.getWorkspaceAccess('dashboard'),'edit');
  pending=deferred();user={userId:'B'};await act(async()=>root.update(React.createElement(PermissionsProvider,null,React.createElement(Probe))));await flush();assert.equal(current.getWorkspaceAccess('dashboard'),'none');assert.equal(current.canEditModule('dashboard'),false);assert.equal(current.canViewModule('dashboard'),false);
  await act(async()=>pending.resolve(ok({role:'super_admin',status:'inactive',permissions:{workspaceAccess:{'station-status':'edit'},performanceManager:true}})));await flush();assert.equal(current.getWorkspaceAccess('dashboard'),'none');assert.equal(current.isPerformanceManager,false);
 }finally{await act(async()=>root?.unmount());}
});

test('two independent clients competing for the same version preserve the loser draft and never overwrite the winner',async()=>{
 let server,accepted=0,attempts=0;
 const a=await mount();server=a.row;
 const run=q=>{if(q.method==='select')return ok([server]);attempts++;if(q.filters.updated_at!==server.updated_at)return ok(null);accepted++;server={...server,...q.payload,updated_at:v(accepted)};return ok(server);};
 a.run(run);const b=await mount({run});try{
  await a.edit(draft(a.doc,'client-A'));await b.edit(draft(b.doc,'client-B'));await flush(1300);
  assert.equal(attempts,2);assert.equal(accepted,1);assert.equal(server.document.sites[0].label,'client-A');assert.equal(a.state.syncState,'synced');assert.equal(b.state.syncState,'error');assert.equal(b.doc.sites[0].label,'client-B');
  const recovery=JSON.parse(b.win.localStorage.getItem('data-center-draft:audit-user:A'));assert.equal(recovery.baseVersion,v(0));assert.equal(recovery.document.sites[0].label,'client-B');
  await act(async()=>{b.db.channels[0].status('CHANNEL_ERROR');b.db.channels[0].status('SUBSCRIBED');});await flush(200);assert.equal(b.doc.sites[0].label,'client-B');assert.equal(accepted,1);
 }finally{await a.unmount();await b.unmount();}
});

test('Data-center accepts a later commit with an older transaction-start version and ignores replay',async()=>{
 const h=await mount();try{
  const event={eventType:'UPDATE',old:{},commit_timestamp:v(4),new:{...h.row,document:draft(h.document,'new-commit'),updated_at:'2026-10-02T00:59:00Z'}};
  await act(async()=>h.db.channels[0].emit('data_center_projects',event));await flush();assert.equal(h.doc.sites[0].label,'new-commit');
  await act(async()=>h.db.channels[0].emit('data_center_projects',{...event,commit_timestamp:v(3),new:{...h.row,document:draft(h.document,'late-old'),updated_at:v(3)}}));await flush();assert.equal(h.doc.sites[0].label,'new-commit');
 }finally{await h.unmount();}
});

test('old account write receipt cannot clear a new account write or mark its unsent edit clean',async()=>{
 const h=await mount(),old=deferred(),current=deferred();let count=0;
 try{
  h.run(q=>q.method==='select'?ok([{...h.row,document:draft(h.document,'new-account-server'),updated_at:v(2)}]):q.payload.updated_by==='audit-user'?old.promise:++count===1?current.promise:ok({...h.row,...q.payload,updated_at:v(4)}));
  await h.edit(draft(h.doc,'old-account-dirty'));await flush(1250);await h.account('other-user');await h.edit(draft(h.doc,'new-account-first'));await flush(1250);
  await act(async()=>old.resolve(ok({...h.row,document:draft(h.document,'old-account-dirty'),updated_at:v(1)})));await h.edit(draft(h.doc,'new-account-trailing'));await flush(1250);assert.equal(count,1,'old receipt cannot release the new write lock');assert.equal(h.doc.sites[0].label,'new-account-trailing');
  await act(async()=>current.resolve(ok({...h.row,document:draft(h.document,'new-account-first'),updated_at:v(3)})));await flush(1250);assert.equal(count,2);assert.equal(h.state.syncState,'synced');
 }finally{await h.unmount();}
});

test('20 clients process 20,000 duplicate/out-of-order deliveries without reload amplification or leaked subscriptions',async()=>{
 const {performance}=require('node:perf_hooks');const win=browser();let state=[];const roots=[];let blocked=false,pending=[];
 const db=database(q=>{if(blocked){const d=deferred();pending.push(d);return d.promise;}return ok([]);}),toast=()=>{};
 const load=loader({window:win,mocks:{'@/components/auth/UserContext':{useUser:()=>({user:{userId:'audit'}})},'@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProjectId:'A',activeProject:null})},'@/hooks/use-toast':{useToast:()=>({toast})},'@/integrations/supabase/client':{supabase:db},'./useStationStatus':{useStationStatus:()=>[]}}});
 const {UnifiedDataProvider,useUnifiedData}=load('src/hooks/useUnifiedData.ts');const Probe=({id})=>{state[id]=useUnifiedData();return null;};
 try{
  await act(async()=>{for(let id=0;id<20;id++)roots.push(create(React.createElement(UnifiedDataProvider,null,React.createElement(Probe,{id}))));});await flush();const reads=db.reads.length,start=performance.now(),heap=process.memoryUsage().heapUsed;
  await act(async()=>{for(let n=0;n<500;n++)for(const channel of db.channels){const change={eventType:'UPDATE',new:{id:`row-${n%50}`,project_id:'A',system_name:`機台 ${n%50}`,updated_at:v(0),overall_progress:n},old:{},commit_timestamp:new Date(Date.UTC(2026,9,2,2,0,n)).toISOString()};channel.emit('test_systems',change);channel.emit('test_systems',change);}});
  const elapsed=performance.now()-start;assert.equal(db.reads.length,reads);state.forEach(s=>{assert.equal(s.systems.length,50);assert.equal(s.systems.find(r=>r.id==='row-49').overall_progress,499);});
  blocked=true;await act(async()=>{db.channels.forEach(c=>c.status('SUBSCRIBED'));win.dispatchEvent(new Event('online'));win.dispatchEvent(new Event('focus'));});await flush(180);const outstanding=pending.length;
  await act(async()=>{for(let n=0;n<50;n++){win.dispatchEvent(new Event('online'));db.channels.forEach(c=>c.status('SUBSCRIBED'));}});await flush(350);assert.equal(pending.length,outstanding,'blocked read burst cannot create overlapping snapshots');assert.equal(outstanding,100,'five read tables per client');
  blocked=false;await act(async()=>pending.splice(0).forEach(d=>d.resolve(ok([]))));await flush(200);assert.equal(db.channels.filter(c=>!c.removed).length,20);
  console.log(JSON.stringify({simulation:'isolated synchronous React/mock transport',clients:20,deliveries:20000,eventBatchMs:Math.round(elapsed),heapDeltaBytes:process.memoryUsage().heapUsed-heap,recoveryMaxOutstanding:outstanding,rowEventExtraReads:0}));
 }finally{await act(async()=>roots.forEach(r=>r.unmount()));assert.equal(db.channels.filter(c=>!c.removed).length,0);}
});
test('semantic JSON key order, including real PostgreSQL jsonb roundtrip, must not create a dirty autosave',async()=>{
 const h=await mount({normalizeApply:true});
 try {
  const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'));
  const {PGlite}=qa('@electric-sql/pglite');const pg=await PGlite.create();
  let stored;try {stored=(await pg.query('select $1::jsonb as document',[JSON.stringify({...h.document,compatibilityExtension:{中文:'保留'}})])).rows[0].document;}finally{await pg.close();}
  h.run(q=>ok(q.method==='select'?[{...h.row,document:stored}]:{...h.row,...q.payload,document:permute(q.payload.document),updated_at:v(1)}));
  await act(async()=>h.state.retry());await flush(1250);
  assert.equal(h.db.reads.filter(q=>q.method==='update').length,0,'unchanged jsonb document must not autosave');
  assert.equal(h.state.syncState,'synced');
  await h.edit(draft(h.doc,'manual'));
  await flush(1250);assert.equal(h.state.syncState,'synced');
  assert.equal(h.db.reads.find(q=>q.method==='update').payload.document.compatibilityExtension.中文,'保留','unknown fields survive an intentional edit');
  await act(async()=>h.db.channels[0].emit('data_center_projects',{eventType:'UPDATE',new:{...h.row,document:permute({...h.doc,compatibilityExtension:{中文:'保留'}}),updated_at:v(2),updated_by:'audit-user'}}));await flush(10);
  assert.equal(h.state.syncState,'synced','own reordered echo is semantically equal');
 }finally{await h.unmount();}
});
test('Data-center recovery snapshot cannot overwrite a newer streamed version',async()=>{
 const h=await mount(),pending=deferred();try{
  h.run(q=>q.method==='select'?pending.promise:ok(null));await act(async()=>h.state.retry());await flush();
  await act(async()=>h.db.channels[0].emit('data_center_projects',{eventType:'UPDATE',new:{...h.row,document:draft(h.document,'stream-new'),updated_at:v(2)}}));await flush(10);
  await act(async()=>pending.resolve(ok([h.row])));await flush(10);
  assert.equal(h.doc.sites[0].label,'stream-new','old snapshot must not roll back streamed state');
  assert.equal(h.state.selectedProject.updatedAt,v(2));
 }finally{await h.unmount();}
});
test('Data-center reconnect restores a missed event through a coalesced recovery read',async()=>{
 const h=await mount();try{
  h.run(q=>ok(q.method==='select'?[{...h.row,document:draft(h.document,'missed'),updated_at:v(2)}]:null));const reads=h.db.reads.length;
  await act(async()=>{h.db.channels[0].status?.('CHANNEL_ERROR');h.db.channels[0].status?.('SUBSCRIBED');h.win.dispatchEvent(new Event('online'));h.win.dispatchEvent(new Event('focus'));});await flush(200);
  assert.equal(h.doc.sites[0].label,'missed');assert.equal(h.db.reads.length,reads+1,'recovery burst makes one read');
 }finally{await h.unmount();}
});
test('a write completing for the previous project must release the trailing save of the selected project',async()=>{
 const h=await mount(),pending=deferred();try{
  const b={...h.row,id:'B',project_key:'b',name:'B'};h.run(q=>q.method==='select'?ok([h.row,b]):q.filters.id==='A'?pending.promise:ok({...b,...q.payload,updated_at:v(1)}));
  await act(async()=>h.state.retry());await flush(10);await h.edit(draft(h.document,'A-dirty'));await flush(1250);
  h.win.confirm=()=>true;await act(async()=>h.state.selectProject('B'));await flush(10);await h.edit(draft(h.document,'B-dirty'));await flush(1250);
  await act(async()=>pending.resolve(ok({...h.row,document:draft(h.document,'A-dirty'),updated_at:v(1)})));await flush(1250);
  assert.ok(h.db.reads.some(q=>q.method==='update'&&q.filters.id==='B'),'pending B edit must be sent after A write settles');assert.equal(h.doc.sites[0].label,'B-dirty');assert.equal(h.state.syncState,'synced');
 }finally{await h.unmount();}
});
test('edits made while an empty shared project initializes are saved after the initialization receipt',async()=>{
 const pending=deferred();let writes=0;const h=await mount({run:q=>q.method==='select'?ok([{id:'A',project_key:'a',name:'A',document:{},updated_at:v(0)}]):++writes===1?pending.promise:ok({id:'A',document:q.payload.document,updated_at:v(2)})});
 try{
  await h.edit(draft(h.document,'typed-during-init'));await act(async()=>pending.resolve(ok({...h.row,document:h.document,updated_at:v(1)})));await flush(1250);
  assert.equal(writes,2,'receipt cannot mark an unsent newer draft as saved');assert.equal(h.db.reads.filter(q=>q.method==='update')[1].payload.document.sites[0].label,'typed-during-init');assert.equal(h.state.syncState,'synced');
 }finally{await h.unmount();}
});
test('a conflicted draft keeps its original base across leave and reopen; server is never overwritten',async()=>{
 const load=loader(),{INITIAL_SITE_PLANS}=load('src/components/data-center/dataCenterSeed.ts');
 const document={schemaVersion:1,sites:structuredClone(INITIAL_SITE_PLANS),facilityPlans:{},modelOverrides:{}};
 const win=browser(),key='data-center-draft:audit-user:A';win.localStorage.setItem(key,JSON.stringify({document:draft(document,'old-draft'),baseVersion:v(0)}));
 let writes=0;const server={id:'A',project_key:'a',name:'A',document:draft(document,'server-new'),updated_at:v(2)};
 const run=q=>q.method==='select'?ok([server]):(writes++,ok({...server,...q.payload,updated_at:v(3)}));
 let h=await mount({run,windowTarget:win});assert.equal(h.state.syncState,'error');win.confirm=()=>true;
 win.dispatchEvent(new Event('workspace-before-navigate',{cancelable:true}));await h.unmount();
 const retained=JSON.parse(win.localStorage.getItem(key));h=await mount({run,windowTarget:win});
 try {await flush(1250);assert.equal(retained.baseVersion,v(0),'preserving a conflicted draft must not rebase it to the observed server');assert.equal(h.state.syncState,'error');assert.equal(writes,0);assert.equal(h.doc.sites[0].label,'old-draft');}finally{await h.unmount();}
});
test('same-account PCB instances retain independent recovery, and saving one cannot clear another',async()=>{
 const win=browser(),load=loader({window:win});const {PcbLocalRepository}=load('src/components/pcb-designer/core/storage.ts');const repo=new PcbLocalRepository(win.localStorage);repo.save(repo.load());
 const {usePcbWorkspace}=load('src/components/pcb-designer/hooks/usePcbWorkspace.ts');const identity={userId:'same-user',username:'same-user',displayName:'Audit'};const workspaces={};
 const Probe=({id})=>{workspaces[id]=usePcbWorkspace({canEdit:true,storage:win.localStorage,editor:identity,recoveryClientId:id});return null;};let a,b;
 try{
  await act(async()=>{a=create(React.createElement(Probe,{id:'tab-A'}));b=create(React.createElement(Probe,{id:'tab-B'}));});await flush();
  await act(async()=>workspaces['tab-A'].renameProject(workspaces['tab-A'].activeProject.id,'A-draft'));
  await act(async()=>workspaces['tab-B'].renameProject(workspaces['tab-B'].activeProject.id,'B-draft'));
  await act(async()=>{a.unmount();a=create(React.createElement(Probe,{id:'tab-A'}));});await flush();
  assert.equal(workspaces['tab-A'].activeProject.name,'A-draft','A must not restore B recovery');
  await act(async()=>workspaces['tab-B'].saveNow());
  await act(async()=>{a.unmount();a=create(React.createElement(Probe,{id:'tab-A'}));});await flush();
  assert.equal(workspaces['tab-A'].activeProject.name,'A-draft');assert.equal(workspaces['tab-A'].hasUnsavedChanges,true,'B save only clears its own acknowledged draft');
 }finally{await act(async()=>{a?.unmount();b?.unmount();});}
});
test('committed event order overrides transaction-start updated_at; tombstones and reinsert retain that ordering',()=>{
 const {acceptRowChange,applyRowChange,reconcileSnapshot}=loader()('src/lib/realtimeRows.ts'),clocks=new Map();
 const row={id:'one',project_id:'A',updated_at:v(2),value:'earlier-commit'};
 const later={eventType:'UPDATE',new:{...row,updated_at:v(1),value:'later-commit'},old:{},commit_timestamp:v(4)};
 assert.equal(acceptRowChange(clocks,later),true);let rows=applyRowChange([row],later,'A');assert.equal(rows[0].value,'later-commit');
 const deleted={eventType:'DELETE',new:{},old:{id:'one'},commit_timestamp:v(5)};assert.equal(acceptRowChange(clocks,deleted),true);rows=applyRowChange(rows,deleted,'A');
 assert.equal(acceptRowChange(clocks,later),false);assert.equal(rows.length,0);
 const inserted={...later,eventType:'INSERT',commit_timestamp:v(6)};assert.equal(acceptRowChange(clocks,inserted),true);rows=applyRowChange(rows,inserted,'A');assert.equal(rows.length,1);
 assert.equal(reconcileSnapshot([row],[inserted,later],'A')[0].value,'later-commit');
});
test('a queued reorder is sorted again after snapshot reconciliation',async()=>{
 const db=database(q=>ok(q.table==='test_flow_stations'?[{id:'S1',project_id:'A',station_order:1},{id:'S2',project_id:'A',station_order:2}]:[]));let state;
 const toast=()=>{};const load=loader({mocks:{'@/components/auth/UserContext':{useUser:()=>({user:{userId:'audit'}})},'@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProjectId:'A',activeProject:null})},'@/hooks/use-toast':{useToast:()=>({toast})},'@/integrations/supabase/client':{supabase:db},'./useStationStatus':{useStationStatus:()=>[]}}});
 const {UnifiedDataProvider,useUnifiedData}=load('src/hooks/useUnifiedData.ts');const Probe=()=>{state=useUnifiedData();return null;};let root;
 try {await act(async()=>{root=create(React.createElement(UnifiedDataProvider,null,React.createElement(Probe)));});await flush();const pending=deferred();db.from=table=>database(q=>table==='test_flow_stations'?pending.promise:ok([])).from(table);
  let reading;await act(async()=>{reading=state.refetch();});await flush();await act(async()=>db.channels[0].emit('test_flow_stations',{eventType:'UPDATE',new:{id:'S2',project_id:'A',station_order:0},old:{},commit_timestamp:v(3)}));
  await act(async()=>{pending.resolve(ok([{id:'S1',project_id:'A',station_order:1},{id:'S2',project_id:'A',station_order:2}]));await reading;});assert.deepEqual(Array.from(state.stations,s=>s.id),['S2','S1']);
 }finally{await act(async()=>root?.unmount());}
});
