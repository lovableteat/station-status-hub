const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,deferred,database,loader,flush}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});
const time=minute=>`2026-10-02T00:${String(minute).padStart(2,'0')}:00Z`;

test('snapshot transaction-start is a commit lower bound: reject provably old commit, accept later commit with older row time',()=>{
 const {reconcileSnapshot}=loader()('src/lib/realtimeRows.ts');
 const snapshot={id:'one',project_id:'A',updated_at:time(2),status:'Done'};
 const older={eventType:'UPDATE',old:{},new:{...snapshot,updated_at:time(1),status:'On-going'},commit_timestamp:'2026-10-02T00:01:01Z'};
 assert.equal(reconcileSnapshot([snapshot],[older],'A')[0].status,'Done','buffered older commit cannot replace a newer visible snapshot');
 const later={...older,commit_timestamp:time(3)};
 assert.equal(reconcileSnapshot([snapshot],[later],'A')[0].status,'On-going','later commit can have an older transaction-start time');
 assert.equal(reconcileSnapshot([snapshot],[{...older,eventType:'DELETE',old:{id:'one'},new:{}}],'A').length,1,'old delete cannot remove newer snapshot row');
 assert.equal(reconcileSnapshot([snapshot],[{...later,eventType:'DELETE',old:{id:'one'},new:{}}],'A').length,0,'later delete retains authority');
});

test('snapshot/event clocks preserve PostgreSQL microseconds and compare timezone-equivalent instants',()=>{
 const {reconcileSnapshot,acceptRowChange}=loader()('src/lib/realtimeRows.ts'),clocks=new Map();
 const row={id:'one',project_id:'A',updated_at:'2026-10-02T00:02:00.000500Z',status:'Done'};
 const old={eventType:'UPDATE',new:{...row,status:'old'},old:{},commit_timestamp:'2026-10-02T08:02:00.000499+08:00'};
 assert.equal(reconcileSnapshot([row],[old],'A',null,clocks)[0].status,'Done');assert.equal(acceptRowChange(clocks,old),false);
 const later={...old,commit_timestamp:'2026-10-02T00:02:00.000501Z',new:{...row,updated_at:time(1),status:'later'}};
 assert.equal(reconcileSnapshot([row],[later],'A',null,clocks)[0].status,'later');
});

for(const [table,collection] of [['test_systems','systems'],['test_progress','progress']])test(`${table}: queued older event cannot roll back a newer snapshot or a subsequent delayed delivery`,async()=>{
 let pending=null;
 const initial={id:'one',project_id:'A',system_id:'machine',system_name:'Audit',updated_at:time(0),status:'Pending'};
 const db=database(q=>q.table===table?(pending?.promise??ok([initial])):ok([])),toast=()=>{};
 const load=loader({mocks:{'@/components/auth/UserContext':{useUser:()=>({user:{userId:'audit'}})},'@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProjectId:'A',activeProject:null})},'@/hooks/use-toast':{useToast:()=>({toast})},'@/integrations/supabase/client':{supabase:db},'./useStationStatus':{useStationStatus:()=>[]}}});
 const {UnifiedDataProvider,useUnifiedData}=load('src/hooks/useUnifiedData.ts');let state,root;const Probe=()=>{state=useUnifiedData();return null;};
 const emit=event=>act(async()=>db.channels[0].emit(table,event));
 const event={eventType:'UPDATE',old:{},new:{...initial,updated_at:time(1),status:'On-going'},commit_timestamp:'2026-10-02T00:01:01Z'};
 try{
  await act(async()=>{root=create(React.createElement(UnifiedDataProvider,null,React.createElement(Probe)));});await flush();
  pending=deferred();let read;await act(async()=>{read=state.refetch();});await flush();await emit(event);
  await act(async()=>{pending.resolve(ok([{...initial,updated_at:time(2),status:'Done'}]));await read;});assert.equal(state[collection][0].status,'Done');
  await emit({...event,commit_timestamp:'2026-10-02T00:01:30Z'});assert.equal(state[collection][0].status,'Done','snapshot clock persists beyond replay');
  await emit({...event,commit_timestamp:time(3)});assert.equal(state[collection][0].status,'On-going','later commit with earlier row timestamp still applies');
  pending=deferred();await act(async()=>{read=state.refetch();});await flush();await emit({...event,commit_timestamp:time(4),new:{...event.new,status:'Later committed'}});
  await act(async()=>{pending.resolve(ok([{...initial,updated_at:time(2),status:'Done'}]));await read;});assert.equal(state[collection][0].status,'Later committed','old snapshot still replays the later commit');
  if(collection==='progress') {
    pending=deferred();await act(async()=>{read=state.refreshProgress('machine');});await flush();await emit({...event,commit_timestamp:'2026-10-02T00:04:30Z'});
    await act(async()=>{pending.resolve(ok([{...initial,updated_at:time(5),status:'Done'}]));assert.equal(await read,true);});assert.equal(state.progress[0].status,'Done','scoped progress refresh uses the same snapshot lower bound');
    await emit({...event,commit_timestamp:'2026-10-02T00:04:45Z'});assert.equal(state.progress[0].status,'Done');await emit({...event,commit_timestamp:time(6)});assert.equal(state.progress[0].status,'On-going');
  }
 }finally{await act(async()=>root?.unmount());}
});
