import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { parsePrivateAttachmentUrl, resolvePrivateAttachmentPath } from '../src/lib/privateAttachmentPaths.mjs';
const require = createRequire(import.meta.url);
const { loader, React, create, act, flush, deferred } = require('./support/renderHarness.cjs');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { JSDOM } = qa('jsdom');
const project = 'https://project.supabase.co';
const old = `${project}/storage/v1/object/public/issue-attachments/issue/inline/old%20image.png`;

for (const mode of ['public', 'sign', 'authenticated']) {
  test(`historical ${mode} URL resolves its unchanged object path`, () => {
    const value = `${project}/storage/v1/object/${mode}/issue-attachments/issue/inline/old%20image.png?token=expired`;
    assert.deepEqual(parsePrivateAttachmentUrl(value, project), {bucket:'issue-attachments',path:'issue/inline/old image.png'});
    assert.equal(resolvePrivateAttachmentPath('issue-attachments', value, project), 'issue/inline/old image.png');
  });
}
test('raw object paths and percent literals are preserved without double decoding', () => {
  assert.equal(resolvePrivateAttachmentPath('task-attachments', 'general-assets/global/a 100% real.pdf', project), 'general-assets/global/a 100% real.pdf');
  assert.equal(parsePrivateAttachmentUrl(`${project}/storage/v1/object/public/task-attachments/file%252Fname`, project).path, 'file%2Fname');
});
test('other projects, hosts, buckets, traversal and executable URLs never get re-signed', () => {
  for (const value of ['https://evil.test/storage/v1/object/public/issue-attachments/a', '//evil.test/a', 'javascript:alert(1)', '../secret', 'a/../secret', 'a\\b', 'a\u0000b', `${project}/storage/v1/object/public/other/a`]) {
    assert.throws(() => resolvePrivateAttachmentPath('issue-attachments',value,project));
  }
  assert.throws(() => resolvePrivateAttachmentPath('task-attachments', old, project), /mismatch/);
});
function storageHarness() {
  const calls = [], listeners = new Set();
  let fail = false;
  const supabase = {
    from() { throw new Error('Display must never mutate persisted records'); },
    auth:{onAuthStateChange:callback => {listeners.add(callback);return {data:{subscription:{unsubscribe:() => listeners.delete(callback)}}};}},
    storage:{from:bucket => ({
      async createSignedUrl(objectPath,seconds,options) {calls.push({bucket,path:objectPath,seconds,options});return fail ? {error:new Error('denied')} : {data:{signedUrl:`${project}/storage/v1/object/sign/${bucket}/${encodeURI(objectPath)}?token=fresh`},error:null};},
    })},
  };
  return {supabase,calls,listeners,fail:() => {fail=true;}};
}
test('private preview uses only scoped short-lived signing and rejects denial without public fallback', async () => {
  const h=storageHarness();
  const api=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project}}})('src/lib/privateAttachments.ts');
  assert.match(await api.signedAttachmentUrl('issue-attachments',old), /object\/sign\/issue-attachments/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{bucket:'issue-attachments',path:'issue/inline/old image.png',seconds:300});
  h.fail();
  await assert.rejects(api.signedAttachmentUrl('issue-attachments',old),/denied/);
  await assert.rejects(api.signedAttachmentUrl('issue-attachments','https://evil.test/a'),/Invalid/);
  assert.equal(h.calls.length,2);
});
test('rich-text renderer preserves original data and signs embedded historical images/links only in display', async () => {
  const dom=new JSDOM(''); const h=storageHarness();
  const DOMPurify=require('dompurify')(dom.window);
  const html=`<p>原有工作紀錄</p><img src="${old}" alt="原圖"><a href="${old}">歷史附件</a>`;
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project},dompurify:{__esModule:true,default:DOMPurify}},globals:{DOMParser:dom.window.DOMParser,queueMicrotask}});
  const Component=load('src/components/attachments/PrivateAttachmentHtml.tsx').PrivateAttachmentHtml;
  let tree;
  await act(async()=>{tree=create(React.createElement(Component,{html}));}); await flush();
  const rendered=tree.root.findByType('div').props.dangerouslySetInnerHTML.__html;
  assert.match(rendered,/原有工作紀錄/);assert.match(rendered,/object\/sign\/issue-attachments/);assert.doesNotMatch(rendered,/object\/public/);
  assert.equal(h.calls.length,1,'duplicate image/link signs only once per render');
  assert.match(html,/object\/public/);assert.doesNotMatch(html,/token=fresh/,'caller content must not change');
  await act(async()=>{for(const listener of h.listeners) listener('SIGNED_OUT');});await flush();
  assert.doesNotMatch(tree.root.findByType('div').props.dangerouslySetInnerHTML.__html,/token=fresh/);
  await act(async()=>tree.unmount());dom.window.close();
});
test('editor node view displays authorized image without changing durable node attrs and cleans up on destroy', async () => {
  const dom=new JSDOM('');const h=storageHarness();
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project}},globals:{document:dom.window.document,queueMicrotask}});
  const extension=load('src/components/attachments/privateAttachmentImageExtension.ts').PrivateAttachmentEditorImage;
  const type={name:'image'};const node={type,attrs:{src:old,alt:'原圖'}};
  const view=extension.config.addNodeView.call(extension)({node,HTMLAttributes:{class:'existing-image'}});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(view.dom.src,/object\/sign/);assert.equal(node.attrs.src,old);assert.equal(view.dom.className,'existing-image');
  assert.equal(view.dom.getAttribute('data-attachment-reference'),old);
  assert.equal(view.ignoreMutation({type:'attributes'}),true,'display mutations must not enter document history');
  const external={type,attrs:{src:'https://example.test/outside.png',alt:'external'}};
  assert.equal(view.update(external),true);assert.equal(view.dom.src,external.attrs.src);
  view.destroy();assert.equal(h.listeners.size,0);dom.window.close();
});
test('late URL responses cannot replace a newer image or survive sign-out', async () => {
  const a=deferred(),b=deferred();let authCallback;
  const signed=(_,value)=>value==='old.png'?a.promise:b.promise;
  const load=loader({mocks:{'@/lib/privateAttachments':{ATTACHMENT_REFRESH_MS:240000,signedAttachmentUrl:signed},'@/integrations/supabase/client':{supabase:{auth:{onAuthStateChange:callback=>{authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}}}}},globals:{queueMicrotask}});
  const hook=load('src/components/attachments/usePrivateAttachmentUrl.ts').usePrivateAttachmentUrl;
  function Probe({file}) {const state=hook('issue-attachments',file);return React.createElement('span',{'data-url':state.url});}
  let tree;await act(async()=>{tree=create(React.createElement(Probe,{file:'old.png'}));});
  await act(async()=>tree.update(React.createElement(Probe,{file:'new.png'})));
  await act(async()=>{a.resolve('https://signed/old');});assert.equal(tree.root.findByType('span').props['data-url'],'');
  await act(async()=>{b.resolve('https://signed/new');});assert.equal(tree.root.findByType('span').props['data-url'],'https://signed/new');
  await act(async()=>authCallback('SIGNED_OUT'));assert.equal(tree.root.findByType('span').props['data-url'],'');
  await act(async()=>tree.unmount());
});
test('upload persistence retains durable references; no signed URL is written to an issue or tool record', () => {
  for (const file of ['src/components/issues/issueInlineImages.ts','src/components/tools/FileUploadDialog.tsx']) {
    const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/createSignedUrl/);
    assert.match(source,/getPublicUrl/,'legacy URL remains only a durable object reference');
  }
  const editor=readFileSync('src/components/ui/rich-text-editor.tsx','utf8');
  assert.match(editor,/PrivateAttachmentEditorImage\.configure/);assert.match(editor,/editor\.getHTML\(\)/);
});

test('actual Tiptap edit, save and undo retain the durable URL instead of signed display DOM', async () => {
  const dom=new JSDOM('<div id="editor"></div>',{url:'http://localhost'});const h=storageHarness();
  const globals=['window','document','navigator','Node','HTMLElement','MutationObserver','getComputedStyle'];
  const prior=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of globals) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  let editor;
  try {
    const {Editor}=require('@tiptap/core');const StarterKit=require('@tiptap/starter-kit').default;
    const extension=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project}},globals:{document:dom.window.document,queueMicrotask}})('src/components/attachments/privateAttachmentImageExtension.ts').PrivateAttachmentEditorImage;
    editor=new Editor({element:dom.window.document.getElementById('editor'),extensions:[StarterKit,extension],content:`<p>原始文字</p><img src="${old}" alt="原圖">`});
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(editor.view.dom.querySelector('img').src,/object\/sign/);
    editor.commands.insertContentAt(1,'新編輯');
    assert.match(editor.getHTML(),/新編輯/);
    assert.match(editor.getHTML(),/object\/public\/issue-attachments/);
    assert.doesNotMatch(editor.getHTML(),/token=fresh|object\/sign/);
    assert.doesNotMatch(editor.getHTML(),/data-attachment-reference/,'display metadata must not enter saved HTML');
    editor.commands.undo();
    assert.doesNotMatch(editor.getHTML(),/新編輯|token=fresh/);
    assert.match(editor.getHTML(),/原始文字/);
    editor.commands.redo();
    assert.match(editor.getHTML(),/新編輯/);
    assert.doesNotMatch(editor.getHTML(),/token=fresh|object\/sign/);
  } finally {
    editor?.destroy();
    for(const [key,descriptor] of prior) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    dom.window.close();
  }
});

test('denied rich-text access removes historical public links without erasing the source', async () => {
  const dom=new JSDOM('');const h=storageHarness();h.fail();
  const original=`<p>保留文字</p><img src="${old}" alt="保留原圖"><a href="${old}">原附件</a>`;
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project},dompurify:{__esModule:true,default:require('dompurify')(dom.window)}},globals:{DOMParser:dom.window.DOMParser,queueMicrotask}});
  const Component=load('src/components/attachments/PrivateAttachmentHtml.tsx').PrivateAttachmentHtml;
  let tree;await act(async()=>{tree=create(React.createElement(Component,{html:original}));});await flush();
  const rendered=tree.root.findByType('div').props.dangerouslySetInnerHTML.__html;
  assert.match(rendered,/保留文字/);assert.match(rendered,/附件無法載入/);assert.doesNotMatch(rendered,/object\/public|token=fresh/);
  assert.match(original,/object\/public/);
  await act(async()=>tree.unmount());dom.window.close();
});

test('authenticated download button retains the compact filename presentation', () => {
  const component=readFileSync('src/components/maintenance/MaintenanceAttachments.tsx','utf8');
  const css=readFileSync('src/components/maintenance/maintenance.css','utf8');
  assert.match(component,/className="mf-attachment-download"/);
  assert.match(css,/\.mf-attachment-download \{[^}]*overflow:hidden;white-space:nowrap;text-overflow:ellipsis;/);
});

test('lightbox keeps a durable reference and refreshes only while a real session is present', async () => {
  const h=storageHarness();let tick;
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project}},globals:{queueMicrotask,setInterval:callback=>{tick=callback;return 1;},clearInterval(){}}});
  const usePreview=load('src/components/attachments/useAttachmentPreviewUrl.ts').useAttachmentPreviewUrl;
  function Preview({source}) {return React.createElement('span',{'data-url':usePreview(source)});}
  let tree;await act(async()=>{tree=create(React.createElement(Preview,{source:old}));});await flush();
  assert.match(tree.root.findByType('span').props['data-url'],/object\/sign/);
  await act(async()=>tick());assert.equal(h.calls.length,2,'opened preview refreshes before expiry');
  await act(async()=>{for(const listener of h.listeners)listener('SIGNED_OUT',null);});
  await act(async()=>tick());assert.equal(tree.root.findByType('span').props['data-url'],'');assert.equal(h.calls.length,2);
  await act(async()=>tree.update(React.createElement(Preview,{source:old.replace('old%20image','new%20image')})));
  await act(async()=>{for(const listener of h.listeners)listener('TOKEN_REFRESHED',null);});
  await act(async()=>tick());assert.equal(h.calls.length,2,'new source and sessionless events cannot restore a signed-out preview');
  await act(async()=>{for(const listener of h.listeners)listener('SIGNED_IN',{user:{id:'fixture'}});});await flush();
  assert.match(tree.root.findByType('span').props['data-url'],/new%20image/);assert.equal(h.calls.length,3);
  await act(async()=>tree.update(React.createElement(Preview,{source:'data:image/png;base64,fixture'})));
  assert.equal(tree.root.findByType('span').props['data-url'],'data:image/png;base64,fixture');
  await act(async()=>tree.unmount());
  const editor=readFileSync('src/components/ui/rich-text-editor.tsx','utf8');
  assert.match(editor,/getAttribute\('data-attachment-reference'\)/);
  assert.match(editor,/useAttachmentPreviewUrl\(lightboxImage\)/);
  assert.match(editor,/slides=\{lightboxSource \? \[\{ src: lightboxSource \}\]/);
});

test('rich-text timers and content updates cannot restore signed URLs after sign-out', async () => {
  const dom=new JSDOM('');const h=storageHarness();let tick;
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project},dompurify:{__esModule:true,default:require('dompurify')(dom.window)}},globals:{DOMParser:dom.window.DOMParser,queueMicrotask,setInterval:callback=>{tick=callback;return 1;},clearInterval(){}}});
  const Component=load('src/components/attachments/PrivateAttachmentHtml.tsx').PrivateAttachmentHtml;
  let tree;const html=`<p>原文</p><img src="${old}">`;
  await act(async()=>{tree=create(React.createElement(Component,{html}));});await flush();assert.equal(h.calls.length,1);
  await act(async()=>{for(const listener of h.listeners)listener('SIGNED_OUT',null);});await flush();
  await act(async()=>tick());
  await act(async()=>tree.update(React.createElement(Component,{html:html.replace('原文','新文字')})));await flush();
  await act(async()=>tick());assert.equal(h.calls.length,1);
  assert.doesNotMatch(tree.root.findByType('div').props.dangerouslySetInnerHTML.__html,/token=fresh/);
  await act(async()=>{for(const listener of h.listeners)listener('SIGNED_IN',{user:{id:'fixture'}});});await flush();
  assert.equal(h.calls.length,2);assert.match(tree.root.findByType('div').props.dangerouslySetInnerHTML.__html,/token=fresh/);
  await act(async()=>tree.unmount());dom.window.close();
});

test('editor NodeView timers and node updates cannot restore a signed-out image', async () => {
  const dom=new JSDOM('');const h=storageHarness();let tick;
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:h.supabase,SUPABASE_URL:project}},globals:{document:dom.window.document,queueMicrotask,setInterval:callback=>{tick=callback;return 1;},clearInterval(){}}});
  const extension=load('src/components/attachments/privateAttachmentImageExtension.ts').PrivateAttachmentEditorImage;
  const type={name:'image'};const node={type,attrs:{src:old}};
  const view=extension.config.addNodeView.call(extension)({node,HTMLAttributes:{}});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,1);
  for(const listener of h.listeners)listener('SIGNED_OUT',null);
  await new Promise(resolve=>setTimeout(resolve,5));tick();view.update({...node,attrs:{src:old,alt:'原圖'}});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,1);assert.equal(view.dom.getAttribute('src'),null);
  for(const listener of h.listeners)listener('TOKEN_REFRESHED',null);
  await new Promise(resolve=>setTimeout(resolve,5));tick();assert.equal(h.calls.length,1);
  for(const listener of h.listeners)listener('SIGNED_IN',{user:{id:'fixture'}});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,2);assert.match(view.dom.src,/object\/sign/);
  assert.equal(view.dom.getAttribute('data-attachment-reference'),old);assert.equal(node.attrs.src,old);
  view.destroy();dom.window.close();
});
