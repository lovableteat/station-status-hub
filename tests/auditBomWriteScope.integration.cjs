const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {React,act,create,deferred,loader,flush}=require('./support/renderHarness.cjs');
const source=process.env.AUDIT_BOM_BASE?require('node:child_process').execFileSync('git',['show',`${process.env.AUDIT_BOM_BASE}:src/components/material-requests/MaterialRequestPage.tsx`],{encoding:'utf8'}):fs.readFileSync('src/components/material-requests/MaterialRequestPage.tsx','utf8');
const ast=ts.createSourceFile('MaterialRequestPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const handlers=new Map();
function visit(n){if(ts.isVariableDeclaration(n)&&n.initializer)handlers.set(n.name.getText(ast),n.initializer.getText(ast));ts.forEachChild(n,visit);}visit(ast);
async function mount(editable=true){
 const load=loader(),{useWorkspaceMutationScope,WorkspaceMutationScopeChangedError}=load('src/hooks/useWorkspaceMutationScope.ts');
 let account='account-A',canEdit=editable,current,root;
 function Probe(){current=useWorkspaceMutationScope(account,canEdit);return null;}
 await act(async()=>{root=create(React.createElement(Probe));});await flush();
 return {get scope(){return current;},WorkspaceMutationScopeChangedError,
  update:async(next,edit=canEdit)=>{account=next;canEdit=edit;await act(async()=>root.update(React.createElement(Probe)));await flush();},
  unmount:()=>act(async()=>root.unmount())};
}
const upload=(name)=>({key:name,file:{name,size:10,lastModified:1},payload:{sourceFile:name,sheetName:'Sheet',generatedAt:'2026-10-29T00:00:00.000Z',recordCount:1,records:[{id:'r'}]},importNotes:[],target:'__new-series__',seriesName:name});
function execute(name,h,overrides={}){
 const effects=[],writes=[],workspace={id:'W',name:'fixture',payload:{records:[],recordCount:0}},record={id:'r',qty:'1'};
 const effect=(name)=>()=>effects.push(name);
 const context={canEdit:true,canEditModuleAccess:overrides.canEdit??true,isCollaborativeReady:true,isFullDatasetLoaded:true,user:{userId:'account-A'},
  captureBomWrite:h.scope.capture,isBomWriteCurrent:h.scope.isCurrent,assertBomWriteCurrent:h.scope.assertCurrent,
  WorkspaceMutationScopeChangedError:h.WorkspaceMutationScopeChangedError,
  activeBomId:'W',bomWorkspaces:[workspace],activeWorkspace:workspace,basePayload:workspace.payload,
  isValidBomUsage:()=>true,normalizeRequestUrl:v=>v,canManageBomPageTracker:true,
  showCollaborativeUnavailableToast:effect('connection-toast'),showDatasetSyncingToast:effect('loading-toast'),
  setIsImporting:effect('busy'),setBomWorkspaces:effect('state'),setActiveBomId:effect('selection'),setExpandedKey:effect('expand'),setPage:effect('page'),setEditorOpen:effect('editor'),setTableColorDialogOpen:effect('colors'),
  setPendingUploads:effect('staged'),setUploadDialogOpen:effect('upload-dialog'),setBomManagerOpen:effect('manager'),
  replaceBomWorkspace:effect('optimistic'),toast:effect('toast'),console,
  parseMaterialWorkbookFile:async()=>({recordCount:1,records:[record],sheetName:'Sheet',importNotes:[]}),
  seriesList:[],uploadTargetSeriesRef:{current:null},inferBomSeriesForFile:()=>null,bomFileBaseName:n=>n,NEW_BOM_SERIES_TARGET:'__new-series__',
  pendingUploads:[upload('A-private.xlsx'),upload('second.xlsx')],buildBomSeriesList:()=>[],nextBomVersionNumber:()=>1,createBomSeriesId:()=>'series:new',createBomVersionWorkspaceId:(name,n)=>`bom:${name}:v${n}`,
  carryBomTracking:(_,next)=>({records:next,matched:0,orphaned:[],manual:0}),loadVersionRecords:async()=>[],
  BOM_SERIES_NAME_LIMIT:120,BOM_VERSION_LABEL_LIMIT:60,BOM_VERSION_NOTE_LIMIT:500,
  saveBomWorkspace:async w=>{writes.push(w);},saveBomWorkspaceRecord:async(w,r)=>{writes.push(w);return {updatedAt:'new'};},
  saveBomWorkspaceVersion:async()=>{writes.push('version');},uploadBomSourceFile:async()=>({name:'x.xlsx',path:'p',size:1,mimeType:'m'}),
  saveBomWorkspacePageTracker:async()=>{writes.push('tracker');},removeBomWorkspace:async()=>{writes.push('delete');},saveBomWorkspaceTableColorTheme:async()=>{writes.push('theme');},
  logMaterialWorkspaceAction:async()=>effects.push('audit'),logMaterialRecordChange:async()=>effects.push('audit'),
  reloadBomWorkspaces:async()=>effects.push('reload'),switchActiveBom:effect('selection'),
  recentLocalRecordIdsRef:{current:new Map()},loadDefaultBomWorkspace:async()=>workspace,createDefaultBomWorkspace:()=>workspace,
  getBomPageTrackerSummary:()=>({}),normalizeBomTableColorTheme:v=>v,tableColorDraft:{},
  useCallback:fn=>fn,bomAccountRef:{current:{accountId:'account-A',generation:0}},
  activeProject:null,toBomWorkspaceProject:()=>undefined,saveBomWorkspaceProject:async()=>{writes.push('project');},recentLocalWorkspaceWritesRef:{current:new Map()},
  allProjects:[{id:'P',name:'VERA'}],bomProjectAssignmentRef:{current:null},setAssigningBomProjectId:effect('project-busy'),
  ...overrides,
 };
 assert.ok(handlers.has(name),name);
 vm.runInNewContext(ts.transpileModule('var run='+handlers.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {run:context.run,writes,effects,context,record};
}
const fileEvent=()=>({target:{files:[{name:'A-private.xlsx',size:10,lastModified:1},{name:'second.xlsx',size:10,lastModified:1}],value:'file'}});
const fileWrites=(c)=>c.writes.filter(w=>typeof w==='object');
test('actual BOM import handler rejects view-only accounts before parsing or writing',async()=>{
 const h=await mount(false);try{const c=execute('handleWorkbookImport',h,{canEdit:false,parseMaterialWorkbookFile:async()=>{throw Error('must not parse');}});await c.run(fileEvent());assert.equal(c.writes.length,0);assert.deepEqual(c.effects,[]);}finally{await h.unmount();}
});
test('parsing an upload stages it for confirmation and never writes by itself',async()=>{
 const h=await mount();try{const c=execute('handleWorkbookImport',h);await c.run(fileEvent());assert.equal(c.writes.length,0);assert.ok(c.effects.includes('staged'));assert.ok(c.effects.includes('upload-dialog'));assert.equal(c.effects.includes('optimistic'),false);assert.equal(c.effects.includes('selection'),false);}finally{await h.unmount();}
});
for(const scenario of ['account-switch','logout','revoke','revoke-and-restore'])test(`actual BOM import prepared before ${scenario} cannot initiate a write after parsing`,async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('handleWorkbookImport',h,{parseMaterialWorkbookFile:()=>pending.promise});const request=c.run(fileEvent());
  if(scenario==='account-switch')await h.update('account-B',true);
  if(scenario==='logout')await h.update(null,false);
  if(scenario.startsWith('revoke'))await h.update('account-A',false);
  if(scenario==='revoke-and-restore')await h.update('account-A',true);
  pending.resolve({recordCount:1,records:[{id:'A-private'}],sheetName:'Sheet',importNotes:[]});await request;
  assert.equal(c.writes.length,0);assert.equal(c.effects.includes('optimistic'),false);assert.equal(c.effects.includes('audit'),false);assert.equal(c.effects.includes('selection'),false);
 }finally{await h.unmount();}
});
for(const scenario of ['logout','revoke'])test(`a confirmed upload prepared before ${scenario} cannot write`,async()=>{
 const h=await mount();try{
  await (scenario==='logout'?h.update(null,false):h.update('account-A',false));
  const c=execute('confirmBomUploads',h);await c.run({label:'',note:''});
  assert.equal(c.writes.length,0);assert.deepEqual(c.effects,[]);
 }finally{await h.unmount();}
});
test('completed BOM version write after account replacement has no new-account UI effects or trailing file writes',async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('confirmBomUploads',h,{saveBomWorkspace:async w=>{c.writes.push(w);await pending.promise;}});const request=c.run({label:'',note:''});await flush();assert.equal(fileWrites(c).length,1,'first version was already issued under A');
  await h.update('account-B',true);pending.resolve();await request;assert.equal(fileWrites(c).length,1,'no second file initiated');assert.deepEqual(c.effects,['busy'],'late receipt cannot log/select/clear current-account UI');
 }finally{await h.unmount();}
});
test('legitimate current-account BOM upload still writes every file as its own version and updates the directory',async()=>{
 const h=await mount();try{const c=execute('confirmBomUploads',h);await c.run({label:'EVT',note:''});assert.equal(fileWrites(c).length,2);assert.ok(c.writes.includes('version'));assert.ok(c.effects.includes('optimistic'));assert.ok(c.effects.includes('reload'));assert.ok(c.effects.includes('selection'));assert.ok(c.effects.includes('audit'));}finally{await h.unmount();}
});
for(const name of ['saveRecordToActiveBom','saveBomPageTracker','deleteBomWorkspaceById','applyTableColorTheme'])test(`actual ${name} denies view-only invocation before local or backend mutation`,async()=>{
 const h=await mount(false);try{
  const c=execute(name,h,{canEdit:false});await Promise.resolve(c.run(name==='saveRecordToActiveBom'?c.record:'W',{})).catch(e=>assert.ok(e instanceof h.WorkspaceMutationScopeChangedError));
  assert.equal(c.writes.length,0);assert.deepEqual(c.effects,[]);
 }finally{await h.unmount();}
});
test('held callbacks and unmounted mutation scope cannot revive an old permission epoch',async()=>{
 const h=await mount();const old=h.scope.capture,token=old();try{
  await h.update('account-B',true);assert.throws(old,h.WorkspaceMutationScopeChangedError);assert.equal(h.scope.isCurrent(token),false);
  const current=h.scope.capture();await h.unmount();assert.equal(h.scope.isCurrent(current),false);assert.throws(h.scope.capture,h.WorkspaceMutationScopeChangedError);
 }catch(e){await h.unmount();throw e;}
});
test('view-only empty directory does not auto-create a fallback BOM in shared storage',async()=>{
 const h=await mount(false);try{const c=execute('applyLoadedWorkspaces',h,{canEdit:false});c.run([]);await flush();assert.equal(c.writes.length,0);assert.ok(c.effects.includes('state'));}finally{await h.unmount();}
});

test('BOM project changes are shown only after persistence confirms the assignment',async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('assignBomProject',h,{toBomWorkspaceProject:p=>p?{projectId:p.id,projectName:p.name}:undefined,saveBomWorkspaceProject:async()=>{c.writes.push('project');await pending.promise;}});
  const request=c.run('W','P');await flush();assert.equal(c.writes.length,1);assert.equal(c.effects.includes('state'),false);
  await assert.rejects(c.run('W','P'),/專案正在儲存/);assert.equal(c.writes.length,1);
  pending.resolve();await request;assert.ok(c.effects.includes('state'));
 }finally{await h.unmount();}
});

test('project assignment rejects view-only access and unknown project choices before writing',async()=>{
 const viewer=await mount(false),editor=await mount();try{
  const v=execute('assignBomProject',viewer);await assert.rejects(v.run('W','P'),viewer.WorkspaceMutationScopeChangedError);assert.equal(v.writes.length,0);
  const e=execute('assignBomProject',editor);await assert.rejects(e.run('W','unknown'),/找不到選取的專案/);assert.equal(e.writes.length,0);
 }finally{await viewer.unmount();await editor.unmount();}
});

test('a failed BOM project assignment rejects so the same-dialog form can retain its choice',async()=>{
 const h=await mount();try{
  const c=execute('assignBomProject',h,{toBomWorkspaceProject:p=>({projectId:p.id,projectName:p.name}),saveBomWorkspaceProject:async()=>{throw Error('offline');}});
  await assert.rejects(c.run('W','P'));assert.equal(c.effects.includes('state'),false);
 }finally{await h.unmount();}
});

test('late project receipts cannot change the replacement account UI',async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('assignBomProject',h,{toBomWorkspaceProject:p=>({projectId:p.id,projectName:p.name}),saveBomWorkspaceProject:async()=>pending.promise});
  const request=c.run('W','P');await flush();const before=c.effects.slice();await h.update('account-B',true);pending.resolve();
  await assert.rejects(request,h.WorkspaceMutationScopeChangedError);assert.deepEqual(c.effects,before);
 }finally{await h.unmount();}
});

test('setting another version current rejects view-only access before any write',async()=>{
 const h=await mount(false);try{
  const version={workspace:{id:'V1',payload:{records:[],recordCount:0}},version:{seriesId:'s',seriesName:'n',versionNumber:1,isCurrent:false},stored:true,isCurrent:false,displayNumber:'V1'};
  const series={id:'s',name:'n',versions:[version],current:version};
  const c=execute('applyCurrentBomVersion',h,{canEdit:false,pendingCurrent:{version,series},setPendingCurrent:()=>{},carryOnSwitch:true});
  await c.run();assert.equal(c.writes.length,0);assert.deepEqual(c.effects,[]);
 }finally{await h.unmount();}
});
