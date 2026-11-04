const test = require('node:test');
const assert = require('node:assert/strict');
const {React, act, create, loader, database, deferred} = require('./support/renderHarness.cjs');

async function fixture(t, run) {
  const db = database(run);
  const {useMaterialPersonalMarks} = loader({mocks:{'@/integrations/supabase/client':{supabase:db}}})('src/components/material-requests/useMaterialPersonalMarks.ts');
  let value, root;
  function Probe(props) { value = useMaterialPersonalMarks(props.account, props.workspace, props.enabled); return null; }
  const render = async (account='A', workspace='board-1', enabled=true) => act(async()=>{const node=React.createElement(Probe,{account,workspace,enabled});if(root)root.update(node);else root=create(node);});
  await render();
  t.after(()=>act(async()=>root.unmount()));
  return {db,render,get value(){return value;}};
}

test('personal marks load only the current account and board, and never reuse another account state',async t=>{
  const f=await fixture(t,q=>({data:q.method==='select'?[{group_key:`${q.filters.owner_id}:${q.filters.workspace_id}`}]:[],error:null}));
  assert.deepEqual([...f.value.keys],['A:board-1']);
  const staleToggle=f.value.toggle;
  await f.render('B');
  assert.deepEqual([...f.value.keys],['B:board-1']);
  await act(async()=>staleToggle('private-A'));
  assert.equal(f.db.reads.filter(q=>q.method!=='select').length,0);
  await f.render('B','board-2');
  assert.deepEqual([...f.value.keys],['B:board-2']);
  await f.render('B','board-2',false);
  assert.equal(f.value.keys.size,0);assert.equal(f.value.ready,false);
});

test('a failed mark write rolls back only that mark, remains visible as an error, and can be retried',async t=>{
  let fail=true;
  const f=await fixture(t,q=>({data:q.method==='select'?[{group_key:'already-marked'}]:[],error:q.method!=='select'&&fail?new Error('offline'):null}));
  await act(async()=>f.value.toggle('new-mark'));
  assert.deepEqual([...f.value.keys],['already-marked']);assert.match(f.value.error,/儲存失敗/);
  fail=false;await act(async()=>f.value.toggle('new-mark'));
  assert.equal(f.value.keys.has('new-mark'),true);
  const write=f.db.reads.find(q=>q.method==='upsert');
  assert.equal(write.payload[0].owner_id,'A');assert.equal(write.payload[0].workspace_id,'board-1');
  await act(async()=>f.value.toggle('new-mark'));
  const deletion=f.db.reads.find(q=>q.method==='delete');
  assert.deepEqual(deletion.filters,{owner_id:'A',workspace_id:'board-1',group_key:'new-mark'});
});

test('pending writes cannot double-toggle or restore old account data after switching away and back',async t=>{
  const pending=deferred();
  const f=await fixture(t,q=>q.method==='select'?{data:[],error:null}:pending.promise);
  let save;
  await act(async()=>{save=f.value.toggle('R1');});
  assert.equal(f.value.pendingKeys.has('R1'),true);
  await act(async()=>{void f.value.toggle('R1');});
  assert.equal(f.db.reads.filter(q=>q.method==='upsert').length,1);
  await f.render('B');await f.render('A');
  await act(async()=>{pending.resolve({error:new Error('late failure')});await save;});
  assert.equal(f.value.keys.size,0);assert.equal(f.value.error,'');
});

test('a failed read exposes retry without accepting edits or treating it as an empty saved list',async t=>{
  let fail=true;
  const f=await fixture(t,()=>fail?{data:null,error:new Error('offline')}:{data:[{group_key:'R1'}],error:null});
  assert.equal(f.value.ready,false);assert.match(f.value.error,/載入失敗/);
  await act(async()=>f.value.toggle('R2'));assert.equal(f.db.reads.length,1);
  fail=false;await act(async()=>f.value.reload());
  assert.equal(f.value.ready,true);assert.equal(f.value.keys.has('R1'),true);
});

test('marking a merged main saves all location IDs together and a failed write restores a partial selection',async t=>{
  let fail=true;
  const f=await fixture(t,q=>({data:q.method==='select'?[{group_key:'record::C1'}]:[],error:q.method!=='select'&&fail?new Error('offline'):null}));
  await act(async()=>f.value.toggle(['record::C1','record::C2']));
  assert.deepEqual([...f.value.keys],['record::C1']);
  fail=false;await act(async()=>f.value.toggle(['record::C1','record::C2']));
  assert.equal(f.value.keys.size,2);
  const write=f.db.reads.filter(q=>q.method==='upsert').at(-1);
  assert.deepEqual([...write.payload.map(row=>row.group_key)],['record::C1','record::C2']);
  await act(async()=>f.value.toggle(['record::C1','record::C2']));assert.equal(f.value.keys.size,0);
});
