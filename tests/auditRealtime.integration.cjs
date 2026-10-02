const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,ui,child,deferred,browser,database,loader,flush}=require('./support/renderHarness.cjs');
const toast=()=>{};
const ok=data=>({data,error:null});
const project=id=>({id,name:id,status:'active',is_archived:false,active_flow_version_id:null});

test('project selection does not refetch/resubscribe; late snapshot cannot undo selection; bursts coalesce', async()=>{
  const win=browser();let delayed=null;
  const db=database(q=>q.table==='test_projects' ? delayed?.promise ?? ok([project('A'),project('B')]) : ok([]));
  let current;
  const load=loader({window:win,mocks:{
    '@/components/auth/UserContext':{useUser:()=>({user:{userId:'operator'}})},
    '@/hooks/use-toast':{useToast:()=>({toast})},
    '@/integrations/supabase/client':{supabase:db},
  }});
  const {TestProjectProvider,useTestProject}=load('src/components/test-projects/TestProjectProvider.tsx');
  const Probe=()=>{current=useTestProject();return null;};
  let root;await act(async()=>{root=create(React.createElement(TestProjectProvider,null,React.createElement(Probe)));});await flush();
  assert.equal(current.activeProjectId,'A');
  const readCount=db.reads.length;
  await act(async()=>current.setActiveProjectId('B'));await flush();
  assert.equal(db.reads.length,readCount,'switch must not reload project directory');
  assert.equal(db.channels.length,1,'one subscription per account');
  delayed=deferred();let pending;
  await act(async()=>{pending=current.refreshProjects();});
  assert.equal(current.isLoadingProjects,false,'background refresh retains active module');
  await act(async()=>current.setActiveProjectId('A'));
  await act(async()=>{delayed.resolve(ok([project('B')]));await pending;});
  assert.equal(current.activeProjectId,'A','selection during pending request survives missing row');
  delayed=null;
  const beforeBurst=db.reads.length;
  await act(async()=>{for(let i=0;i<20;i++)db.channels[0].emit('test_projects',{});});await flush(175);
  assert.equal(db.reads.length-beforeBurst,1,'20 directory events coalesce to one fetch');
  assert.equal(db.channels.length,1);
  await act(async()=>root.unmount());assert.ok(db.channels[0].removed);
});

test('20 mocked clients retain live updates, deduplicate events, replay changes over snapshots and ignore old scopes', async()=>{
  const states=[],roots=[],channels=[];let selected='A',userId='operator';let delay=false;const pending=[];
  const db=database(q=>{
    const rows=q.table==='test_systems'?[{id:'machine',project_id:q.filters.project_id,system_name:'snapshot',updated_at:'2026-10-02T00:00:00Z'}]:[];
    if(delay){const d=deferred();pending.push({d,rows});return d.promise;}
    return ok(rows);
  });
  const load=loader({mocks:{
    '@/components/auth/UserContext':{useUser:()=>({user:userId?{userId}:null})},
    '@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProject:project(selected),activeProjectId:selected,isLoadingProjects:false})},
    '@/hooks/use-toast':{useToast:()=>({toast})}, '@/integrations/supabase/client':{supabase:db},
    './useStationStatus':{useStationStatus:()=>[]},
  }});
  const {UnifiedDataProvider,useUnifiedData}=load('src/hooks/useUnifiedData.ts');
  const Probe=({index})=>{states[index]=useUnifiedData();return null;};
  for(let i=0;i<20;i++)await act(async()=>roots.push(create(React.createElement(UnifiedDataProvider,null,React.createElement(Probe,{index:i})))));
  await flush();channels.push(...db.channels);assert.equal(channels.length,20);
  const reads=db.reads.length;
  const change={eventType:'INSERT',new:{id:'event',project_id:'A',system_name:'live',updated_at:'2026-10-02T00:01:00Z'},old:{}};
  await act(async()=>{for(const c of channels){c.emit('test_systems',change);c.emit('test_systems',change);}});
  assert.equal(db.reads.length,reads,'live row events do not reload all tables');
  states.forEach(s=>assert.equal(s.systems.filter(r=>r.id==='event').length,1));
  await act(async()=>{for(const c of channels){
    c.emit('test_systems',{eventType:'DELETE',new:{},old:{id:'event'},commit_timestamp:'2026-10-02T00:04:00Z'});
    c.emit('test_systems',{...change,commit_timestamp:'2026-10-02T00:03:00Z'});
  }});
  states.forEach(s=>assert.equal(s.systems.some(r=>r.id==='event'),false,'late event cannot resurrect a deleted row'));
  delay=true;const requests=[];
  await act(async()=>states.forEach(s=>requests.push(s.refetch())));await flush();
  await act(async()=>{for(const c of channels){c.emit('test_systems',{eventType:'UPDATE',new:{id:'machine',project_id:'A',system_name:'newer',updated_at:'2026-10-02T00:02:00Z'},old:{}});c.emit('test_systems',{...change,commit_timestamp:'2026-10-02T00:05:00Z'});}});
  await act(async()=>{pending.splice(0).forEach(p=>p.d.resolve(ok(p.rows)));await Promise.all(requests);});
  states.forEach(s=>{assert.equal(s.systems.find(r=>r.id==='machine').system_name,'newer');assert.equal(s.systems.filter(r=>r.id==='event').length,1);});
  const late=[];await act(async()=>states.forEach(s=>late.push(s.refetch())));await flush();
  const oldPending=pending.splice(0);selected='B';delay=false;
  await act(async()=>roots.forEach((r,index)=>r.update(React.createElement(UnifiedDataProvider,null,React.createElement(Probe,{index})))));await flush();
  await act(async()=>{oldPending.forEach(p=>p.d.resolve(ok(p.rows)));await Promise.all(late);for(const c of channels)c.emit('test_systems',change);});
  states.forEach(s=>{assert.equal(s.systems.length,1);assert.equal(s.systems[0].project_id,'B');});
  assert.equal(db.channels.filter(c=>!c.removed).length,20);
  const readsBeforeSignout=db.reads.length;userId=null;
  await act(async()=>roots.forEach((r,index)=>r.update(React.createElement(UnifiedDataProvider,null,React.createElement(Probe,{index})))));await flush();
  assert.equal(db.reads.length,readsBeforeSignout,'signed-out clients never read the backend');
  states.forEach(s=>assert.equal(s.systems.length,0));
  assert.equal(db.channels.filter(c=>!c.removed).length,0);
  await act(async()=>roots.forEach(r=>r.unmount()));assert.equal(db.channels.filter(c=>!c.removed).length,0);
});

test('late machine initialization preserves typed basic fields and cancelled reads cannot affect another machine',async()=>{
  let fields=deferred();const db=database(q=>q.table==='test_systems'?ok({id:q.filters.id,project_id:'A',system_name:q.filters.id,model:'GB300',cabinet:'stored'}):fields.promise);
  const load=loader({mocks:{
    '@/hooks/use-toast':{useToast:()=>({toast})}, '@/hooks/use-mobile':{useIsMobile:()=>false},
    '@/integrations/supabase/client':{supabase:db}, './SystemMetadataFieldsEditor':{SystemMetadataFieldsEditor:child},
    '@/lib/utils':{cn:(...x)=>x.filter(Boolean).join(' ')},
  }});
  const {SystemEditDialog}=load('src/components/test-tracker/SystemEditDialog.tsx');
  const props={systemId:'one',systemName:'one',assignedEngineer:'owner',open:true,onUpdate(){},showTrigger:false};
  let root;await act(async()=>{root=create(React.createElement(SystemEditDialog,props));});await flush();
  const input=()=>root.root.findAll(n=>n.props.value==='GB300'&&typeof n.props.onChange==='function')[0];
  assert.ok(input());await act(async()=>input().props.onChange({target:{value:'draft-model'}}));
  await act(async()=>fields.resolve(ok([])));await flush();
  assert.ok(root.root.findAll(n=>n.props.value==='draft-model').length);
  fields=deferred();await act(async()=>root.update(React.createElement(SystemEditDialog,{...props,systemId:'two',systemName:'two'})));await flush();
  const old=fields;fields=deferred();await act(async()=>root.update(React.createElement(SystemEditDialog,{...props,systemId:'three',systemName:'three'})));await flush();
  await act(async()=>old.resolve(ok([])));await flush();assert.equal(root.root.findAll(n=>n.props.value==='two').length,0);
  await act(async()=>fields.resolve(ok([])));await flush();assert.ok(root.root.findAll(n=>n.props.value==='three').length);
  await act(async()=>root.unmount());
});

test('Data-center renders real inspector in desktop/mobile layout without ReferenceError',async()=>{
  const win=browser();
  const mocks={
    '@/hooks/use-toast':{useToast:()=>({toast})}, '@/components/auth/UserContext':{useUser:()=>({user:null,isRealtimeAuthenticated:false})},
    '@/hooks/usePermissions':{usePermissions:()=>({canEditModule:()=>false})}, '@/lib/utils':{cn:(...x)=>x.filter(Boolean).join(' ')},
    './DataCenter3DPlanner':{DataCenter3DPlanner:child}, './DataCenter2DPlanner':{DataCenter2DPlanner:child},
    './DataCenterModelViewer':{DataCenterModelViewer:child}, './FacilityAisleCreationDialog':{FacilityAisleCreationDialog:child},
    './modelConversionWorker':{convertStepToGlb(){}},
    './useSharedDataCenterProjects':{useSharedDataCenterProjects:()=>({projects:[],selectedProject:null,selectedProjectId:'',syncState:'local'})},
  };
  const load=loader({window:win,mocks});
  const {DeploymentPlanningCenter}=load('src/components/data-center/DeploymentPlanningCenter.tsx');
  let root;await act(async()=>{root=create(React.createElement(DeploymentPlanningCenter));});
  assert.ok(JSON.stringify(root.toJSON()).includes('Data Center Digital Twin'));
  await act(async()=>root.unmount());
  win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  await act(async()=>{root=create(React.createElement(DeploymentPlanningCenter));});
  assert.ok(JSON.stringify(root.toJSON()).includes('機櫃詳情'));
  await act(async()=>root.unmount());
});
