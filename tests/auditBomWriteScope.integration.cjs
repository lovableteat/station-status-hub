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
function execute(name,h,overrides={}){
 const effects=[],writes=[],workspace={id:'W',name:'fixture',payload:{records:[],recordCount:0}},record={id:'r',qty:'1'};
 const effect=(name)=>()=>effects.push(name);
 const context={canEdit:true,isCollaborativeReady:true,isFullDatasetLoaded:true,user:{userId:'account-A'},
  captureBomWrite:h.scope.capture,isBomWriteCurrent:h.scope.isCurrent,assertBomWriteCurrent:h.scope.assertCurrent,
  WorkspaceMutationScopeChangedError:h.WorkspaceMutationScopeChangedError,
  activeBomId:'W',bomWorkspaces:[workspace],activeWorkspace:workspace,basePayload:workspace.payload,
  isValidBomUsage:()=>true,normalizeRequestUrl:v=>v,canManageBomPageTracker:true,
  showCollaborativeUnavailableToast:effect('connection-toast'),showDatasetSyncingToast:effect('loading-toast'),
  setIsImporting:effect('busy'),setBomWorkspaces:effect('state'),setActiveBomId:effect('selection'),setExpandedKey:effect('expand'),setPage:effect('page'),setEditorOpen:effect('editor'),setTableColorDialogOpen:effect('colors'),
  replaceBomWorkspace:effect('optimistic'),toast:effect('toast'),console,
  parseMaterialWorkbookFile:async()=>({recordCount:1,records:[record],sheetName:'Sheet'}),
  createBomId:()=> 'NEW-W',mergeImportedWorkspace:(_,id,payload)=>({id,payload}),
  saveBomWorkspace:async w=>{writes.push(w);},saveBomWorkspaceRecord:async(w,r)=>{writes.push(w);return {updatedAt:'new'};},
  saveBomWorkspacePageTracker:async()=>{writes.push('tracker');},removeBomWorkspace:async()=>{writes.push('delete');},saveBomWorkspaceTableColorTheme:async()=>{writes.push('theme');},
  logMaterialWorkspaceAction:async()=>effects.push('audit'),logMaterialRecordChange:async()=>effects.push('audit'),
  reloadBomWorkspaces:async()=>effects.push('reload'),switchActiveBom:effect('selection'),
  recentLocalRecordIdsRef:{current:new Map()},loadDefaultBomWorkspace:async()=>workspace,createDefaultBomWorkspace:()=>workspace,
  getBomPageTrackerSummary:()=>({}),normalizeBomTableColorTheme:v=>v,tableColorDraft:{},
  useCallback:fn=>fn,bomAccountRef:{current:{accountId:'account-A',generation:0}},
  ...overrides,
 };
 assert.ok(handlers.has(name),name);
 vm.runInNewContext(ts.transpileModule('var run='+handlers.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {run:context.run,writes,effects,context,record};
}
const fileEvent=()=>({target:{files:[{name:'A-private.xlsx'},{name:'second.xlsx'}],value:'file'}});
test('actual BOM import handler rejects view-only accounts before parsing or writing',async()=>{
 const h=await mount(false);try{const c=execute('handleWorkbookImport',h,{canEdit:false,parseMaterialWorkbookFile:async()=>{throw Error('must not parse');}});await c.run(fileEvent());assert.equal(c.writes.length,0);assert.deepEqual(c.effects,[]);}finally{await h.unmount();}
});
for(const scenario of ['account-switch','logout','revoke','revoke-and-restore'])test(`actual BOM import prepared before ${scenario} cannot initiate a write after parsing`,async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('handleWorkbookImport',h,{parseMaterialWorkbookFile:()=>pending.promise});const request=c.run(fileEvent());
  if(scenario==='account-switch')await h.update('account-B',true);
  if(scenario==='logout')await h.update(null,false);
  if(scenario.startsWith('revoke'))await h.update('account-A',false);
  if(scenario==='revoke-and-restore')await h.update('account-A',true);
  pending.resolve({recordCount:1,records:[{id:'A-private'}],sheetName:'Sheet'});await request;
  assert.equal(c.writes.length,0);assert.equal(c.effects.includes('optimistic'),false);assert.equal(c.effects.includes('audit'),false);assert.equal(c.effects.includes('selection'),false);
 }finally{await h.unmount();}
});
test('completed BOM insert after account replacement has no new-account UI effects or trailing file writes',async()=>{
 const h=await mount(),pending=deferred();try{
  const c=execute('handleWorkbookImport',h,{saveBomWorkspace:async w=>{c.writes.push(w);await pending.promise;}});const request=c.run(fileEvent());await flush();assert.equal(c.writes.length,1,'first request was already issued under A');
  await h.update('account-B',true);pending.resolve();await request;assert.equal(c.writes.length,1,'no second file initiated');assert.deepEqual(c.effects,['busy'],'late receipt cannot log/select/clear current-account UI');
 }finally{await h.unmount();}
});
test('legitimate current-account BOM import still writes all files and updates the directory',async()=>{
 const h=await mount();try{const c=execute('handleWorkbookImport',h);await c.run(fileEvent());assert.equal(c.writes.length,2);assert.ok(c.effects.includes('optimistic'));assert.ok(c.effects.includes('reload'));assert.ok(c.effects.includes('selection'));}finally{await h.unmount();}
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
