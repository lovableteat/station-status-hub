import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {loader, deferred} = createRequire(import.meta.url)('../../../tests/support/renderHarness.cjs');
const target = {officialVersionId:'official',workingVersionId:'working',officialPage:2,workingPage:3};
const analysis = () => ({...target,summary:'本頁 Net 名稱有差異，連接性需核對原生 netlist。',checks:[
  {category:'connectivity',state:'unverifiable',note:'缺少原生 netlist，不能證明電氣連通'},
  {category:'net-name',state:'possible-issue',note:'P/N 標籤不一致'},
  {category:'label-name',state:'no-visible-issue',note:'可見接腳名稱一致'}],findings:[{category:'net-name',priority:'high',title:'差分標籤 P/N 不一致',location:'右上 CON2A 接腳 A1',officialEvidence:'PCIE_RX_P',workingEvidence:'PCIE_RX_N',suggestion:'核對設計意圖與原生 netlist'}]});
const service = () => loader()('src/components/circuit-changes/circuitPdfAiReview.ts');
function report() {
  const k=service();return {version:1,id:'11111111-1111-4111-8111-111111111111',key:k.circuitPdfAiReviewKey(target),...target,officialName:'官方.pdf',workingName:'工作.pdf',createdAt:'2026-11-09T10:00:00Z',updatedAt:'2026-11-09T10:00:00Z',generatedBy:'工程師',modelLabel:'QA model',...k.parseCircuitPdfAiAnalysis(JSON.stringify(analysis()),target)};
}

test('each analysis is bound to exact official/working versions and page mapping',()=>{
  const k=service(), result=k.parseCircuitPdfAiAnalysis('```json\n'+JSON.stringify(analysis())+'\n```',target);
  assert.equal(result.checks.length,3);assert.equal(result.findings[0].decision,'pending');
  for(const patch of[{officialVersionId:'working',workingVersionId:'official'},{workingPage:4},{officialPage:1}]) assert.throws(()=>k.parseCircuitPdfAiAnalysis(JSON.stringify({...analysis(),...patch}),target),/版本或頁碼/);
  assert.notEqual(k.circuitPdfAiReviewKey(target),k.circuitPdfAiReviewKey({...target,workingPage:4}));
  assert.notEqual(k.circuitPdfAiReviewKey({...target,officialVersionId:'a:b',workingVersionId:'c'}),k.circuitPdfAiReviewKey({...target,officialVersionId:'a',workingVersionId:'b:c'}));
});

test('missing categories, duplicate checks and unsupported/ungrounded findings cannot become success',()=>{
  const k=service();
  for(const value of[
    {...analysis(),checks:analysis().checks.slice(1)},
    {...analysis(),checks:[analysis().checks[0],analysis().checks[0],analysis().checks[2]]},
    {...analysis(),findings:[]},
    {...analysis(),checks:analysis().checks.map(check=>check.category==='net-name'?{...check,state:'no-visible-issue'}:check)},
    {...analysis(),findings:[{...analysis().findings[0],officialEvidence:''}]},
    {...analysis(),findings:[{...analysis().findings[0],category:'erc-pass'}]},
    {...analysis(),findings:Array(41).fill(analysis().findings[0])},
  ]) assert.throws(()=>k.parseCircuitPdfAiAnalysis(JSON.stringify(value),target));
  const empty={...analysis(),checks:analysis().checks.map(c=>({...c,state:'unverifiable'})),findings:[]};
  assert.equal(k.parseCircuitPdfAiAnalysis(JSON.stringify(empty),target).findings.length,0);
});

test('stored reports retain human decisions and reject malformed provenance or unbounded notes',()=>{
  const k=service(), stored=report();stored.findings[0]={...stored.findings[0],decision:'confirmed',reviewNote:'已核對 netlist',reviewedBy:'RD',reviewedAt:'2026-11-09T10:10:00Z'};stored.updatedAt='2026-11-09T10:10:00Z';
  assert.equal(k.normalizeCircuitPdfAiReviewReport(stored).findings[0].reviewNote,'已核對 netlist');
  for(const patch of[{id:'not-a-uuid'},{key:'wrong'},{createdAt:'bad'},{updatedAt:'2026-01-01'},{officialPage:3001},{officialVersionId:'working'}]) assert.equal(k.normalizeCircuitPdfAiReviewReport({...stored,...patch}),null);
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...stored,findings:[{...stored.findings[0],reviewNote:'x'.repeat(2001)}]}),null);
  const last={...stored,officialPage:3000,workingPage:3000};last.key=k.circuitPdfAiReviewKey(last);assert.ok(k.normalizeCircuitPdfAiReviewReport(last));
});

function adapter(payloadFactory=()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(analysis())}}]}), {status=200, headers=new Headers()}={}) {
  const sent=[],renders=[];
  const canvas={width:0,height:0,toBlob(done){done(new Blob(['PNG'],{type:'image/png'}));}};
  class Reader {readAsDataURL(){this.result='data:image/png;base64,UE5H';Promise.resolve().then(()=>this.onload());}}
  const k=loader({globals:{document:{createElement:()=>({...canvas})},FileReader:Reader},mocks:{
    '../api-management/apiKeyHelpers':{normalizeApiKeyPermissions:()=>({read:true,metadata:{provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-5.4'}})},
    '../api-management/aiUsageTelemetry':{trackedProviderFetch:async request=>{sent.push(request);return{ok:status>=200&&status<300,status,headers,json:async()=>payloadFactory()};}},
  }})('src/components/circuit-changes/circuitPdfAiReview.ts');
  const pdf={numPages:3000,getPage:async page=>({getViewport:({scale})=>({width:1000*scale,height:700*scale}),render:options=>{renders.push({page,width:options.canvas.width,height:options.canvas.height});return{promise:Promise.resolve(),cancel(){}};},getTextContent:async()=>({items:[{str:'PCIE_RX_P',transform:[1,0,0,1,10,20]}]})})};
  const input={official:{id:'official',name:'官方.pdf',page:2,pdf},working:{id:'working',name:'工作.pdf',page:3,pdf},model:{id:'model-key::gpt-5.4',label:'QA GPT',record:{id:'model-key',api_key:'qa-test-secret',is_active:true}},userName:'RD 工程師',signal:new AbortController().signal};
  return {k,input,sent,renders};
}

test('real provider adapter sends both full-page images at high detail and coordinate text with usage tracking',async()=>{
  const {k,input,sent,renders}=adapter(), result=await k.runCircuitPdfAiReview(input);
  assert.equal(sent.length,1);assert.equal(sent[0].apiKeyId,'model-key');assert.equal(sent[0].source,'ai-chat');
  const body=JSON.parse(sent[0].init.body), images=body.messages.flatMap(message=>message.content).filter(part=>part.type==='image_url');
  assert.equal(images.length,2);assert.ok(images.every(image=>image.image_url.detail==='high'));
  assert.match(JSON.stringify(body),/官方.pdf/);assert.match(JSON.stringify(body),/工作.pdf/);assert.match(JSON.stringify(body),/PCIE_RX_P/);assert.match(JSON.stringify(body),/不得.*核准/);
  assert.deepEqual(renders.map(item=>[item.page,item.width,item.height]),[[2,4000,2800],[3,4000,2800]]);
  assert.match(result.id,/^[0-9a-f-]{36}$/);assert.equal(result.createdAt,result.updatedAt);assert.equal(result.generatedBy,'RD 工程師');assert.equal(result.findings[0].decision,'pending');
});

test('provider truncation/refusal, invalid target and cancellation never return a report',async()=>{
  for(const payload of[{choices:[{finish_reason:'length',message:{content:JSON.stringify(analysis())}}]},{choices:[{finish_reason:'stop',message:{refusal:'cannot',content:''}}]},{choices:[{finish_reason:'stop',message:{content:'{}'}}]}]) {
    const {k,input}=adapter(()=>payload);await assert.rejects(k.runCircuitPdfAiReview(input));
  }
  const {k,input,sent}=adapter(); const controller=new AbortController();controller.abort();await assert.rejects(k.runCircuitPdfAiReview({...input,signal:controller.signal}));assert.equal(sent.length,0);
  await assert.rejects(k.runCircuitPdfAiReview({...input,working:{...input.working,id:'official'}}),/不同/);
  await assert.rejects(k.runCircuitPdfAiReview({...input,working:{...input.working,page:3001}}),/有效/);
});

test('a non-JSON rate limit retains Retry-After and records the actual attempt',async()=>{
  const {k,input,sent}=adapter(()=>{throw new SyntaxError('non-JSON gateway response');}, {status:429,headers:new Headers({'Retry-After':'2'})});
  await assert.rejects(k.runCircuitPdfAiReview({...input,attemptNumber:2}), error=>error.kind==='minute-quota'&&error.retryAfterMs===2000);
  assert.equal(sent[0].attemptNumber,2);
  await assert.rejects(k.runCircuitPdfAiReview({...input,model:{...input.model,record:{...input.model.record,is_active:false}}}), error=>error.kind==='auth');
  assert.equal(sent.length,1);
});
