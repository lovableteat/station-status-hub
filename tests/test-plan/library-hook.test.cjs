const assert = require('node:assert/strict');
const test = require('node:test');
const {React, create, act, loader, flush, browser, deferred} = require('../support/renderHarness.cjs');

function setup() {
  const stamp = '2026-10-12T00:00:00Z';
  const spaces = [{id:'old-space', projectId:'old-project', ownerId:'owner', name:'Legacy', color:'#60a5fa', createdAt:stamp, updatedAt:stamp}];
  const files = [{id:'old-file', spaceId:'old-space', folderId:'nested', originalName:'original.md', storagePath:'owner/old-project/old-space/original.md', extension:'md', category:'document', fileSize:9, createdAt:stamp, updatedAt:stamp}];
  const folders = [{id:'nested', spaceId:'old-space', parentId:null, name:'Nested', createdAt:stamp, updatedAt:stamp}];
  const log = []; const blobs = new Map([[files[0].storagePath, new Blob(['unchanged'])]]);
  const adapter = {
    listSpaces:async()=>[...spaces], listFiles:async(id)=>files.filter(f=>!id||f.spaceId===id), listFolders:async(id)=>folders.filter(f=>!id||f.spaceId===id),
    listCleanupPaths:async()=>[], createSpace:async(input)=>{log.push(['createSpace',input]);const s={...input,id:'global-space',createdAt:stamp,updatedAt:stamp};spaces.push(s);return s},
    uploadObject:async(path,file)=>{log.push(['upload',path]);blobs.set(path,file)},
    createFile:async(input)=>{log.push(['createFile',input]);const f={...input,id:`file-${files.length}`,createdAt:stamp,updatedAt:stamp};files.push(f);return f},
    downloadObject:async(path)=>{log.push(['download',path]);return blobs.get(path)},
  };
  const session = {user:{userId:'owner'},sessionMode:'authenticated'};
  let editable = true; let state;
  const load = loader({globals:{File,Blob}, mocks:{
    '@/components/auth/UserContext':{useUser:()=>session},
    '@/hooks/usePermissions':{usePermissions:()=>({canEditModule:()=>editable})},
    '../core/supabaseAdapter':{createSupabaseTestPlanAdapter:()=>adapter},
  }});
  const {useTestPlanWorkspace} = load('src/components/test-plan/hooks/useTestPlanWorkspace.ts');
  function Probe(){state=useTestPlanWorkspace();return null}
  return {spaces,files,folders,log,adapter,session,blobs,Probe,get state(){return state},setEditable(value){editable=value}};
}

test('opening all files performs no writes; uploads preserve legacy paths or create a global space', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  assert.equal(f.state.activeSpaceId,null);assert.equal(f.state.files[0].folderId,'nested');assert.deepEqual(f.log,[]);
  assert.equal(await (await f.state.downloadFile(f.files[0])).text(),'unchanged');
  await act(async()=>{await f.state.openSpace('old-space')});
  await act(async()=>{await f.state.uploadFiles('nested',[new File(['new'],'revision.md')])});
  assert.match(f.log.find(e=>e[0]==='upload')[1],/^owner\/old-project\/old-space\//);
  assert.equal(f.log.find(e=>e[0]==='createFile')[1].folderId,'nested');
  assert.equal(f.files[0].storagePath,'owner/old-project/old-space/original.md');
  await act(async()=>{await f.state.openSpace(null)});
  await act(async()=>{await f.state.uploadFiles(null,[new File(['global'],'common.md')])});
  assert.equal(f.log.find(e=>e[0]==='createSpace')[1].projectId,null);
  assert.match(f.log.filter(e=>e[0]==='upload').at(-1)[1],/^owner\/global\/global-space\//);
  assert.equal(f.state.activeSpaceId,null);assert.equal(f.state.files.length,3);
  await act(async()=>tree.unmount());
});

test('read-only and unauthenticated users cannot create or upload', async()=>{
  const f=setup();f.setEditable(false);let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await assert.rejects(f.state.uploadFiles(null,[new File(['x'],'file.md')]),/唯讀/)});
  assert.deepEqual(f.log,[]);
  f.session.sessionMode='anonymous';
  await act(async()=>tree.update(React.createElement(f.Probe)));await flush();
  assert.equal(f.state.files.length,0);
  await act(async()=>{await assert.rejects(f.state.createSpace({name:'Blocked'}),/安全登入/)});
  assert.deepEqual(f.log,[]);await act(async()=>tree.unmount());
});

test('late legacy-space responses cannot overwrite all-files navigation', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  const pending=deferred();const listFiles=f.adapter.listFiles;
  f.adapter.listFiles=id=>id==='old-space'?pending.promise:listFiles(id);
  let open;
  await act(async()=>{open=f.state.openSpace('old-space')});
  await act(async()=>{await f.state.openSpace(null)});
  await act(async()=>{pending.resolve([]);await open});
  assert.equal(f.state.activeSpaceId,null);assert.equal(f.state.files.length,1);
  await act(async()=>tree.unmount());
});

test('search and type filters survive reload and Back, clear without removing workspace context', async()=>{
  const win=browser();win.location.href='http://localhost/?workspace=file-uploads&project=legacy&fileSearch=board&fileType=pcb';
  const load=loader({window:win});const {useFileLibraryFilters}=load('src/components/test-plan/useFileLibraryFilters.ts');let state,tree;
  function Probe(){state=useFileLibraryFilters();return null}
  await act(async()=>{tree=create(React.createElement(Probe))});
  assert.equal(state.query,'board');assert.equal(state.categoryFilter,'pcb');
  await act(async()=>state.clearFilters());
  assert.equal(win.location.search,'?workspace=file-uploads&project=legacy');
  win.location.href='http://localhost/?workspace=file-uploads&fileSearch=restored&fileType=document&fileSort=largest';
  await act(async()=>win.dispatchEvent(new Event('popstate')));
  assert.equal(state.query,'restored');assert.equal(state.categoryFilter,'document');assert.equal(state.sort,'largest');
  await act(async()=>tree.unmount());
});
