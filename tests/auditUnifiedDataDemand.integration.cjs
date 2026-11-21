// The project's test rows (systems, stations, items, contents, progress) are loaded and followed only while a page
// reads them. The provider sits above every workspace; before 2026-11-21 it fetched the five tables at every start and
// again at every return to the tab, whatever page was open, although only the legacy test tracker shows them.
const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,browser,database,loader,flush}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});
const TABLES=['station_contents','test_flow_items','test_flow_stations','test_progress','test_systems'];

test('test rows load when the first reader mounts, stop when the last one leaves, and a watcher never loads them',async()=>{
 // One toast function for every render, as the real hook returns (a new one each render would reload for ever).
 const window=browser(),toast=()=>{};
 const db=database(q=>q.table==='test_systems'?ok([{id:'one',project_id:'A',system_name:'Audit',updated_at:'2026-10-02T00:00:00Z',status:'Pending'}]):ok([]));
 const load=loader({window,mocks:{'@/components/auth/UserContext':{useUser:()=>({user:{userId:'audit'}})},'@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProjectId:'A',activeProject:null})},'@/hooks/use-toast':{useToast:()=>({toast})},'@/integrations/supabase/client':{supabase:db},'./useStationStatus':{useStationStatus:()=>[]}}});
 const {UnifiedDataProvider,useUnifiedData}=load('src/hooks/useUnifiedData.ts');
 let watcher,reader,root;
 // The shell's update indicator: watches, never asks for the rows.
 const Watcher=()=>{watcher=useUnifiedData({demand:false});return null;};
 const Reader=()=>{reader=useUnifiedData();return null;};
 // `page` names the reader: another name is another component instance (one page left, another opened).
 const App=({readers,page='tracker'})=>React.createElement(UnifiedDataProvider,null,React.createElement(Watcher),...Array.from({length:readers},(_,index)=>React.createElement(Reader,{key:`${page}:${index}`})));
 const show=(readers,page)=>act(async()=>{root.update(React.createElement(App,{readers,page}));});
 const focus=async()=>{await act(async()=>{window.dispatchEvent(new Event('focus'));});await flush(250);};
 try{
  await act(async()=>{root=create(React.createElement(App,{readers:0}));});await flush();
  assert.equal(db.reads.length,0,'no reader: no snapshot at start');
  assert.equal(db.channels.length,0,'no reader: no realtime channel');
  await focus();
  assert.equal(db.reads.length,0,'no reader: returning to the tab reloads nothing');
  assert.equal(watcher.isUpdating,false);

  await show(1);await flush();
  assert.deepEqual(db.reads.map(read=>read.table).sort(),TABLES,'the first reader loads the five tables once');
  assert.equal(db.channels.length,1);
  assert.equal(reader.isLoading,false);
  assert.equal(reader.systems.length,1);
  assert.equal(watcher.systems.length,1,'a watcher sees what a reader caused to load');

  // A second reader shares the same snapshot and channel.
  await show(2);await flush();
  assert.equal(db.reads.length,5);assert.equal(db.channels.length,1);
  await show(1);await flush();
  assert.equal(db.channels[0].removed,false,'one reader left: still followed');
  await focus();
  assert.equal(db.reads.length,10,'with a reader, returning to the tab reloads as before');

  // One reader leaves and another mounts in the same commit: still one reader, so nothing is dropped or reloaded.
  await show(1,'dashboard');await flush();
  assert.equal(db.reads.length,10,'a reader swapped for another in one commit does not reload');
  assert.equal(db.channels.length,1);assert.equal(db.channels[0].removed,false);
  assert.equal(reader.systems.length,1);

  const lateRefetch=reader.refetch;
  await show(0);await flush();
  assert.equal(db.channels[0].removed,true,'the last reader left: the channel is closed');
  await act(async()=>{await lateRefetch();await watcher.refetch();});await flush();
  assert.equal(db.reads.length,10,'a refetch that arrives after the last reader left loads nothing');
  assert.equal(watcher.systems.length,0,'and the rows are dropped, so a later reader cannot see another moment\'s rows');
  assert.equal(watcher.isLoading,true);
  await focus();
  assert.equal(db.reads.length,10,'no reader again: nothing reloads');

  await show(1);await flush();
  assert.equal(db.reads.length,15,'a new reader loads again');
  assert.equal(db.channels.length,2);assert.equal(db.channels[1].removed,false);
  assert.equal(reader.systems.length,1);assert.equal(reader.isLoading,false);
 }finally{await act(async()=>root?.unmount());}
});
