const assert = require('node:assert/strict');
const test = require('node:test');
const {React, create, act, loader} = require('../support/renderHarness.cjs');

function fixture(uploadFiles, editable = true) {
  const state = {
    spaces:[{id:'space-1', name:'Engineering', projectId:null}], activeSpaceId:'space-1', activeSpace:{id:'space-1', name:'Engineering'},
    folders:[], files:[], loading:false, busy:false, error:null, uploadProgress:null, canEdit:editable, canEditSpace:()=>editable, ownerId:'owner', isAuthenticated:true, uploadFiles,
  };
  const load=loader({globals:{File,Blob},mocks:{
    './hooks/useTestPlanWorkspace':{useTestPlanWorkspace:()=>state},
    './TestPlanInspector':{TestPlanInspector:()=>null},
    './TestPlanSpreadsheetEditor':{TestPlanSpreadsheetEditor:()=>null},
    './TestPlanSpaceDialog':{TestPlanSpaceDialog:()=>null},
    sonner:{toast:{success(){},error(){}}},
  }});
  const {TestPlanWorkspace}=load('src/components/test-plan/TestPlanWorkspace.tsx');
  return {state,Component:TestPlanWorkspace};
}

function folderFile(path) {
  const file=new File(['data'],path.split('/').at(-1));
  Object.defineProperty(file,'webkitRelativePath',{value:path});
  return file;
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
