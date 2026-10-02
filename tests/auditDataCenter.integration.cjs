const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,deferred,browser,database,loader,flush}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});
function fixture(load){
  const {INITIAL_SITE_PLANS}=load('src/components/data-center/dataCenterSeed.ts');
  return {schemaVersion:1,sites:structuredClone(INITIAL_SITE_PLANS),facilityPlans:{},modelOverrides:{}};
}
async function mount(options={}){
  const win=browser();let state,current,canEdit=options.canEdit??true;
  let handler=options.run;
  const db=database(q=>handler(q));
  const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:db}}});
  const document=fixture(load); current=document;
  const row={id:'DC',project_key:'dc',name:'AUDIT_LOCAL',category:'test',description:'',document,updated_at:'2026-10-02T01:00:00Z',updated_by:'other'};
  handler=handler??(q=>ok(q.method==='select'?[row]:{...row,...q.payload,updated_at:'2026-10-02T01:01:00Z'}));
  const {useSharedDataCenterProjects}=load('src/components/data-center/useSharedDataCenterProjects.ts');
  let edit;
  function Probe(){const [doc,setDoc]=React.useState(current);edit=setDoc;state=useSharedDataCenterProjects({userId:'audit-user',canEdit,currentDocument:doc,onApplyDocument:setDoc});return null;}
  let root;await act(async()=>{root=create(React.createElement(Probe));});await flush(10);
  return {win,db,load,row,document,get state(){return state;},edit:doc=>act(async()=>edit(doc)),setHandler:fn=>{handler=fn;},setCanEdit:async value=>{canEdit=value;await act(async()=>root.update(React.createElement(Probe)));},unmount:()=>act(async()=>root.unmount())};
}
test('Data-center validates seed and rejects damaged/unsupported documents without writing defaults',async()=>{
  for(const invalid of [null,{sites:[]},{sites:[{id:'broken',racks:[]}]},{schemaVersion:2,sites:[]}]){
    const h=await mount({run:q=>ok(q.method==='select'?[{id:'DC',project_key:'dc',name:'broken',document:invalid,updated_at:'v1'}]:null)});
    const {parseDataCenterDocument}=h.load('src/components/data-center/projectDocument.ts');
    assert.ok(parseDataCenterDocument(h.document),'actual seed is accepted');
    assert.equal(h.state.syncState,'error');await h.edit({...h.document,sites:h.document.sites.map(s=>({...s,label:'local'}))});await flush(1250);
    assert.equal(h.db.reads.filter(q=>q.method==='update').length,0,'malformed document must never be overwritten');await h.unmount();
  }
});
test('Data-center initializes only explicit empty placeholder with compare-and-set and respects view-only access',async()=>{
  for(const canEdit of [false,true]){
    const h=await mount({canEdit,run:q=>q.method==='select'?ok([{id:'DC',project_key:'dc',name:'empty',document:{},updated_at:'v1'}]):ok({id:'DC',document:q.payload.document,updated_at:'v2'})});
    const writes=h.db.reads.filter(q=>q.method==='update');assert.equal(writes.length,canEdit?1:0);
    if(canEdit){assert.equal(writes[0].filters.updated_at,'v1');assert.equal(h.state.syncState,'synced');}
    await h.unmount();
  }
});
test('Data-center streams same-user sessions, preserves dirty edits on foreign update, guards leave, recovers draft',async()=>{
  const h=await mount();assert.equal(h.state.syncState,'synced');
  const updated={...h.document,sites:h.document.sites.map(s=>({...s,label:'other-tab'}))};
  await act(async()=>h.db.channels[0].emit('data_center_projects',{eventType:'UPDATE',new:{...h.row,document:updated,updated_by:'audit-user',updated_at:'2026-10-02T01:02:00Z'}}));await flush(10);
  assert.equal(h.state.syncState,'synced','same user on another session is not excluded');
  const draft={...updated,sites:updated.sites.map(s=>({...s,label:'dirty'}))};await h.edit(draft);
  assert.equal(h.win.dispatchEvent(new Event('workspace-before-navigate',{cancelable:true})),false);
  await act(async()=>h.db.channels[0].emit('data_center_projects',{eventType:'UPDATE',new:{...h.row,document:h.document,updated_at:'2026-10-02T01:03:00Z'}}));
  assert.equal(h.state.syncState,'error');assert.ok(h.win.localStorage.getItem('data-center-draft:audit-user:DC').includes('dirty'));
  await flush(1250);assert.equal(h.db.reads.filter(q=>q.method==='update').length,0,'conflict never overwrites shared or dirty document');
  h.state.retry();assert.equal(h.state.syncState,'error','cancel reload retains draft');
  h.win.confirm=()=>true;await act(async()=>h.state.retry());await flush(10);assert.equal(h.state.syncState,'synced');await h.unmount();
  assert.equal(h.db.channels.filter(c=>!c.removed).length,0);
});
test('Data-center serializes writes, saves trailing edit with latest version, and blocks downgrade writes',async()=>{
  const h=await mount();const pending=deferred();let updates=0;
  h.setHandler(q=>q.method==='select'?ok([h.row]):++updates===1?pending.promise:ok({...h.row,...q.payload,updated_at:'2026-10-02T01:02:00Z'}));
  const draft=label=>({...h.document,sites:h.document.sites.map(s=>({...s,label}))});
  await h.edit(draft('first'));await flush(1250);assert.equal(updates,1);
  await h.edit(draft('second'));await flush(1250);assert.equal(updates,1,'one write in flight');
  await act(async()=>pending.resolve(ok({...h.row,document:draft('first'),updated_at:'2026-10-02T01:01:00Z'})));await flush(1250);
  assert.equal(updates,2);const writes=h.db.reads.filter(q=>q.method==='update');assert.equal(writes[1].filters.updated_at,'2026-10-02T01:01:00Z');assert.equal(writes[1].payload.document.sites[0].label,'second');assert.equal(h.state.syncState,'synced');
  await h.edit(draft('forbidden'));await h.setCanEdit(false);await flush(1250);assert.equal(updates,2,'downgrade cancels scheduled save');await h.unmount();
});
test('Data-center version conflict leaves draft intact and never reports synced',async()=>{
  const h=await mount();h.setHandler(q=>q.method==='select'?ok([h.row]):ok(null));
  await h.edit({...h.document,sites:h.document.sites.map(s=>({...s,label:'conflict'}))});await flush(1250);
  assert.equal(h.state.syncState,'error');assert.ok(h.win.localStorage.getItem('data-center-draft:audit-user:DC').includes('conflict'));await h.unmount();
});
test('Data-center metadata-only event preserves draft and advances its save version',async()=>{
  const h=await mount();await h.edit({...h.document,sites:h.document.sites.map(s=>({...s,label:'dirty'}))});
  await act(async()=>h.db.channels[0].emit('data_center_projects',{eventType:'UPDATE',new:{...h.row,name:'renamed',updated_at:'2026-10-02T01:03:00Z'}}));
  await flush(1250);assert.equal(h.db.reads.filter(q=>q.method==='update')[0].filters.updated_at,'2026-10-02T01:03:00Z');assert.equal(h.state.syncState,'synced');await h.unmount();
});
