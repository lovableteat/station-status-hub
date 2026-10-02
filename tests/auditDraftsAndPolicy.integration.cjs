const test=require('node:test');
const assert=require('node:assert/strict');
const {React,act,create,child,deferred,browser,database,loader,flush}=require('./support/renderHarness.cjs');
const ok=data=>({data,error:null});

test('PCB SPA guard can cancel; confirmed leave/remount restores dirty draft; late remote read does not overwrite',async()=>{
  const win=browser();let remoteRead=null,workspace;
  const load=loader({window:win});
  const {PcbLocalRepository}=load('src/components/pcb-designer/core/storage.ts');
  const repo=new PcbLocalRepository(win.localStorage);
  const initial=repo.load();initial.updatedAt='2026-10-02T00:00:00Z';initial.projects[0].updatedAt=initial.updatedAt;
  repo.save(initial);
  const remote={load:()=>remoteRead?.promise ?? Promise.resolve(initial),save:()=>Promise.resolve(true)};
  const {usePcbWorkspace}=load('src/components/pcb-designer/hooks/usePcbWorkspace.ts');
  const identity={userId:'audit-user',username:'audit-user',displayName:'Audit'};
  const Probe=()=>{workspace=usePcbWorkspace({canEdit:true,storage:win.localStorage,remoteClient:remote,editor:identity});return null;};
  let root;await act(async()=>{root=create(React.createElement(Probe));});await flush();
  assert.equal(workspace.hasUnsavedChanges,false);
  remoteRead=deferred();let read;await act(async()=>{read=workspace.refreshRemoteNow();});
  await flush(2);await act(async()=>workspace.renameProject(workspace.activeProject.id,'AUDIT_DRAFT'));
  assert.equal(workspace.hasUnsavedChanges,true);
  assert.equal(win.dispatchEvent(new Event('workspace-before-navigate',{cancelable:true})),false,'cancel retains editor');
  await act(async()=>{remoteRead.resolve(initial);await read;});
  assert.equal(workspace.activeProject.name,'AUDIT_DRAFT');
  win.confirm=()=>true;assert.equal(win.dispatchEvent(new Event('workspace-before-navigate',{cancelable:true})),true);
  await act(async()=>root.unmount());remoteRead=null;
  assert.equal(repo.loadRecovery('different-user'),null,'draft recovery is owner scoped');
  await act(async()=>{root=create(React.createElement(Probe));});await flush();
  assert.equal(workspace.activeProject.name,'AUDIT_DRAFT');assert.equal(workspace.hasUnsavedChanges,true,'recovered draft is never labelled synced');
  await act(async()=>{assert.equal(await workspace.saveNow(),true);});
  assert.equal(workspace.hasUnsavedChanges,false);assert.equal(repo.loadRecovery('audit-user'),null);
  await act(async()=>root.unmount());
});

test('real issue create handler writes selected priority as manual; list resolves same priority',async()=>{
  const db=database(q=>q.method==='upsert'?ok({...q.payload[0],created_at:new Date().toISOString()}):ok([]));
  const load=loader({mocks:{
    '@/hooks/use-toast':{useToast:()=>({toast(){}})},'@/integrations/supabase/client':{supabase:db},
    '@/components/test-projects/TestProjectProvider':{useTestProject:()=>({activeProjectId:'A'})},
    './IssueContentWorkspace':{IssueContentWorkspace:child},
    './issueInlineImages':{cleanupInlineImages:async()=>{},hasMeaningfulIssueContent:()=>true,persistInlineImageAttachments:async()=>{}},
  }});
  const {IssueCreateDialog}=load('src/components/issues/IssueCreateDialog.tsx');
  const {getEffectivePriority}=load('src/lib/issuePriority.ts');
  for(const priority of ['low','medium','high','critical']){
    let root;await act(async()=>{root=create(React.createElement(IssueCreateDialog,{initialValues:{title:'AUDIT',description:'test',priority},onIssueCreated(){}}));});
    const text=value=>typeof value==='string'?value:Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
    const save=root.root.findAll(n=>typeof n.props.onClick==='function' && text(n.props.children).includes('建立問題')).at(-1);
    assert.ok(save,'create submit action exists');await act(async()=>save.props.onClick());await flush();
    const row=db.reads.filter(q=>q.method==='upsert').at(-1).payload[0];
    assert.equal(row.priority,priority);assert.equal(row.priority_manual,true);assert.equal(getEffectivePriority(row.priority,row.priority_manual,new Date()),priority);
    await act(async()=>root.unmount());
  }
});

test('duration and BOM usage validation reject negative/nonfinite values without changing legacy placeholders',async()=>{
  const {isValidDuration,isValidBomUsage}=loader()('src/lib/inputValidation.ts');
  [-5,NaN,Infinity,-Infinity].forEach(n=>assert.equal(isValidDuration(n),false));
  assert.equal(isValidDuration(0),true);assert.equal(isValidDuration(0,1),false);assert.equal(isValidDuration(1,1),true);
  ['-2',-2,' -0.1 ','-2e3','Infinity'].forEach(n=>assert.equal(isValidBomUsage(n),false));
  ['AR','-',0,'0.5','2',''].forEach(n=>assert.equal(isValidBomUsage(n),true));
});

test('read deadline aborts stalled network; a subsequent read succeeds',async()=>{
  const {withReadDeadline}=loader()('src/lib/readDeadline.ts');let signal;
  await assert.rejects(()=>withReadDeadline(s=>{signal=s;return new Promise(()=>{});},5),/逾時/);
  assert.equal(signal.aborted,true);assert.equal(await withReadDeadline(()=>Promise.resolve('recovered'),5),'recovered');
});

test('permissions downgrade an open page, reject old-account responses and retain 30-second refresh recovery',async()=>{
  let user={userId:'admin'},current,delayed=null;
  let role='admin',settings={workspaceAccess:{'station-status':'edit'},pagePermissions:['dashboard_view','dashboard_edit']};
  const db=database(q=>q.table==='system_users'?delayed?.promise ?? ok({role,status:'active',permissions:settings}):ok([]));
  const win=browser();let tick;
  win.setInterval=(callback,ms)=>{assert.equal(ms,30000);tick=callback;return 1;};win.clearInterval=()=>{};
  const load=loader({window:win,mocks:{'@/components/auth/UserContext':{useUser:()=>({user})},'@/integrations/supabase/client':{supabase:db}}});
  const {PermissionsProvider,usePermissions}=load('src/hooks/usePermissions.ts');
  const Probe=()=>{current=usePermissions();return React.createElement('page',null,current.canEditModule('dashboard')?'edit':'blocked');};
  let root;await act(async()=>{root=create(React.createElement(PermissionsProvider,null,React.createElement(Probe)));});await flush();
  assert.equal(current.canEditModule('dashboard'),true);
  role='viewer';settings={workspaceAccess:{'station-status':'view'},pagePermissions:['dashboard_view']};
  await act(async()=>tick());await flush();assert.equal(current.canEditModule('dashboard'),false);assert.equal(current.canViewModule('dashboard'),true);
  delayed=deferred();let old;await act(async()=>{old=current.reloadPermissions();});
  const oldDeferred=delayed;delayed=null;user={userId:'other'};settings={workspaceAccess:{'station-status':'none'},pagePermissions:[]};
  await act(async()=>root.update(React.createElement(PermissionsProvider,null,React.createElement(Probe))));await flush();
  await act(async()=>{oldDeferred.resolve(ok({role:'admin',status:'active',permissions:{}}));await old;});
  assert.equal(current.canViewModule('dashboard'),false);assert.equal(current.isPerformanceManager,false);
  await act(async()=>root.unmount());assert.equal(db.channels.filter(c=>!c.removed).length,0);
});

test('role/workspace/page intersection matrix preserves existing admin and viewer contracts',()=>{
  const {canAccessModule,WORKSPACE_IDS,ALL_PAGE_PERMISSIONS,MODULE_WORKSPACE_MAP}=loader()('src/lib/workspacePermissions.ts');
  let cases=0;
  for(const role of ['admin','engineer','viewer'])for(const workspace of WORKSPACE_IDS)for(const level of ['none','view','edit'])for(const action of ['view','edit']){
    for(const [module,ws] of Object.entries(MODULE_WORKSPACE_MAP).filter(([,ws])=>ws===workspace)){
      const result=canAccessModule({module,action,role,permissions:ALL_PAGE_PERMISSIONS,permissionSettings:{workspaceAccess:{[workspace]:level}}});
      assert.equal(result,role==='admin'||(level!=='none'&&(action==='view'||level==='edit')));cases++;
    }
  }
  assert.ok(cases>=200);
  assert.equal(canAccessModule({module:'dashboard',action:'edit',role:'engineer',permissions:['dashboard_view'],permissionSettings:{workspaceAccess:{'station-status':'edit'}}}),false);
});
