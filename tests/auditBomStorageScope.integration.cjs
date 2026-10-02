const test=require('node:test'),assert=require('node:assert/strict');
const {React,act,create,deferred,loader,database,flush,browser}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});
async function fixture(run,windowTarget){
 const db=database(run),load=loader({window:windowTarget,mocks:{'@/integrations/supabase/client':{supabase:db}},
  transform:(source,file)=>file.endsWith('materialBomStorage.ts')?((process.env.AUDIT_STORAGE_BASE?require('node:child_process').execFileSync('git',['show',`${process.env.AUDIT_STORAGE_BASE}:src/components/material-requests/materialBomStorage.ts`],{encoding:'utf8'}):source)+'\nexport {runRenderCacheRequest};'):source});
 const {useWorkspaceMutationScope}=load('src/hooks/useWorkspaceMutationScope.ts');let scope,account='A',editable=true,root;
 const Probe=()=>{scope=useWorkspaceMutationScope(account,editable);return null;};await act(async()=>{root=create(React.createElement(Probe));});
 const token=scope.capture(),guard=()=>scope.assertCurrent(token);
 const workspace={id:'fixture',name:'AUDIT_LOCAL',updatedAt:'2026-10-02T00:00:00Z',payload:{sourceFile:'fixture.xlsx',sheetName:'Sheet',generatedAt:'now',recordCount:405,records:Array.from({length:405},(_,i)=>({id:`r-${i}`}))}};
 return {db,storage:load('src/components/material-requests/materialBomStorage.ts'),workspace,guard,
  revoke:async()=>{editable=false;await act(async()=>root.update(React.createElement(Probe)));},
  switch:async()=>{account='B';await act(async()=>root.update(React.createElement(Probe)));},
  stop:()=>act(async()=>root.unmount())};
}
test('actual BOM storage stops after pending metadata receipt when edit permission is revoked',async()=>{
 const pending=deferred(),f=await fixture(q=>q.table==='material_bom_workspaces'?pending.promise:ok([]));try{
  const saving=f.storage.saveBomWorkspace(f.workspace,f.guard);await flush();await f.revoke();pending.resolve(ok({updated_at:'saved'}));await assert.rejects(()=>saving);
  assert.equal(f.db.reads.length,1,'no record lookup/upsert or cleanup starts after revoked metadata receipt');
 }finally{await f.stop();}
});
test('actual BOM storage stops subsequent record batches and finalization after account switch',async()=>{
 const pending=deferred();let batches=0;const f=await fixture(q=>q.table==='material_bom_records'&&q.method==='upsert'?(batches++,pending.promise):ok(q.method==='select'?[]:{updated_at:'saved'}));try{
  const saving=f.storage.saveBomWorkspace(f.workspace,f.guard);await flush();assert.equal(batches,1);await f.switch();pending.resolve(ok(null));await assert.rejects(()=>saving);
  assert.equal(batches,1,'second and third 200-row batches must not start');assert.equal(f.db.reads.filter(q=>q.table==='material_bom_workspaces'&&q.method==='upsert').length,1,'no final metadata rewrite');
 }finally{await f.stop();}
});

test('actual BOM storage stops after a pending existing-record lookup under the replacement account',async()=>{
 const pending=deferred(),f=await fixture(q=>q.table==='material_bom_records'&&q.method==='select'?pending.promise:ok({updated_at:'saved'}));try{
  const saving=f.storage.saveBomWorkspace(f.workspace,f.guard);await flush();await f.switch();pending.resolve(ok([]));await assert.rejects(()=>saving);
  assert.equal(f.db.reads.filter(q=>q.table==='material_bom_records'&&q.method!=='select').length,0,'no record write starts after the stale SELECT receipt');
  assert.equal(f.db.reads.filter(q=>q.table==='material_bom_workspaces'&&q.method==='upsert').length,1,'already-issued original metadata write remains; no replacement-account finalization');
 }finally{await f.stop();}
});
test('actual BOM removal cannot send preference cleanup under the replacement account',async()=>{
 const pending=deferred(),f=await fixture(q=>q.table==='material_bom_workspaces'?pending.promise:ok(null));try{
  const removing=f.storage.removeBomWorkspace('fixture',f.guard);await flush();await f.switch();pending.resolve(ok(null));await assert.rejects(()=>removing);assert.equal(f.db.reads.length,1);
 }finally{await f.stop();}
});
test('actual BOM record save rechecks after version lookup before changing the row',async()=>{
 const pending=deferred(),f=await fixture(q=>q.table==='material_bom_records'&&q.method==='select'?pending.promise:ok({updated_at:'saved'}));try{
  const saving=f.storage.saveBomWorkspaceRecord(f.workspace,f.workspace.payload.records[0],f.guard);await flush();await f.revoke();pending.resolve(ok({updated_at:'version'}));await assert.rejects(()=>saving);
  assert.equal(f.db.reads.filter(q=>q.table==='material_bom_records'&&q.method!=='select').length,0);
 }finally{await f.stop();}
});
test('actual BOM storage stops subsequent obsolete-record deletion batches after revocation',async()=>{
 const pending=deferred();let deleted=0;const f=await fixture(q=>q.table==='material_bom_records'&&q.method==='delete'?(deleted++,pending.promise):ok(q.method==='select'?Array.from({length:405},(_,i)=>({record_id:`old-${i}`})):{updated_at:'saved'}));try{
  const saving=f.storage.saveBomWorkspace({...f.workspace,payload:{...f.workspace.payload,records:[],recordCount:0}},f.guard);await flush();await f.revoke();pending.resolve(ok(null));await assert.rejects(()=>saving);assert.equal(deleted,1);
 }finally{await f.stop();}
});
test('authorized actual BOM storage still saves all three batches and finalizes metadata',async()=>{
 const f=await fixture(q=>ok(q.method==='select'?[]:{updated_at:'saved'}));try{
  await f.storage.saveBomWorkspace(f.workspace,f.guard);assert.equal(f.db.reads.filter(q=>q.table==='material_bom_records'&&q.method==='upsert').length,3);assert.equal(f.db.reads.filter(q=>q.table==='material_bom_workspaces'&&q.method==='upsert').length,2);
 }finally{await f.stop();}
});
test('actual IndexedDB cache transaction rechecks scope after asynchronous database opening',async()=>{
 const win=browser();let opening,writes=0;win.indexedDB={open(){opening={};return opening;}};
 const f=await fixture(()=>ok(null),win);try{
  const writing=f.storage.runRenderCacheRequest('readwrite',store=>store.put('old-account-cache'),f.guard);await flush();await f.switch();
  opening.result={transaction(){return {objectStore(){return {put(){writes++;const request={};setTimeout(()=>request.onsuccess(),0);return request;}};}};}};
  opening.onsuccess();await assert.rejects(()=>writing);assert.equal(writes,0,'no late cache write under replacement account');
 }finally{await f.stop();}
});
