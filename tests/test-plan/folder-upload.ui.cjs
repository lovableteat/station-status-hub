const assert = require('node:assert/strict');
const test = require('node:test');
const {React, create, act, loader, browser, deferred} = require('../support/renderHarness.cjs');

function fixture(uploadFiles, editable = true) {
  const window=browser();
  const listeners=new Map();
  const addListener=window.addEventListener.bind(window);
  const removeListener=window.removeEventListener.bind(window);
  window.addEventListener=(type,callback,...options)=>{
    if(!listeners.has(type))listeners.set(type,new Set());
    listeners.get(type).add(callback);addListener(type,callback,...options);
  };
  window.removeEventListener=(type,callback,...options)=>{
    listeners.get(type)?.delete(callback);removeListener(type,callback,...options);
  };
  const toasts=[];
  const state = {
    spaces:[{id:'space-1', name:'Engineering', projectId:null}], activeSpaceId:'space-1', activeSpace:{id:'space-1', name:'Engineering'},
    folders:[], files:[], loading:false, busy:false, error:null, uploadProgress:null, canEdit:editable, canEditSpace:()=>editable, ownerId:'owner', isAuthenticated:true, uploadFiles,
  };
  const load=loader({window,globals:{File,Blob},mocks:{
    './hooks/useTestPlanWorkspace':{useTestPlanWorkspace:()=>state},
    './TestPlanInspector':{TestPlanInspector:()=>null},
    './TestPlanSpreadsheetEditor':{TestPlanSpreadsheetEditor:()=>null},
    './TestPlanSpaceDialog':{TestPlanSpaceDialog:()=>null},
    sonner:{toast:{success(){},error(message){toasts.push(message)}}},
  }});
  const {TestPlanWorkspace}=load('src/components/test-plan/TestPlanWorkspace.tsx');
  return {state,window,toasts,listenerCount:type=>listeners.get(type)?.size??0,
    emitOwner(owner){window.dispatchEvent(new CustomEvent('station-user-changed',{detail:owner}))},Component:TestPlanWorkspace};
}

function folderFile(path) {
  const file=new File(['data'],path.split('/').at(-1));
  Object.defineProperty(file,'webkitRelativePath',{value:path});
  return file;
}

function preventsUnload(f) {
  const event=new Event('beforeunload',{cancelable:true});
  f.window.dispatchEvent(event);
  return event.defaultPrevented;
}

function uploadInput(tree, folder=false) {
  return tree.root.findAll(node=>node.type==='input'&&node.props.type==='file'&&(node.props.webkitdirectory!==undefined)===folder)[0];
}

test('folder selection passes browser relative paths into the current upload target and resets its chooser', async()=>{
  const calls=[];
  const f=fixture(async (...args)=>{calls.push(args);return {spaceId:'space-1',uploaded:[{}],failures:[],failedFiles:[]}});
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  const input=tree.root.findAll(node=>node.type==='input'&&node.props.webkitdirectory!==undefined)[0];
  assert.ok(input,'folder chooser is present');
  const selected=[folderFile('Release/docs/a.md')];
  const target={files:selected,value:'selected'};
  await act(async()=>input.props.onChange({target}));
  assert.equal(target.value,'');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],null);
  assert.equal(calls[0][1][0],selected[0]);
  assert.equal(calls[0][2].preservePaths,true);
  assert.equal(calls[0][2].spaceId,'space-1');
  await act(async()=>tree.unmount());
});

test('partial upload errors remain visible and retry only failures in the original space', async()=>{
  const good=folderFile('Release/good.md');const bad=folderFile('Release/docs/bad.md');const calls=[];
  const f=fixture(async (...args)=>{calls.push(args);return calls.length===1
    ? {spaceId:'space-1',uploaded:[{}],failures:[{fileName:bad.webkitRelativePath,message:'network failed'}],failedFiles:[bad]}
    : {spaceId:'space-1',uploaded:[{}],failures:[],failedFiles:[]};
  });
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  const input=tree.root.findAll(node=>node.type==='input'&&node.props.webkitdirectory!==undefined)[0];
  assert.ok(input,'folder chooser is present');
  await act(async()=>input.props.onChange({target:{files:[good,bad],value:''}}));
  assert.match(JSON.stringify(tree.toJSON()),/Release\/docs\/bad.md/);
  assert.match(JSON.stringify(tree.toJSON()),/network failed/);
  assert.match(JSON.stringify(tree.toJSON()),/原檔仍在你的電腦/);
  assert.match(JSON.stringify(tree.toJSON()),/同頁按「重試未上傳檔案」/);
  assert.match(JSON.stringify(tree.toJSON()),/大檔案傳輸中斷時可續傳/);
  assert.match(JSON.stringify(tree.toJSON()),/重新整理或關閉頁面後，須重新選取原檔/);
  f.state.activeSpaceId=null;f.state.activeSpace=null;
  await act(async()=>tree.update(React.createElement(f.Component)));
  const retry=tree.root.findAll(node=>node.type==='stub'&&node.props['aria-label']==='重試未上傳檔案')[0];
  assert.ok(retry);
  assert.equal(tree.root.findAll(node=>node.type==='input'&&node.props.webkitdirectory!==undefined)[0].props.disabled,true);
  await act(async()=>retry.props.onClick());
  assert.equal(calls[1][0],null);
  assert.equal(calls[1][1].length,1);
  assert.equal(calls[1][1][0],bad);
  assert.equal(calls[1][2].preservePaths,true);
  assert.equal(calls[1][2].spaceId,'space-1');
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
});

test('read-only mode disables the folder chooser action', async()=>{
  const f=fixture(async()=>{throw new Error('must not upload')},false);let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  const button=tree.root.findAll(node=>node.type==='stub'&&node.props['aria-label']==='上傳資料夾')[0];
  assert.ok(button,'folder upload button is present');
  assert.equal(button.props.disabled,true);
  assert.equal(tree.root.findAll(node=>node.type==='input'&&node.props.webkitdirectory!==undefined)[0].props.disabled,true);
  await act(async()=>tree.unmount());
});

test('busy uploads and pending failures prevent unloading until dismissed', async()=>{
  const bad=new File(['data'],'bad.md');
  const f=fixture(async()=>({spaceId:'space-1',uploaded:[],failures:[{fileName:bad.name,message:'network failed'}],failedFiles:[bad]}));
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  assert.equal(preventsUnload(f),false);
  f.state.busy=true;
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.equal(preventsUnload(f),true);
  f.state.busy=false;
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.equal(preventsUnload(f),false);
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[bad],value:''}}));
  assert.equal(preventsUnload(f),true);
  const dismiss=tree.root.findAll(node=>node.props['aria-label']==='關閉上傳失敗清單')[0];
  await act(async()=>dismiss.props.onClick());
  assert.equal(preventsUnload(f),false);
  assert.equal(f.listenerCount('station-user-changed'),0);
  await act(async()=>tree.unmount());
  assert.equal(preventsUnload(f),false);
});

test('an upload in progress blocks workspace navigation and completion releases it', async()=>{
  const f=fixture(async()=>({spaceId:'space-1',uploaded:[],failures:[],failedFiles:[]}));
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  const navigation=()=>f.window.dispatchEvent(new Event('workspace-before-navigate',{cancelable:true}));
  assert.equal(navigation(),true);
  f.state.busy=true;
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.equal(navigation(),false);
  assert.match(f.toasts.at(-1),/正在上傳檔案.*完成後.*切換工作區/);
  f.state.busy=false;
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.equal(navigation(),true);
  await act(async()=>tree.unmount());
});

test('synchronous logout after the session gate unmounts clears retained Files without an SDK event', async()=>{
  const file=new File(['private'],'private.md');
  const f=fixture(async()=>({spaceId:'space-1',uploaded:[],failures:[{fileName:file.name,message:'failed'}],failedFiles:[file]}));
  let loggedIn=true;let tree;
  function Gate(){return loggedIn?React.createElement(f.Component):React.createElement('p',null,'登入')}
  await act(async()=>{tree=create(React.createElement(Gate))});
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[file],value:''}}));
  assert.equal(preventsUnload(f),true);
  loggedIn=false;
  await act(async()=>tree.update(React.createElement(Gate)));
  assert.equal(preventsUnload(f),true,'the retry-owned warning remains while navigating away');
  await act(async()=>f.emitOwner(null));
  assert.equal(preventsUnload(f),false,'logout releases the original File and warning after gate unmount');
  assert.equal(f.listenerCount('station-user-changed'),0);
  assert.equal(f.listenerCount('beforeunload'),0);
  loggedIn=true;
  await act(async()=>tree.update(React.createElement(Gate)));
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
});

test('retained retries ignore same-owner notifications and clear for another owner while unmounted', async()=>{
  const file=new File(['private'],'private.md');
  const f=fixture(async()=>({spaceId:'space-1',uploaded:[],failures:[{fileName:file.name,message:'failed'}],failedFiles:[file]}));
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[file],value:''}}));
  await act(async()=>tree.unmount());
  await act(async()=>f.emitOwner('owner'));
  assert.equal(preventsUnload(f),true);
  await act(async()=>f.emitOwner('another-owner'));
  assert.equal(preventsUnload(f),false);
  assert.equal(f.listenerCount('station-user-changed'),0);
  assert.equal(f.listenerCount('beforeunload'),0);
  f.state.ownerId='another-owner';
  await act(async()=>{tree=create(React.createElement(f.Component))});
  assert.doesNotMatch(JSON.stringify(tree.toJSON()),/private\.md/);
  await act(async()=>tree.unmount());
  f.state.ownerId='owner';
  await act(async()=>{tree=create(React.createElement(f.Component))});
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
});

for (const folder of [false,true]) {
  test(`${folder?'folder':'plain'} failures survive workspace remount with the original File and target`, async()=>{
    const bad=folder?folderFile('Release/docs/bad.md'):new File(['data'],'bad.md');
    const calls=[];
    const f=fixture(async(...args)=>{
      calls.push(args);
      return calls.length===1
        ? {spaceId:'space-1',uploaded:[],failures:[{fileName:bad.name,message:'network failed'}],failedFiles:[bad]}
        : {spaceId:'space-1',uploaded:[{}],failures:[],failedFiles:[]};
    });
    let tree;
    await act(async()=>{tree=create(React.createElement(f.Component))});
    await act(async()=>uploadInput(tree,folder).props.onChange({target:{files:[bad],value:''}}));
    await act(async()=>tree.unmount());
    assert.equal(preventsUnload(f),true,'retained failures still warn before the tab closes from another workspace');
    assert.equal(f.listenerCount('station-user-changed'),1);
    f.state.activeSpaceId='space-2';f.state.activeSpace={id:'space-2',name:'Another'};
    await act(async()=>{tree=create(React.createElement(f.Component))});
    const retry=tree.root.findAll(node=>node.props['aria-label']==='重試未上傳檔案')[0];
    assert.ok(retry,'remount restores the failed selection');
    assert.equal(preventsUnload(f),true);
    await act(async()=>retry.props.onClick());
    assert.equal(calls[1][1][0],bad);
    assert.equal(calls[1][2].spaceId,'space-1');
    assert.equal(calls[1][2].preservePaths,folder);
    assert.equal(preventsUnload(f),false);
    assert.equal(f.listenerCount('station-user-changed'),0);
    assert.equal(f.listenerCount('beforeunload'),0);
    await act(async()=>tree.unmount());
    await act(async()=>{tree=create(React.createElement(f.Component))});
    assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0,'successful retry clears retained files');
    await act(async()=>tree.unmount());
  });
}

test('switching accounts clears retained failures and cannot revive them by switching back', async()=>{
  const bad=new File(['data'],'private.md');
  const f=fixture(async()=>({spaceId:'space-1',uploaded:[],failures:[{fileName:bad.name,message:'network failed'}],failedFiles:[bad]}));
  let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[bad],value:''}}));
  f.state.ownerId='another-owner';
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.doesNotMatch(JSON.stringify(tree.toJSON()),/private\.md/);
  assert.equal(preventsUnload(f),false);
  f.state.ownerId='owner';
  await act(async()=>tree.update(React.createElement(f.Component)));
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
  f.state.ownerId='another-owner';
  await act(async()=>{tree=create(React.createElement(f.Component))});
  assert.doesNotMatch(JSON.stringify(tree.toJSON()),/private\.md/);
  await act(async()=>tree.unmount());
});

test('late upload failures cannot appear after an account switch and switch back', async()=>{
  const pending=deferred();const bad=new File(['data'],'private.md');
  const f=fixture(async()=>pending.promise);let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[bad],value:''}}));
  f.state.ownerId='another-owner';
  await act(async()=>tree.update(React.createElement(f.Component)));
  f.state.ownerId='owner';
  await act(async()=>tree.update(React.createElement(f.Component)));
  await act(async()=>pending.resolve({spaceId:'space-1',uploaded:[],failures:[{fileName:bad.name,message:'network failed'}],failedFiles:[bad]}));
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
});

test('late upload rejection after unmount does not create a retained failure on remount', async()=>{
  const pending=deferred();const bad=new File(['data'],'private.md');
  const f=fixture(async()=>pending.promise);let tree;
  await act(async()=>{tree=create(React.createElement(f.Component))});
  await act(async()=>uploadInput(tree).props.onChange({target:{files:[bad],value:''}}));
  await act(async()=>tree.unmount());
  await act(async()=>pending.reject(new Error('late failure')));
  await act(async()=>{tree=create(React.createElement(f.Component))});
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='上傳失敗清單').length,0);
  await act(async()=>tree.unmount());
});
