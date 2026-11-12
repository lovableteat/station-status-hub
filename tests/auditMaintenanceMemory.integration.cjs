const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, loader, browser, deferred } = require('./support/renderHarness.cjs');
function setup() {
  const win = browser();
  const load = loader({ window: win });
  const r = load('src/lib/documentDrafts.ts'), c = load('src/components/maintenance/maintenanceComposerDraft.ts');
  r.setDocumentDraftActor('A');
  const scope = r.documentDraftScope('A', 'maintenance-note', 'project/issue', 'test');
  const draft = c.createMaintenanceComposerDraft(); draft.text = '原始 α\n未送出';
  draft.files = [{ id: 'f1', file: new File([new Uint8Array([0, 255, 17])], 'native.bin', { lastModified: 123 }) }];
  r.writeDocumentDraft(scope, draft);
  return { r, c, scope, draft, load, win, read: () => r.readDocumentDraft(scope)?.value };
}
test('document registry preserves native File and isolates scope, epoch, document and CAS generation', async () => {
  const h = setup(); const first = h.r.readDocumentDraft(h.scope);
  assert.equal(first.value.files[0].file, h.draft.files[0].file);
  assert.deepEqual([...new Uint8Array(await first.value.files[0].file.arrayBuffer())], [0,255,17]);
  assert.equal(h.r.readDocumentDraft(h.r.documentDraftScope('A','other','project/issue','test')), null);
  assert.equal(h.r.readDocumentDraft(h.r.documentDraftScope('A','maintenance-note','other','test')), null);
  assert.equal(h.r.readDocumentDraft(h.r.documentDraftScope('A','maintenance-note','project/issue','other')), null);
  h.r.writeDocumentDraft(h.scope, {...h.draft, text:'new'});
  assert.equal(h.r.clearDocumentDraft(h.scope, first.generation), false);
  h.r.setDocumentDraftActor('A'); assert.equal(h.read().text, 'new');
  h.r.setDocumentDraftActor('B'); assert.equal(h.read(), undefined); assert.equal(h.r.writeDocumentDraft(h.scope,h.draft),null);
  h.r.setDocumentDraftActor('A'); assert.equal(h.r.isDocumentDraftScopeCurrent(h.scope), false);
  const newScope = h.r.documentDraftScope('A','maintenance-note','project/issue','test');
  h.r.writeDocumentDraft(newScope,h.draft); h.r.setDocumentDraftActor(null); h.r.setDocumentDraftActor('A');
  assert.equal(h.r.readDocumentDraft(newScope), null);
  const other = setup(); assert.equal(other.r.readDocumentDraft(h.scope), null);
});
test('successful send clears only matching draft and retains exact note/file identity', async () => {
  const h=setup(), calls=[];
  assert.equal(await h.c.sendMaintenanceComposer(h.scope,()=>true,{
    addNote:async(id,text)=>calls.push(['note',id,text]), uploadFile:async(id,item)=>{assert.equal(item.file,h.draft.files[0].file);calls.push(['upload',id]);},attachFile:async id=>calls.push(['attach',id]),
  }),true);
  assert.equal(h.read(),undefined); assert.equal(calls.length,3); assert.equal(calls[0][1],h.draft.messageId);
});
for(const stop of ['unmount','account-switch','signout']) test(`note receipt after ${stop} never continues attachment writes`,async()=>{
  const h=setup(), wait=deferred(); let allowed=true,writes=0;
  const sending=h.c.sendMaintenanceComposer(h.scope,()=>allowed,{addNote:()=>wait.promise,uploadFile:async()=>writes++,attachFile:async()=>writes++});
  if(stop==='unmount')allowed=false; else h.r.setDocumentDraftActor(stop==='signout'?null:'B');
  wait.resolve(); assert.equal(await sending,false); assert.equal(writes,0);
  if(stop==='unmount'){assert.equal(h.read().savedNote,true);assert.equal(h.read().messageId,h.draft.messageId);assert.equal(h.read().files.length,1);assert.equal(h.read().phase,'idle');}
  else assert.equal(h.read(),undefined);
});
test('partial success keeps note receipt and only pending files; explicit denial retry never duplicates note',async()=>{
  const h=setup();h.draft.files.push({id:'f2',file:new File(['two'],'two.txt')});let notes=0,attachments=0;
  await h.c.sendMaintenanceComposer(h.scope,()=>true,{addNote:async()=>notes++,uploadFile:async()=>{},attachFile:async()=>{if(++attachments===2)throw {code:'42501'};}});
  assert.equal(h.read().savedNote,true);assert.equal(h.read().files.length,1);assert.equal(h.read().files[0].id,'f2');assert.equal(h.read().phase,'idle');
  assert.equal(await h.c.sendMaintenanceComposer(h.scope,()=>true,{addNote:async()=>notes++,uploadFile:async()=>{},attachFile:async()=>{}}),true);
  assert.equal(notes,1);
});
test('unknown result blocks resubmission and retains the exact message id and files',async()=>{
  const h=setup();let notes=0;const transport={addNote:async()=>{notes++;throw new Error('network');},uploadFile:async()=>{},attachFile:async()=>{}};
  assert.equal(await h.c.sendMaintenanceComposer(h.scope,()=>true,transport),false);
  assert.equal(h.read().phase,'uncertain');assert.equal(h.read().messageId,h.draft.messageId);
  assert.equal(await h.c.sendMaintenanceComposer(h.scope,()=>true,transport),false);assert.equal(notes,1);
});
test('late success cannot clear a replacement draft or continue its writes',async()=>{
  const h=setup(),wait=deferred();let writes=0;
  const sending=h.c.sendMaintenanceComposer(h.scope,()=>true,{addNote:()=>wait.promise,uploadFile:async()=>writes++,attachFile:async()=>writes++});
  const next=h.c.createMaintenanceComposerDraft();next.text='new draft';h.r.writeDocumentDraft(h.scope,next);
  wait.resolve();assert.equal(await sending,false);assert.equal(h.read().text,'new draft');assert.equal(writes,0);
});
test('permission loss between storage upload and metadata prevents the next write but keeps receipt',async()=>{
  const h=setup();let allowed=true,metadata=0;
  await h.c.sendMaintenanceComposer(h.scope,()=>allowed,{addNote:async()=>{},uploadFile:async()=>{allowed=false;},attachFile:async()=>metadata++});
  assert.equal(metadata,0);assert.equal(h.read().savedNote,true);assert.equal(h.read().files.length,1);
});
test('actual composer hook remount restores note/File with no writes; successful send rotates message id',async()=>{
  const win=browser();let hook,writes=0;
  const db={rpc:async()=>{writes++;return {error:null};},storage:{from:()=>({upload:async()=>{writes++;return {error:null};}})}};
  const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:db}}});
  const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');
  const {useMaintenanceComposer}=load('src/components/maintenance/useMaintenanceComposer.ts');
  function Probe({actor='A',issue='one',access=true}){hook=useMaintenanceComposer(actor,'project',issue,access);return null;}
  let root;await act(async()=>{root=create(React.createElement(Probe));});
  const file=new File(['native bytes'],'file.bin');
  await act(async()=>{hook.setText('last key');hook.setFiles(previous=>[...previous,{id:'file',file}]);});
  const id=hook.draft.messageId;await act(async()=>root.unmount());
  await act(async()=>{root=create(React.createElement(Probe));});
  assert.equal(hook.draft.text,'last key');assert.equal(hook.draft.files[0].file,file);assert.equal(writes,0);
  await act(async()=>root.update(React.createElement(Probe,{issue:'two'})));assert.equal(hook.draft.text,'');
  await act(async()=>root.update(React.createElement(Probe)));assert.equal(hook.draft.text,'last key');
  await act(async()=>root.update(React.createElement(Probe,{access:false})));await act(async()=>hook.send());assert.equal(writes,0);
  await act(async()=>root.update(React.createElement(Probe)));await act(async()=>hook.send());
  assert.equal(writes,3);assert.equal(hook.draft.text,'');assert.notEqual(hook.draft.messageId,id);
  await act(async()=>root.unmount());
});

test('mounted file previews are recreated from the same File and revoked on removal/unmount',async()=>{
  const file=new File([new Uint8Array([0,1,255])],'image.png',{type:'image/png'}), created=[],revoked=[];
  class TestURL extends URL {static createObjectURL(value){assert.equal(value,file);const url=`blob:synthetic-${created.length}`;created.push(url);return url;}static revokeObjectURL(url){revoked.push(url);}}
  const load=loader({globals:{URL:TestURL},mocks:{
    '@/components/attachments/PrivateAttachmentImage':{PrivateAttachmentImage:()=>null},
    '@/lib/privateAttachments':{},'./useMaintenanceData':{maintenanceError:String},'@/integrations/supabase/client':{supabase:{}},
  }});
  const {useComposerFilePreviews}=load('src/components/maintenance/MaintenanceAttachments.tsx');
  let api,source=[{id:'image',file}];const change=fn=>{source=fn(source);};
  function Probe(){api=useComposerFilePreviews(source,change);return null;}
  let root;await act(async()=>{root=create(React.createElement(Probe));});
  assert.equal(api.files[0].file,file);assert.equal(api.files[0].preview,created[0]);
  await act(async()=>root.unmount());assert.deepEqual(revoked,[created[0]]);
  await act(async()=>{root=create(React.createElement(Probe));});
  assert.notEqual(api.files[0].preview,created[0]);assert.equal(api.files[0].file,file);
  await act(async()=>{api.remove('image');root.update(React.createElement(Probe));});
  assert.equal(api.files.length,0);assert.deepEqual(revoked,created);
  await act(async()=>root.unmount());assert.deepEqual(revoked,created);
});

test('issue change during note send records old receipt but does not write attachments or clear new issue draft',async()=>{
  const win=browser(),wait=deferred();let hook,writes=0;
  const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:{rpc:()=>wait.promise,storage:{from:()=>({upload:async()=>{writes++;return{error:null};}})}}}}});
  const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');
  const {useMaintenanceComposer}=load('src/components/maintenance/useMaintenanceComposer.ts');
  function Probe({issue}){hook=useMaintenanceComposer('A','project',issue,true);return null;}
  let root;await act(async()=>{root=create(React.createElement(Probe,{issue:'one'}));});
  await act(async()=>{hook.setText('one');hook.setFiles(()=>[{id:'f',file:new File(['x'],'x')}]);});
  let sending;await act(async()=>{sending=hook.send();});
  await act(async()=>root.update(React.createElement(Probe,{issue:'two'})));
  await act(async()=>hook.setText('new issue'));
  await act(async()=>{wait.resolve({error:null});await sending;});
  assert.equal(writes,0);assert.equal(hook.draft.text,'new issue');
  await act(async()=>root.update(React.createElement(Probe,{issue:'one'})));
  assert.equal(hook.draft.savedNote,true);assert.equal(hook.draft.files.length,1);assert.equal(hook.draft.phase,'idle');
  await act(async()=>hook.setText('must not change confirmed note'));assert.equal(hook.draft.text,'one');
  await act(async()=>root.unmount());
});

test('actual permission guard unmount/remount preserves real MaintenanceDetail composer and native File without writes',async()=>{
  const win=browser();let granted=true,writes=0,reconcileData=null;
  const load=loader({window:win,mocks:{
    '@/integrations/supabase/client':{supabase:{rpc:async(name)=>{if(name==='maintenance_thread')return {data:reconcileData,error:null};writes++;throw Error('network result unknown');}}},
    '@/hooks/usePermissions':{usePermissions:()=>({loading:false,canViewModule:()=>granted,canEditModule:()=>granted})},
    './useMaintenanceData':{useFaultThread:()=>({thread:{messages:[],attachments:[]},loading:false,error:null,refresh:async()=>{}}),useMaintenanceViewport:()=>({bottom:0}),maintenanceError:String},
    './MaintenanceFeedback':{MaintenanceLoading:()=>null,MaintenanceSpinner:()=>null,showMaintenanceSuccess:()=>{}},
    '@/components/attachments/PrivateAttachmentHtml':{PrivateAttachmentHtml:()=>null},
    '@/components/attachments/PrivateAttachmentImage':{PrivateAttachmentImage:()=>null},'@/lib/privateAttachments':{},
  }});
  const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');
  const {MaintenanceDetail}=load('src/components/maintenance/MaintenanceDetail.tsx'),{PermissionGuard}=load('src/components/layout/PermissionGuard.tsx');
  const issue={id:'one',title:'Synthetic',description:'Synthetic',updated_at:'v1',created_at:'2026-01-01',status:'open',maintenance_status:'pending',assignee_user_ids:[]};
  const view=()=>React.createElement(PermissionGuard,{module:'issues'},React.createElement(MaintenanceDetail,{actorId:'A',projectId:'p',issue,data:{people:[],systems:[],categories:[]},canEdit:true,onBack(){},refresh:async()=>{}}));
  let root;await act(async()=>{root=create(view());});
  const field=()=>root.root.findAll(n=>n.type==='stub'&&n.props.id==='mf-new-note')[0];
  const file=new File([new Uint8Array([5,0,255])],'native.dat',{lastModified:77});
  await act(async()=>{field().props.onChange({target:{value:'最後一個字 🧪'}});root.root.findByProps({type:'file'}).props.onChange({target:{files:[file],value:''}});});
  granted=false;await act(async()=>root.update(view()));assert.equal(root.root.findAll(n=>n.props.id==='mf-new-note').length,0);
  granted=true;await act(async()=>root.update(view()));assert.equal(field().props.value,'最後一個字 🧪');
  const entry=r.readDocumentDraft(r.documentDraftScope('A','maintenance-note',JSON.stringify(['p','one']),'maintenance-composer'));
  assert.equal(entry.value.files[0].file,file);assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[5,0,255]);assert.equal(writes,0);
  await act(async()=>root.root.findByProps({className:'mf-composer'}).props.onSubmit({preventDefault(){}}));
  const retry=root.root.findAll(n=>n.type==='stub'&&n.props.children==='核對送出結果')[0];assert.ok(retry);
  assert.equal(field().props.disabled,true);assert.equal(writes,1);
  const fileId=entry.value.files[0].id;
  reconcileData={messages:[{id:entry.value.messageId,issue_id:'one',actor_id:'A',kind:'note',body:entry.value.text}],attachments:[{id:fileId,issue_id:'one',maintenance_message_id:entry.value.messageId,file_path:`one/${entry.value.messageId}/${fileId}`,file_name:file.name,file_size:file.size,file_type:file.type}]};
  await act(async()=>retry.props.onClick());
  assert.equal(field().props.value,'');assert.equal(writes,1,'Read-only reconcile never sends again');

  await act(async()=>{r.setDocumentDraftActor('B');root.update(view());});
  assert.equal(field().props.value,'');assert.equal(field().props.disabled,true);
  await act(async()=>root.unmount());
});

const unload = win => {const event=new Event('beforeunload',{cancelable:true});win.dispatchEvent(event);return event.defaultPrevented;};
test('registry warning survives gate removal and disappears on last CAS clear or identity invalidation',()=>{
 const h=setup();assert.equal(unload(h.win),true);
 const second=h.r.documentDraftScope('A','pcb-project-settings','p','pcb-dialog');h.r.writeDocumentDraft(second,{values:{name:'unsaved'}});
 h.r.clearDocumentDraft(h.scope,h.r.readDocumentDraft(h.scope).generation);assert.equal(unload(h.win),true);
 h.r.clearDocumentDraft(second,h.r.readDocumentDraft(second).generation);assert.equal(unload(h.win),false);
 h.r.writeDocumentDraft(h.scope,h.draft);h.r.setDocumentDraftActor(null);assert.equal(unload(h.win),false);
});
test('empty idle composer does not warn; typing then deleting clears warning; gate-unmounted draft still warns',async()=>{
 const win=browser();let hook;const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:{}}}});
 const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');const {useMaintenanceComposer}=load('src/components/maintenance/useMaintenanceComposer.ts');
 function Probe(){hook=useMaintenanceComposer('A','p','i',true);return null;}
 let root;await act(async()=>{root=create(React.createElement(Probe));});assert.equal(unload(win),false);
 await act(async()=>hook.send());assert.equal(unload(win),false);
 await act(async()=>hook.setText('draft'));assert.equal(unload(win),true);
 await act(async()=>hook.setText(''));assert.equal(unload(win),false);
 await act(async()=>hook.setFiles(()=>[{id:'f',file:new File(['x'],'x')}]));
 await act(async()=>root.unmount());assert.equal(unload(win),true);
});
for(const code of ['22023'])test(`explicit ${code} is retryable validation rather than permanent uncertainty`,async()=>{
 const h=setup();await h.c.sendMaintenanceComposer(h.scope,()=>true,{addNote:async()=>{throw {code};},uploadFile:async()=>{},attachFile:async()=>{}});
 assert.equal(h.read().phase,'idle');assert.match(h.read().error,new RegExp(code));assert.equal(h.read().files[0].file,h.draft.files[0].file);
});
function uncertain(h){h.r.writeDocumentDraft(h.scope,{...h.draft,phase:'uncertain',attemptLocked:true,hasUncertainAttempt:true});}
function threadReceipt(h,attachment=true){return {messages:[{id:h.draft.messageId,issue_id:'issue',actor_id:'A',kind:'note',body:h.c.trimMaintenanceNote(h.draft.text)}],attachments:attachment?[{id:'f1',issue_id:'issue',maintenance_message_id:h.draft.messageId,file_path:`issue/${h.draft.messageId}/f1`,file_name:h.draft.files[0].file.name,file_size:h.draft.files[0].file.size,file_type:h.draft.files[0].file.type}]:[]};}
test('explicit reconcile exact completed note and attachment clears warning with no writes',async()=>{
 const h=setup();uncertain(h);let reads=0;
 assert.equal(await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>{reads++;return threadReceipt(h);}),true);
 assert.equal(reads,1);assert.equal(h.read(),undefined);assert.equal(unload(h.win),false);
});
test('reconcile partial receipt retains exact pending File and messageId, never sends automatically',async()=>{
 const h=setup();uncertain(h);
 assert.equal(await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>threadReceipt(h,false)),true);
 assert.equal(h.read().savedNote,true);assert.equal(h.read().phase,'idle');assert.equal(h.read().messageId,h.draft.messageId);assert.equal(h.read().files[0].file,h.draft.files[0].file);
});
test('reconcile absence retains payload and allows only subsequent explicit idempotent retry',async()=>{
 const h=setup();uncertain(h);
 assert.equal(await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>({messages:[],attachments:[]})),true);
 assert.equal(h.read().savedNote,false);assert.equal(h.read().phase,'idle');assert.equal(h.read().messageId,h.draft.messageId);assert.equal(h.read().text,h.draft.text);
});
for(const corruption of ['actor','body','file','missing-confirmed','duplicate','denied'])test(`reconcile ${corruption} retains uncertain receipt without data loss`,async()=>{
 const h=setup();uncertain(h);const data=threadReceipt(h);
 if(corruption==='actor')data.messages[0].actor_id='B';if(corruption==='body')data.messages[0].body='other';
 if(corruption==='file')data.attachments[0].file_size=999;if(corruption==='duplicate')data.messages.push(data.messages[0]);
 if(corruption==='missing-confirmed'){h.r.writeDocumentDraft(h.scope,{...h.read(),savedNote:true});data.messages=[];}
 assert.equal(await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>{if(corruption==='denied')throw{code:'42501'};return data;}),false);
 assert.equal(h.read().phase,'uncertain');assert.equal(h.read().files[0].file,h.draft.files[0].file);
});
test('stale reconcile success cannot clear a newer draft or recover old actor',async()=>{
 for(const transition of ['draft','actor']){
 const h=setup();uncertain(h);const wait=deferred();const checking=h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,()=>wait.promise);
 if(transition==='actor')h.r.setDocumentDraftActor('B');else h.r.writeDocumentDraft(h.scope,{...h.c.createMaintenanceComposerDraft(),text:'new'});
 wait.resolve(threadReceipt(h));assert.equal(await checking,false);
 assert.equal(h.read()?.text,transition==='draft'?'new':undefined);
 }
});

test('unknown note followed by absent read locks text/File and retries the exact payload after late server commit',async()=>{
 const win=browser();let hook;const sent=[],uploads=[];let committed=null;
 const db={rpc:async(name,args)=>{
   if(name==='maintenance_thread')return {data:{messages:[],attachments:[]},error:null};
   if(name==='maintenance_add_attachment')return {error:null};
   sent.push(args);
   if(sent.length===1)throw new Error('response lost while server still working');
   assert.equal(args.p_message_id,committed.p_message_id);assert.equal(args.p_body,committed.p_body);return {error:null};
 },storage:{from:()=>({upload:async(path,file)=>{uploads.push({path,file});return {error:null};}})}};
 const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:db}}});const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');
 const {useMaintenanceComposer}=load('src/components/maintenance/useMaintenanceComposer.ts');function Probe(){hook=useMaintenanceComposer('A','p','i',true);return null;}
 let root;await act(async()=>{root=create(React.createElement(Probe));});const file=new File(['original bytes'],'original.png',{type:'image/png'});
 await act(async()=>{hook.setText('original note');hook.setFiles(()=>[{id:'file',file}]);});
 await act(async()=>hook.send());assert.equal(hook.draft.phase,'uncertain');
 await act(async()=>hook.reconcile());assert.equal(hook.draft.phase,'idle');assert.equal(hook.draft.attemptLocked,true);
 await act(async()=>{hook.setText('changed text');hook.setFiles(()=>[]);});
 assert.equal(hook.draft.text,'original note');assert.equal(hook.draft.files[0].file,file);
 committed=sent[0];await act(async()=>hook.send());
 assert.equal(sent.length,2);assert.equal(uploads.length,1);assert.equal(uploads[0].file,file);assert.equal(hook.draft.text,'');
 await act(async()=>root.unmount());
});
test('unknown attachment followed by partial read locks original bytes through same-ID metadata retry',async()=>{
 const h=setup();let notes=0,metadata=0;const uploads=[];
 const transport={addNote:async()=>notes++,uploadFile:async(id,item)=>uploads.push(item.file),attachFile:async()=>{if(++metadata===1)throw new Error('response lost');}};
 await h.c.sendMaintenanceComposer(h.scope,()=>true,transport);assert.equal(h.read().attemptLocked,true);
 await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>threadReceipt(h,false));
 assert.equal(h.read().attemptLocked,true);assert.equal(h.read().files[0].file,h.draft.files[0].file);
 await h.c.sendMaintenanceComposer(h.scope,()=>true,transport);
 assert.equal(notes,1);assert.equal(metadata,2);assert.equal(uploads[0],uploads[1]);assert.equal(h.read(),undefined);
});
test('PT409 is a receipt conflict, not editable validation, and SQL trim preserves non-space boundaries',async()=>{
 const h=setup();await h.c.sendMaintenanceComposer(h.scope,()=>true,{addNote:async()=>{throw{code:'PT409'};},uploadFile:async()=>{},attachFile:async()=>{}});
 assert.equal(h.read().phase,'uncertain');assert.equal(h.read().attemptLocked,true);
 for(const [input,expected] of [['  note  ','note'],['note \n','note \n'],[' \nnote\n ','\nnote\n'],['\tnote\t','\tnote\t'],['   ','']])assert.equal(h.c.trimMaintenanceNote(input),expected);
});
for(const nextCode of ['42501','22023'])test(`earlier unknown remains immutable after absent read and later ${nextCode} rejection`,async()=>{
 const h=setup();let attempt=0;
 const transport={addNote:async()=>{if(++attempt===1)throw new Error('unknown');throw{code:nextCode};},uploadFile:async()=>{},attachFile:async()=>{}};
 await h.c.sendMaintenanceComposer(h.scope,()=>true,transport);
 await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>({messages:[],attachments:[]}));
 await h.c.sendMaintenanceComposer(h.scope,()=>true,transport);
 assert.equal(h.read().hasUncertainAttempt,true);assert.equal(h.read().attemptLocked,true);assert.equal(h.read().phase,'idle');
 assert.equal(h.read().messageId,h.draft.messageId);assert.equal(h.read().files[0].file,h.draft.files[0].file);
});
test('earlier unknown stays locked after retry note receipt then unmount pause',async()=>{
 const h=setup();let allowed=true;uncertain(h);
 await h.c.reconcileMaintenanceComposer(h.scope,'issue',()=>true,async()=>({messages:[],attachments:[]}));
 await h.c.sendMaintenanceComposer(h.scope,()=>allowed,{addNote:async()=>{allowed=false;},uploadFile:async()=>{},attachFile:async()=>{}});
 assert.equal(h.read().savedNote,true);assert.equal(h.read().attemptLocked,true);assert.equal(h.read().hasUncertainAttempt,true);
});

for(const failedStage of ['upload','attach'])for(const code of ['22023','42501'])test(`file-only confirmed note: removing last ${failedStage}/${code} attachment clears only RAM receipt`,async()=>{
 const win=browser();let hook;const calls=[];
 const db={rpc:async(name,args)=>{calls.push(name);return name==='maintenance_add_attachment'&&failedStage==='attach'?{error:{code}}:{error:null};},
 storage:{from:()=>({upload:async()=>{calls.push('upload');return failedStage==='upload'?{error:{code}}:{error:null};}})}};
 const load=loader({window:win,mocks:{'@/integrations/supabase/client':{supabase:db}}});const r=load('src/lib/documentDrafts.ts');r.setDocumentDraftActor('A');
 const {useMaintenanceComposer}=load('src/components/maintenance/useMaintenanceComposer.ts');function Probe(){hook=useMaintenanceComposer('A','p','i',true);return null;}
 let root;await act(async()=>{root=create(React.createElement(Probe));});
 await act(async()=>hook.setFiles(()=>[{id:'f',file:new File(['file-only'],'only.bin')}]));const messageId=hook.draft.messageId;
 await act(async()=>hook.send());assert.equal(hook.draft.savedNote,true);assert.equal(hook.draft.text,'');assert.equal(hook.draft.hasUncertainAttempt,false);assert.equal(unload(win),true);
 const before=calls.length;await act(async()=>hook.setFiles(previous=>previous.filter(file=>file.id!=='f')));
 assert.equal(calls.length,before,'Removing a local pending file performs no server write/delete');
 assert.equal(hook.draft.files.length,0);assert.equal(hook.draft.savedNote,false);assert.notEqual(hook.draft.messageId,messageId);assert.equal(unload(win),false);
 await act(async()=>root.unmount());
});
