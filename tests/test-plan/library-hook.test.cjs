const assert = require('node:assert/strict');
const test = require('node:test');
const {React, create, act, loader, flush, browser, deferred} = require('../support/renderHarness.cjs');

function setup(options = {}) {
  const stamp = '2026-10-12T00:00:00Z';
  const spaces = [
    {id:'old-space', projectId:'old-project', ownerId:'owner', name:'Legacy', color:'#60a5fa', createdAt:stamp, updatedAt:stamp},
    {id:'personal-space', projectId:null, ownerId:'owner', name:'Owner', isPersonal:true, createdAt:stamp, updatedAt:stamp},
    {id:'other-space', projectId:null, ownerId:'other', name:'Other User', isPersonal:true, createdAt:stamp, updatedAt:stamp},
  ];
  const files = [{id:'old-file', spaceId:'old-space', folderId:'nested', originalName:'original.md', storagePath:'owner/old-project/old-space/original.md', extension:'md', category:'document', fileSize:9, createdAt:stamp, updatedAt:stamp}];
  const folders = [{id:'nested', spaceId:'old-space', parentId:null, name:'Nested', createdAt:stamp, updatedAt:stamp}];
  const log = []; const blobs = new Map([[files[0].storagePath, new Blob(['unchanged'])]]);
  const adapter = {
    listSpaces:async()=>[...spaces], listFiles:async(id)=>files.filter(f=>!id||f.spaceId===id), listFolders:async(id)=>folders.filter(f=>!id||f.spaceId===id),
    findFileByStoragePath:async(path)=>files.find(file=>file.storagePath===path), completeObjectUpload(){},
    listCleanupPaths:async()=>[], createSpace:async(input)=>{log.push(['createSpace',input]);const s={...input,id:'global-space',createdAt:stamp,updatedAt:stamp};spaces.push(s);return s},
    createFolder:async(input)=>{log.push(['createFolder',input]);const folder={...input,id:`folder-${folders.length}`,createdAt:stamp,updatedAt:stamp};folders.push(folder);return folder},
    uploadObject:async(path,file)=>{log.push(['upload',path]);blobs.set(path,file)},
    createFile:async(input)=>{log.push(['createFile',input]);const f={...input,id:`file-${files.length}`,createdAt:stamp,updatedAt:stamp};files.push(f);return f},
    downloadObject:async(path)=>{log.push(['download',path]);return blobs.get(path)},
  };
  const session = {user:{userId:'owner'},sessionMode:'authenticated'};
  let editable = true; let canonicalAdmin; let state;
  const load = loader({window:options.window,globals:{File,Blob}, mocks:{
    '@/components/auth/UserContext':{useUser:()=>session},
    '@/hooks/usePermissions':{usePermissions:()=>({canEditModule:()=>editable,get isAdmin(){return canonicalAdmin ?? ['admin','super_admin'].includes(session.user?.role)}})},
    '../core/supabaseAdapter':{createSupabaseTestPlanAdapter:()=>adapter},
  }});
  const {useTestPlanWorkspace} = load('src/components/test-plan/hooks/useTestPlanWorkspace.ts');
  function Probe(){state=useTestPlanWorkspace();return null}
  return {spaces,files,folders,log,adapter,session,blobs,Probe,get state(){return state},setEditable(value){editable=value},setIsAdmin(value){canonicalAdmin=value}};
}

test('opening all files performs no writes; uploads target the signed-in user personal space', async()=>{
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
  assert.equal(f.log.some(e=>e[0]==='createSpace'),false);
  assert.equal(f.log.filter(e=>e[0]==='createFile').at(-1)[1].spaceId,'personal-space');
  assert.match(f.log.filter(e=>e[0]==='upload').at(-1)[1],/^owner\/global\/personal-space\//);
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

function folderFile(path) {
  const file = new File(['data'], path.split('/').at(-1));
  Object.defineProperty(file, 'webkitRelativePath', {value:path});
  return file;
}

function addBatchFiles(f, count = 3) {
  const base=f.files[0];
  for(let index=1;index<count;index++) f.files.push({...base,id:`batch-${index}`,originalName:`batch-${index}.md`,storagePath:`owner/batch-${index}.md`});
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);const index=f.files.findIndex(file=>file.id===id);if(index>=0)f.files.splice(index,1)};
  return f.files.map(file=>({...file,kind:'file'}));
}

test('batch delete continues after individual failures, keeps exact keys and refreshes only once', async()=>{
  const f=setup();const entries=addBatchFiles(f);let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let refreshes=0;const listFiles=f.adapter.listFiles;f.adapter.listFiles=async id=>{refreshes++;return listFiles(id)};
  const remove=f.adapter.deleteFile;
  f.adapter.deleteFile=async id=>{if(id==='batch-1'){f.log.push(['failedDelete',id]);throw new Error('busy object')};return remove(id)};
  let result;await act(async()=>{result=await f.state.deleteEntries(entries)});
  assert.deepEqual(Array.from(result.deletedKeys),['file:old-file','file:batch-2']);
  assert.deepEqual(Array.from(result.failures, failure=>({...failure})),[{key:'file:batch-1',name:'batch-1.md',message:'busy object'}]);
  assert.equal(refreshes,1);assert.deepEqual(f.state.files.map(file=>file.id),['batch-1']);
  assert.equal(f.state.busy,false);await act(async()=>tree.unmount());
});

test('batch delete deduplicates folders, descendants and duplicate entries without deleting another space', async()=>{
  const f=setup();const root=f.folders[0];const child={...root,id:'child',parentId:root.id,name:'Child'};
  f.folders.push(child,{...root,id:'foreign-parent',spaceId:'other-space'});
  f.files[0]={...f.files[0],folderId:child.id};
  const extra={...f.files[0],id:'unrelated',folderId:null};f.files.push(extra);
  f.adapter.deleteFolder=async id=>{f.log.push(['deleteFolder',id]);f.folders.splice(0,2);f.files.splice(0,1)};
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);f.files.splice(f.files.findIndex(file=>file.id===id),1)};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let result;await act(async()=>{result=await f.state.deleteEntries([
    {...f.files[0],kind:'file'}, {...child,kind:'folder'}, {...root,kind:'folder'}, {...child,kind:'folder'}, {...extra,kind:'file'},
  ])});
  assert.deepEqual(f.log,[['deleteFolder','nested'],['deleteFile','unrelated']]);
  assert.deepEqual(Array.from(result.deletedKeys).sort(),['file:old-file','folder:child','folder:nested','file:unrelated'].sort());
  assert.equal(result.failures.length,0);assert.equal(f.state.folders[0].id,'foreign-parent');
  await act(async()=>tree.unmount());
});

test('batch preflight checks every selected permission and existence before any write', async()=>{
  const f=setup();const entries=addBatchFiles(f,2);const other={...f.files[0],id:'other',spaceId:'other-space'};f.files.push(other);
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await assert.rejects(f.state.deleteEntries([...entries,{...other,kind:'file'}]),/唯讀/)});
  assert.deepEqual(f.log,[]);
  await act(async()=>{await assert.rejects(f.state.deleteEntries([...entries,{...other,id:'missing',kind:'file'}]),/項目不存在/)});
  assert.deepEqual(f.log,[]);await act(async()=>tree.unmount());
});

test('batch deletion stays busy through every deletion and final refresh and blocks navigation or overlapping writes', async()=>{
  const f=setup();const entries=addBatchFiles(f,2);const first=deferred();const second=deferred();const refresh=deferred();
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);await (id==='old-file'?first.promise:second.promise)};
  f.adapter.listFiles=()=>refresh.promise;
  let pending;await act(async()=>{pending=f.state.deleteEntries(entries)});
  assert.equal(f.state.busy,true);
  await act(async()=>{await assert.rejects(f.state.deleteEntries(entries),/操作進行中/);await f.state.openSpace('personal-space')});
  assert.equal(f.state.activeSpaceId,null);
  await act(async()=>first.resolve());assert.equal(f.state.busy,true);assert.equal(f.log.length,2);
  await act(async()=>second.resolve());assert.equal(f.state.busy,true);
  await act(async()=>{refresh.resolve([]);await pending});assert.equal(f.state.busy,false);
  await act(async()=>tree.unmount());
});

test('revoking canonical administrator capability stops all remaining batch writes after an awaited call', async()=>{
  const f=setup();f.setIsAdmin(true);const entries=addBatchFiles(f);f.files[1].spaceId='other-space';f.files[2].spaceId='other-space';
  entries[1].spaceId='other-space';entries[2].spaceId='other-space';const first=deferred();
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);await first.promise};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let pending;await act(async()=>{pending=f.state.deleteEntries(entries)});
  f.setIsAdmin(false);await act(async()=>tree.update(React.createElement(f.Probe)));
  let result;await act(async()=>{first.resolve();result=await pending});
  assert.deepEqual(f.log,[['deleteFile','old-file']]);
  assert.deepEqual(Array.from(result.deletedKeys),['file:old-file']);assert.equal(result.failures.length,2);
  assert.match(result.failures[0].message,/唯讀/);await act(async()=>tree.unmount());
});

test('account switching during batch deletion prevents remaining writes and late refreshes', async()=>{
  const f=setup();const entries=addBatchFiles(f);const first=deferred();
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);await first.promise};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  const staleDelete=f.state.deleteEntries;
  let pending;await act(async()=>{pending=staleDelete(entries)});
  f.session.user={userId:'new-owner'};
  f.spaces.splice(0,f.spaces.length,{id:'new-space',ownerId:'new-owner',name:'New',isPersonal:true});
  f.files.splice(0,f.files.length,{...entries[0],id:'new-file',spaceId:'new-space'});
  await act(async()=>tree.update(React.createElement(f.Probe)));await flush();
  let reads=0;const listFiles=f.adapter.listFiles;f.adapter.listFiles=async id=>{reads++;return listFiles(id)};
  let result;await act(async()=>{first.resolve();result=await pending});
  assert.deepEqual(f.log,[['deleteFile','old-file']]);assert.equal(result.failures.length,2);assert.match(result.failures[0].message,/帳號或檔案空間已變更/);
  assert.equal(reads,0);assert.deepEqual(f.state.files.map(file=>file.id),['new-file']);
  await act(async()=>{await assert.rejects(staleDelete(entries),/帳號或檔案空間已變更/)});
  assert.deepEqual(f.log,[['deleteFile','old-file']]);await act(async()=>tree.unmount());
});

test('module access revoked after selection blocks stale batch handlers before any write', async()=>{
  const f=setup();const entries=addBatchFiles(f,2);let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();const stale=f.state.deleteEntries;
  f.setEditable(false);await act(async()=>tree.update(React.createElement(f.Probe)));
  await act(async()=>{await assert.rejects(stale(entries),/唯讀/)});
  assert.deepEqual(f.log,[]);await act(async()=>tree.unmount());
});

test('scope changes during batch deletion stop remaining calls without restoring the previous scope', async()=>{
  const f=setup();const entries=addBatchFiles(f);const first=deferred();
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);await first.promise};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let pending;await act(async()=>{pending=f.state.deleteEntries(entries)});
  await act(async()=>{await f.state.refreshWorkspace('personal-space')});
  let result;await act(async()=>{first.resolve();result=await pending});
  assert.deepEqual(f.log,[['deleteFile','old-file']]);assert.equal(result.failures.length,2);
  assert.match(result.failures[0].message,/帳號或檔案空間已變更/);assert.equal(f.state.activeSpaceId,'personal-space');
  await act(async()=>tree.unmount());
});

test('a failed selected parent reports its selected descendants without retrying separate child deletion', async()=>{
  const f=setup();const selected=[{...f.files[0],kind:'file'},{...f.folders[0],kind:'folder'}];
  f.adapter.deleteFolder=async id=>{f.log.push(['deleteFolder',id]);throw new Error('folder denied')};
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id])};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let result;await act(async()=>{result=await f.state.deleteEntries(selected)});
  assert.deepEqual(f.log,[['deleteFolder','nested']]);assert.equal(result.deletedKeys.length,0);
  assert.deepEqual(Array.from(result.failures,failure=>failure.key).sort(),['file:old-file','folder:nested']);
  assert.equal(result.failures.every(failure=>failure.message==='folder denied'),true);
  await act(async()=>tree.unmount());
});

test('unmounting the workspace stops pending batches before the next destructive call', async()=>{
  const f=setup();const entries=addBatchFiles(f,2);const first=deferred();
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);await first.promise};
  let tree;await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let pending;await act(async()=>{pending=f.state.deleteEntries(entries)});
  await act(async()=>tree.unmount());
  let result;await act(async()=>{first.resolve();result=await pending});
  assert.deepEqual(f.log,[['deleteFile','old-file']]);assert.equal(result.failures.length,1);
});

test('batch returns committed successes when final refresh fails and reports deferred object cleanup separately', async()=>{
  const f=setup();const entries=addBatchFiles(f,2);let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  let cleanupReads=0;f.adapter.listCleanupPaths=async()=>{if(++cleanupReads<=2)throw new Error('storage cleanup unavailable');return []};
  f.adapter.listFiles=async()=>{throw new Error('refresh unavailable')};
  let result;await act(async()=>{result=await f.state.deleteEntries(entries)});
  assert.equal(result.deletedKeys.length,2);assert.equal(result.failures.length,0);assert.equal(result.cleanupPending,true);
  assert.match(f.state.error,/refresh unavailable/);assert.equal(f.state.busy,false);
  await act(async()=>tree.unmount());
});

test('folder upload validates the whole selection before uploading to the personal space', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await assert.rejects(f.state.uploadFiles(null,[folderFile('Release/a.md'),folderFile('Release/../b.md')],{preservePaths:true}),/路徑/)});
  assert.deepEqual(f.log,[]);
  await act(async()=>tree.unmount());
});

test('folder retry uses its original space and target even after navigating to all files', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await f.state.openSpace('old-space')});
  await act(async()=>{await f.state.openSpace(null)});
  let result;
  await act(async()=>{result=await f.state.uploadFiles('nested',[folderFile('Release/a.md')],{preservePaths:true,spaceId:'old-space'})});
  assert.equal(result.spaceId,'old-space');
  assert.equal(f.log.find(entry=>entry[0]==='createFolder')[1].parentId,'nested');
  assert.match(f.log.find(entry=>entry[0]==='upload')[1],/^owner\/old-project\/old-space\//);
  assert.equal(f.log.some(entry=>entry[0]==='createSpace'),false);
  await act(async()=>tree.unmount());
});

test('a post-upload refresh error returns committed successes so retry cannot duplicate them', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await f.state.openSpace('old-space')});
  const originalCreate=f.adapter.createFile;
  f.adapter.createFile=async input=>{const file=await originalCreate(input);f.adapter.listFiles=async()=>{throw new Error('refresh failed')};return file};
  let result;
  await act(async()=>{result=await f.state.uploadFiles('nested',[new File(['new'],'new.md')])});
  assert.equal(result.uploaded.length,1);
  assert.equal(result.failedFiles.length,0);
  assert.match(f.state.error,/refresh failed/);
  await act(async()=>tree.unmount());
});

test('account switching hides the previous owner upload progress and ignores its late updates', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  const pending=deferred();let progress;
  f.adapter.uploadObject=async(path,file,onProgress)=>{progress=onProgress;onProgress(1,file.size);await pending.promise};
  let uploading;
  await act(async()=>{uploading=f.state.uploadFiles(null,[new File(['secret'],'private-release.zip')])});
  assert.equal(f.state.uploadProgress.currentFileName,'private-release.zip');
  f.session.user={userId:'new-owner'};
  f.spaces.splice(0,f.spaces.length,{id:'new-space',ownerId:'new-owner',name:'New owner',isPersonal:true});
  await act(async()=>tree.update(React.createElement(f.Probe)));await flush();
  assert.equal(f.state.uploadProgress,null);
  await act(async()=>progress(3,6));
  assert.equal(f.state.uploadProgress,null);
  await act(async()=>{pending.resolve();await uploading});
  assert.equal(f.state.uploadProgress,null);
  await act(async()=>tree.unmount());
});

test('retry after a personal-space folder read failure never creates duplicate spaces', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  const originalList=f.adapter.listFolders;let offline=true;
  f.adapter.listFolders=async id=>{if(id==='personal-space'&&offline){offline=false;throw new Error('offline')};return originalList(id)};
  const files=[folderFile('Release/a.md')];
  await act(async()=>{await assert.rejects(f.state.uploadFiles(null,files,{preservePaths:true}),/offline/)});
  await act(async()=>{await f.state.uploadFiles(null,files,{preservePaths:true})});
  assert.equal(f.log.filter(entry=>entry[0]==='createSpace').length,0);
  await act(async()=>tree.unmount());
});

test('all users are visible, other personal spaces are read-only, administrators can edit', async()=>{
  const f=setup();let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  assert.equal(f.state.spaces.length,3);
  assert.equal(f.state.canEditSpace('personal-space'),true);
  assert.equal(f.state.canEditSpace('other-space'),false);
  await act(async()=>{await assert.rejects(f.state.uploadFiles(null,[new File(['x'],'blocked.md')],{spaceId:'other-space'}),/唯讀/)});
  assert.deepEqual(f.log,[]);
  await act(async()=>{await f.state.openSpace('other-space')});
  assert.equal(f.state.canEdit,false);
  f.session.user.role='admin';
  await act(async()=>tree.update(React.createElement(f.Probe)));
  assert.equal(f.state.canEditSpace('other-space'),true);
  await act(async()=>{await f.state.uploadFiles(null,[new File(['x'],'admin.md')])});
  assert.equal(f.log.find(entry=>entry[0]==='createFile')[1].spaceId,'other-space');
  await act(async()=>tree.unmount());
});

test('missing personal space fails explicitly without creating a shared or duplicate space', async()=>{
  const f=setup();f.spaces.splice(1,1);let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await assert.rejects(f.state.uploadFiles(null,[new File(['x'],'blocked.md')]),/尚未載入你的檔案空間/)});
  assert.deepEqual(f.log,[]);
  await act(async()=>tree.unmount());
});

test('entry mutations from all-files view cannot modify another owner content', async()=>{
  const f=setup();f.files.push({...f.files[0],id:'other-file',spaceId:'other-space'});let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  assert.equal(f.state.canEdit,true);
  await act(async()=>{await assert.rejects(f.state.renameFile('other-file','renamed.md'),/唯讀/)});
  await act(async()=>{await assert.rejects(f.state.replaceFileContents(f.files[1],new Blob(['changed'])),/唯讀/)});
  assert.deepEqual(f.log,[]);
  await act(async()=>tree.unmount());
});

test('canonical administrators can delete loaded legacy PDFs absent from the account sidebar despite stale session roles', async()=>{
  const f=setup();f.setIsAdmin(true);f.session.user.role='engineer';
  const legacy={...f.files[0],id:'legacy-pdf',spaceId:'unlisted-space',originalName:'legacy.pdf',extension:'pdf',storagePath:'other/global/unlisted-space/legacy.pdf'};
  f.files.push(legacy);
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id]);const index=f.files.findIndex(file=>file.id===id);if(index>=0)f.files.splice(index,1)};
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  assert.equal(f.state.spaces.some(space=>space.id===legacy.spaceId),false);
  assert.equal(f.state.canEditSpace('other-space'),true);
  assert.equal(f.state.canEditSpace(legacy.spaceId),true);
  await act(async()=>{await assert.rejects(f.state.deleteFile({...legacy,id:'not-loaded'}),/項目不存在/)});
  assert.deepEqual(f.log,[],'administrator capability must not bypass the loaded-entry guard');
  await act(async()=>{await f.state.deleteFile(legacy)});
  assert.deepEqual(f.log,[['deleteFile','legacy-pdf']]);
  assert.equal(f.state.files.some(file=>file.id===legacy.id),false);
  await act(async()=>tree.unmount());
});

test('cached administrator roles do not grant mutation access when the canonical capability is false or revoked', async()=>{
  const f=setup();f.session.user.role='admin';f.setIsAdmin(false);
  const other={...f.files[0],id:'other-pdf',spaceId:'other-space',originalName:'other.pdf',extension:'pdf'};
  const unknown={...other,id:'unknown-pdf',spaceId:'unlisted-space'};
  f.files.push(other,unknown);
  f.adapter.deleteFile=async id=>{f.log.push(['deleteFile',id])};
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  assert.equal(f.state.canEditSpace('personal-space'),true);
  assert.equal(f.state.canEditSpace('other-space'),false);
  assert.equal(f.state.canEditSpace('unlisted-space'),false);
  await act(async()=>{await assert.rejects(f.state.deleteFile(other),/唯讀/);await assert.rejects(f.state.deleteFile(unknown),/唯讀/)});
  assert.deepEqual(f.log,[]);
  f.setIsAdmin(true);
  await act(async()=>tree.update(React.createElement(f.Probe)));
  assert.equal(f.state.canEditSpace('other-space'),true);
  f.setIsAdmin(false);
  await act(async()=>tree.update(React.createElement(f.Probe)));
  assert.equal(f.session.user.role,'admin','stale browser role is intentionally unchanged');
  await act(async()=>{await assert.rejects(f.state.deleteFile(other),/唯讀/)});
  assert.deepEqual(f.log,[]);
  f.setIsAdmin(true);f.setEditable(false);
  await act(async()=>tree.update(React.createElement(f.Probe)));
  assert.equal(f.state.canEditSpace('unlisted-space'),false);
  await act(async()=>{await assert.rejects(f.state.deleteFile(unknown),/唯讀/)});
  assert.deepEqual(f.log,[],'module edit access remains required even with administrator capability');
  await act(async()=>tree.unmount());
});

test('returning to the page refreshes canonical account labels without reloading open folder files', async()=>{
  const window=browser();const f=setup({window});let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  await act(async()=>{await f.state.openSpace('old-space')});
  let fileReads=0;const listFiles=f.adapter.listFiles;
  f.adapter.listFiles=async id=>{fileReads++;return listFiles(id)};
  f.spaces[0]={...f.spaces[0],name:'後臺新姓名',description:'@canonical'};
  await act(async()=>{window.dispatchEvent(new Event('focus'))});await flush();
  assert.equal(f.state.spaces[0].name,'後臺新姓名');
  assert.equal(f.state.spaces[0].description,'@canonical');
  assert.equal(f.state.activeSpaceId,'old-space');
  assert.equal(f.state.folders[0].id,'nested');
  assert.equal(f.state.files[0].id,'old-file');
  assert.equal(fileReads,0);
  assert.deepEqual(f.log,[]);
  await act(async()=>tree.unmount());
});

test('late account roster responses cannot restore data after account switch or unmount', async()=>{
  const window=browser();const f=setup({window});let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  const pending=deferred();const listSpaces=f.adapter.listSpaces;
  f.adapter.listSpaces=()=>pending.promise;
  await act(async()=>{window.dispatchEvent(new Event('focus'))});
  f.adapter.listSpaces=listSpaces;
  f.session.user={userId:'new-owner',role:'engineer'};
  f.spaces.splice(0,f.spaces.length,{id:'new-space',ownerId:'new-owner',name:'New owner',isPersonal:true});
  await act(async()=>tree.update(React.createElement(f.Probe)));await flush();
  await act(async()=>pending.resolve([{id:'stale-space',ownerId:'owner',name:'Stale owner'}]));await flush();
  assert.deepEqual(f.state.spaces.map(space=>space.id),['new-space']);
  let calls=0;f.adapter.listSpaces=async()=>{calls++;return []};
  await act(async()=>tree.unmount());
  window.dispatchEvent(new Event('focus'));await flush();
  assert.equal(calls,0);
});

test('roster read errors preserve the last list and report failure without any writes', async()=>{
  const window=browser();const f=setup({window});let tree;
  await act(async()=>{tree=create(React.createElement(f.Probe))});await flush();
  f.adapter.listSpaces=async()=>{throw new Error('directory unavailable')};
  await act(async()=>{window.dispatchEvent(new Event('focus'))});await flush();
  assert.equal(f.state.spaces.length,3);
  assert.match(f.state.error,/directory unavailable/);
  assert.deepEqual(f.log,[]);
  await act(async()=>tree.unmount());
});
