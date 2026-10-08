const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, child, deferred, browser, database, loader, flush } = require('./support/renderHarness.cjs');
const record = { id:'key', key_name:'Test Gemini', api_key:'fake-key', permissions:{metadata:{provider:'gemini',model:'gemini-3.8-flash',baseUrl:'https://provider.invalid/v1beta'}}, is_active:true, expires_at:null, last_used_at:null, usage_count:0 };
const target = (model, key = record) => ({id:`${key.id}::${model}`, model, record:key});
const targets = ['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-2.5-flash'].map(model => target(model));
const answer = () => new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Recovered answer'}]}}]}),{status:200});
const text = root => JSON.stringify(root.toJSON());
async function fixture(fetch, available = targets, win = browser(), options = {}) {
  const rpcCalls = [];
  const db = database(() => ({data:[],error:null}));
  db.rpc = (name,args) => {
    rpcCalls.push([name,args]);
    if (options.rpc && name === 'search_maintenance_knowledge') return options.rpc(name,args);
    return {abortSignal(){return Promise.resolve({data:null,error:null});},then(ok,no){return Promise.resolve({data:null,error:null}).then(ok,no);}};
  };
  const load = loader({window:win,mocks:{
    '@/integrations/supabase/client':{supabase:db}, '@/components/auth/UserContext':{useUser:()=>({user:{userId:'qa'}})},
    'sonner':{toast:{success(){},error(){},info(){}}}, './AiQuotaStatus':{AiQuotaStatus:child}, './MarkdownMessage':{MarkdownMessage:child},
    '@/components/ui/textarea':{Textarea:React.forwardRef((props,ref)=>React.createElement('stub',{...props,ref}))},
    './MaintenanceCitationList':{MaintenanceCitationList:child}, './MaintenanceSourceSelector':{MaintenanceSourceSelector:child}, './pptxAttachment':{isPptxFile:()=>false},
  },globals:{fetch,Response,Error,TextEncoder,TextDecoder,requestAnimationFrame:callback=>setTimeout(callback,0), ...options.globals}});
  const {ApiChatConsole}=load('src/components/api-management/ApiChatConsole.tsx');
  let root;
  await act(async()=>{root=create(React.createElement(ApiChatConsole,{mode:'chat-only',selectedApiKey:record,selectedModel:'gemini-3.8-flash',selectedApiKeyTargetId:targets[0].id,availableApiKeyTargets:available,...options.props}));});
  await flush();
  const input = () => root.root.find(node=>node.props['aria-label']==='輸入查詢內容');
  const send = () => root.root.find(node=>node.type==='stub'&&node.props['aria-label']==='送出查詢');
  const draft = async value => {await act(async()=>{input().props.onChange({target:{value}});});};
  return {root,rpcCalls,win,draft,send};
}

test('busy model changes once within the same key and route, double click cannot duplicate a request, subsequent sends honor cooldown', async () => {
  const first=deferred(), requests=[];
  const other={...record,id:'other',api_key:'other-key'};
  const route={...record,id:'route',permissions:{metadata:{...record.permissions.metadata,baseUrl:'https://different.invalid'}}};
  const available=[targets[0],target('gemini-3.8-flash',other),target('gemini-3.5-flash-lite',route),target('gemini-image'),...targets.slice(1)];
  const f=await fixture(async(url,init)=>{requests.push([url,JSON.parse(init.body)]);return requests.length===1?first.promise:answer();},available);
  try {
    await f.draft('Keep this question');
    await act(async()=>{f.send().props.onClick();f.send().props.onClick();});
    assert.equal(requests.length,1);
    assert.equal(f.send().props.disabled,true);
    assert.match(text(f.root),/正在查詢 gemini-3.8-flash/);
    await act(async()=>{first.resolve(new Response(JSON.stringify({error:{message:'overloaded'}}),{status:503}));});
    await flush();
    assert.equal(requests.length,2);
    assert.match(requests[1][0],/^https:\/\/provider.invalid\/v1beta\/models\/gemini-3.5-flash-lite/);
    assert.match(text(f.root),/已自動改用 gemini-3.5-flash-lite/);
    assert.match(text(f.root),/Recovered answer/);
    assert.match(requests[1][1].contents[0].parts[0].text,/Keep this question/);
    await f.draft('Next question');
    await act(async()=>{f.send().props.onClick();});await flush();
    assert.equal(requests.length,3);
    assert.match(requests[2][0],/gemini-3.5-flash-lite/);
    assert.match(f.win.sessionStorage.getItem('ai-model-cooldowns-v1'),/gemini-3.8-flash/);
    assert.equal(f.rpcCalls.filter(([name])=>name==='start_ai_model_usage_attempt').length,3);
  } finally {await act(async()=>f.root.unmount());}
});

test('a failed response stays readable to the user and is excluded from subsequent provider context',async()=>{
  const requests=[];
  const f=await fixture(async(url,init)=>{requests.push(JSON.parse(init.body));return requests.length===1?new Response(JSON.stringify({error:{message:'key expired'}}),{status:403}):answer();});
  try {
    await f.draft('First question');await act(async()=>{f.send().props.onClick();});await flush();
    assert.equal(requests.length,1);
    assert.match(text(f.root),/金鑰無效/);
    assert.match(text(f.root),/First question/);
    await f.draft('Second question');await act(async()=>{f.send().props.onClick();});await flush();
    assert.equal(requests.length,2);
    assert.doesNotMatch(JSON.stringify(requests[1].contents),/API 呼叫失敗|金鑰無效/);
    assert.match(JSON.stringify(requests[1].contents),/First question/);
    assert.match(JSON.stringify(requests[1].contents),/Second question/);
  } finally {await act(async()=>f.root.unmount());}
});

test('stalled maintenance retrieval aborts, releases sending and never calls an ungrounded AI fallback',async()=>{
  let providerCalls=0, signal;
  const pending=deferred();
  const f=await fixture(async()=>{providerCalls++;return answer();},targets,browser(),{
    props:{maintenanceProjects:[{id:'project',name:'Test project'}],currentMaintenanceProjectId:'project'},
    rpc:()=>({abortSignal(value){signal=value;return pending.promise;}}),
    globals:{setTimeout:(callback,ms)=>setTimeout(callback,ms===15_000?25:ms)},
  });
  try {
    await act(async()=>{f.root.root.find(node=>node.type==='stub'&&node.props.onEnabledChange).props.onEnabledChange(true);});
    await f.draft('Search maintenance');
    await act(async()=>{f.send().props.onClick();});await flush(40);
    assert.equal(signal.aborted,true);
    assert.equal(providerCalls,0);
    assert.match(text(f.root),/維修資料檢索失敗/);
    await f.draft('Retained next question');
    assert.equal(f.send().props.disabled,false);
    pending.resolve({data:[],error:null});await flush();
    assert.equal(providerCalls,0);
  } finally {await act(async()=>f.root.unmount());}
});

test('PDF upload normalizes Windows MIME, blocks early send, retains valid files and reaches the provider intact',async()=>{
  const reading=deferred(), requests=[];
  class Reader {
    readAsDataURL(file) { void reading.promise.then(async()=>{
      this.result=`data:application/octet-stream;base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
      this.onload();
    }); }
    abort(){this.onabort?.();}
  }
  const f=await fixture(async(url,init)=>{requests.push(JSON.parse(init.body));return answer();},targets,browser(),{globals:{FileReader:Reader}});
  try {
    await f.draft('請分析 PDF');
    const valid=new File(['%PDF-1.7\nSample PDF\n%%EOF'],'中文報告.PDF',{type:''});
    const invalid=new File(['renamed text'],'不是PDF.pdf',{type:'application/pdf'});
    const fileInput=f.root.root.find(node=>node.type==='input'&&node.props.type==='file');
    await act(async()=>{fileInput.props.onChange({currentTarget:{files:[valid,invalid],value:'files'}});});
    await flush();
    assert.equal(f.send().props.disabled,true);
    assert.match(text(f.root),/正在讀取附件/);
    await act(async()=>{f.send().props.onClick();});
    assert.equal(requests.length,0,'keyboard/double click cannot send before PDF has finished reading');
    await act(async()=>{reading.resolve();});await flush();
    assert.match(text(f.root),/中文報告.PDF/);
    assert.equal(f.send().props.disabled,false);
    await act(async()=>{f.send().props.onClick();});await flush();
    assert.equal(requests.length,1);
    const document=requests[0].contents[0].parts.find(part=>part.inlineData)?.inlineData;
    assert.equal(document.mimeType,'application/pdf');
    assert.equal(Buffer.from(document.data,'base64').toString(),'%PDF-1.7\nSample PDF\n%%EOF');
    assert.match(text(f.root),/Recovered answer/);
  } finally {await act(async()=>f.root.unmount());}
});

test('stalled PDF reading aborts and restores sending instead of locking the composer',async()=>{
  let aborted=false, calls=0;
  class Reader { readAsDataURL(){} abort(){aborted=true;this.onabort?.();} }
  const f=await fixture(async()=>{calls++;return answer();},targets,browser(),{globals:{FileReader:Reader,setTimeout:(fn,ms)=>setTimeout(fn,ms===30_000?25:ms)}});
  try {
    await f.draft('保留原來的問題');
    const file=new File(['%PDF-1.7\n%%EOF'],'卡住.pdf');
    await act(async()=>{f.root.root.find(node=>node.type==='input'&&node.props.type==='file').props.onChange({currentTarget:{files:[file],value:'file'}});});
    await flush(40);
    assert.equal(aborted,true);
    assert.equal(f.send().props.disabled,false);
    assert.equal(calls,0);
    assert.match(text(f.root),/保留原來的問題/);
  } finally {await act(async()=>f.root.unmount());}
});

test('PDF finishing after a model target starts a new conversation cannot attach to the new conversation',async()=>{
  const reading=deferred();
  class Reader { readAsDataURL(){void reading.promise.then(()=>{this.result='data:application/octet-stream;base64,JVBERi0xLjc=';this.onload();});} abort(){this.onabort?.();} }
  const f=await fixture(answer,targets,browser(),{globals:{FileReader:Reader}});
  try {
    await act(async()=>{f.root.root.find(node=>node.type==='input'&&node.props.type==='file').props.onChange({currentTarget:{files:[new File(['%PDF-1.7\n%%EOF'],'舊對話.pdf')],value:'file'}});});
    await flush();
    await act(async()=>{const component=f.root.root;f.root.update(React.createElement(component.type,{...component.props,selectedApiKeyTargetId:targets[1].id,selectedModel:targets[1].model}));});
    await flush();
    await act(async()=>{reading.resolve();});await flush();
    assert.doesNotMatch(text(f.root),/舊對話.pdf/);
  } finally {await act(async()=>f.root.unmount());}
});
