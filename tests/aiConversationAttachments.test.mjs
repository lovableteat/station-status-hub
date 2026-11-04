import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loader}=require('./support/renderHarness.cjs');

function fixture(failUpload=0) {
  const files=new Map();let uploads=0;
  const bucket={
    async upload(path,blob){if(++uploads===failUpload)return {error:new Error('offline')};files.set(path,blob);return {error:null};},
    async download(path){return {data:files.get(path),error:files.has(path)?null:new Error('missing')};},
    async remove(paths){paths.forEach(path=>files.delete(path));return {error:null};},
  };
  const load=loader({mocks:{'@/integrations/supabase/client':{supabase:{storage:{from:()=>bucket}}}},globals:{Blob,Uint8Array,atob,btoa}});
  return {...load('src/components/api-management/aiConversationAttachments.ts'),files,get uploads(){return uploads;}};
}
const attachment={id:'test-file',name:'slides.pptx',kind:'file',mimeType:'text/plain',size:20,inlineData:Buffer.from('slide text 731').toString('base64'),supplementalImages:[{name:'slide.png',mimeType:'image/png',data:'cG5n'}]};
const current=()=>{};

test('private attachment metadata restores original text and supplemental image bytes without re-upload',async()=>{
  const f=fixture();const saved=await f.persistChatAttachment(attachment,'account-a',current);
  assert.equal(f.uploads,2);assert.equal(f.files.size,2);
  const json=JSON.stringify(f.serializeChatAttachment(saved));
  assert.doesNotMatch(json,/cG5n|inlineData|slide text/);
  const parsed=f.parseChatAttachment(JSON.parse(json),'account-a');
  assert.ok(parsed);assert.equal(parsed.inlineData,'');
  const hydrated=await f.hydrateChatAttachment(parsed,'account-a',current);
  assert.equal(hydrated.inlineData,attachment.inlineData);
  assert.equal(hydrated.supplementalImages[0].data,'cG5n');
  await f.persistChatAttachment(hydrated,'account-a',current);assert.equal(f.uploads,2);
  assert.equal(f.parseChatAttachment(JSON.parse(json),'account-b'),null);
  assert.equal(f.parseChatAttachment({...JSON.parse(json),storagePath:'account-a/../content'},'account-a'),null);
});

test('missing history files and account changes stop attachment restoration',async()=>{
  const f=fixture();const saved=await f.persistChatAttachment({...attachment,supplementalImages:[]},'account-a',current);
  const parsed=f.parseChatAttachment(f.serializeChatAttachment(saved),'account-a');
  await assert.rejects(f.hydrateChatAttachment(parsed,'account-b',current),/不屬於目前帳號/);
  f.files.clear();await assert.rejects(f.hydrateChatAttachment(parsed,'account-a',current),/沒有忽略附件/);
  await assert.rejects(f.hydrateChatAttachment(saved,'account-a',()=>{throw new Error('switched');}),/switched/);
});

test('a partial upload failure cleans its new private files and keeps the original input reusable',async()=>{
  const f=fixture(2);
  await assert.rejects(f.persistChatAttachment(attachment,'account-a',current),/尚未送出 API/);
  assert.equal(f.files.size,0);assert.equal(attachment.storagePath,undefined);
  assert.equal(attachment.inlineData,Buffer.from('slide text 731').toString('base64'));
});
