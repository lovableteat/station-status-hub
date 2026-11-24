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

// 2026-11-19: a paid answer with a small flaw is repaired towards "needs a person" instead of being thrown away.
test('a flawed answer is repaired towards caution and never becomes a clean result',()=>{
  const k=service(), parse=value=>k.parseCircuitPdfAiAnalysis(JSON.stringify(value),target), state=(result,category)=>result.checks.find(check=>check.category===category).state;
  const missing=parse({...analysis(),checks:analysis().checks.slice(1)});
  assert.equal(missing.checks.length,3);assert.equal(state(missing,'connectivity'),'unverifiable');
  const repeated=parse({...analysis(),checks:[analysis().checks[0],analysis().checks[0],analysis().checks[2]]});
  assert.equal(state(repeated,'net-name'),'unverifiable','a check the model never answered is not assumed clean');
  const unlocated=parse({...analysis(),findings:[]});
  assert.equal(state(unlocated,'net-name'),'unverifiable');assert.match(unlocated.checks.find(check=>check.category==='net-name').note,/沒有列出具體位置/);
  const contradicted=parse({...analysis(),checks:analysis().checks.map(check=>check.category==='net-name'?{...check,state:'no-visible-issue'}:check)});
  assert.equal(state(contradicted,'net-name'),'possible-issue','findings under a check marked clean make it 有待核對');
  const noEvidence=parse({...analysis(),findings:[{...analysis().findings[0],officialEvidence:''}]});
  assert.equal(noEvidence.findings.length,1);assert.match(noEvidence.findings[0].officialEvidence,/沒有提供/);
  const unknownKind=parse({...analysis(),findings:[{...analysis().findings[0],category:'erc-pass'}]});
  assert.equal(unknownKind.findings.length,0);assert.match(unknownKind.summary,/1 筆 AI 回覆/);assert.equal(state(unknownKind,'net-name'),'unverifiable');
  const many=parse({...analysis(),findings:Array(41).fill(analysis().findings[0])});
  assert.equal(many.findings.length,40);assert.match(many.summary,/1 筆 AI 回覆/);
  for(const hopeless of ['{}','{"summary":"只有摘要"}','[]','不是 JSON']) assert.throws(()=>k.parseCircuitPdfAiAnalysis(hopeless,target));
  const empty={...analysis(),checks:analysis().checks.map(c=>({...c,state:'unverifiable'})),findings:[]};
  assert.equal(parse(empty).findings.length,0);
  // A stored report is still held to the strict rules: nothing is repaired on the way back in.
  const stored={...report(),checks:report().checks.map(check=>check.category==='net-name'?{...check,state:'no-visible-issue'}:check)};
  assert.equal(k.normalizeCircuitPdfAiReviewReport(stored),null);
});

test('stored reports retain human decisions and reject malformed provenance or unbounded notes',()=>{
  const k=service(), stored=report();stored.findings[0]={...stored.findings[0],decision:'confirmed',reviewNote:'已核對 netlist',reviewedBy:'RD',reviewedAt:'2026-11-09T10:10:00Z'};stored.updatedAt='2026-11-09T10:10:00Z';
  assert.equal(k.normalizeCircuitPdfAiReviewReport(stored).findings[0].reviewNote,'已核對 netlist');
  for(const patch of[{id:'not-a-uuid'},{key:'wrong'},{createdAt:'bad'},{updatedAt:'2026-01-01'},{officialPage:3001},{officialVersionId:'working'}]) assert.equal(k.normalizeCircuitPdfAiReviewReport({...stored,...patch}),null);
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...stored,findings:[{...stored.findings[0],reviewNote:'x'.repeat(2001)}]}),null);
  const last={...stored,officialPage:3000,workingPage:3000};last.key=k.circuitPdfAiReviewKey(last);assert.ok(k.normalizeCircuitPdfAiReviewReport(last));
});

test('annotation coordinates survive reload and invalid sides stay unlocated',()=>{
  const k=service(), value=analysis();
  const officialBox={x:.14,y:.28,width:.22,height:.11};
  const workingBox={x:.53,y:.32,width:.25,height:.09};
  value.findings=[
    {...value.findings[0],certainty:'suspected',officialBox,workingBox},
    {...value.findings[0],category:'connectivity',certainty:'unclear',officialBox:{x:.95,y:.5,width:.1,height:.12},workingBox},
    {...value.findings[0],category:'connectivity',certainty:'unclear',officialBox:null,workingBox:{...workingBox,x:'0.53'}},
  ];
  const result=k.parseCircuitPdfAiAnalysis(JSON.stringify(value),target);
  assert.equal(result.findings[0].certainty,'suspected');
  assert.deepEqual({...result.findings[0].officialBox},officialBox);
  assert.deepEqual({...result.findings[0].workingBox},workingBox);
  assert.equal(result.findings[1].certainty,'unclear');
  assert.equal(result.findings[1].officialBox??null,null);
  assert.deepEqual({...result.findings[1].workingBox},workingBox);
  assert.equal(result.findings[2].officialBox??null,null);
  assert.equal(result.findings[2].workingBox??null,null);
  const stored=JSON.parse(JSON.stringify({...report(),...result}));
  stored.findings[0].decision='confirmed';
  const reopened=k.normalizeCircuitPdfAiReviewReport(stored);
  assert.deepEqual({...reopened.findings[0].officialBox},officialBox);
  assert.deepEqual({...reopened.findings[0].workingBox},workingBox);
  assert.equal(reopened.findings[0].decision,'confirmed');
  assert.equal(reopened.findings[1].officialBox??null,null);
  const legacyFinding=k.normalizeCircuitPdfAiReviewReport(report()).findings[0];
  assert.ok(['certainty','officialBox','workingBox'].every(key=>!Object.hasOwn(legacyFinding,key)));
});

function adapter(payloadFactory=()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(analysis())}}]}), {status=200, headers=new Headers(), model='gpt-5.4'}={}) {
  const sent=[],renders=[];
  const canvas={width:0,height:0,getContext:()=>null,toBlob(done){done(new Blob(['PNG'],{type:'image/png'}));}};
  class Reader {readAsDataURL(){this.result='data:image/png;base64,UE5H';Promise.resolve().then(()=>this.onload());}}
  const k=loader({globals:{document:{createElement:()=>({...canvas})},FileReader:Reader},mocks:{
    '../api-management/apiKeyHelpers':{normalizeApiKeyPermissions:()=>({read:true,metadata:{provider:'openai',baseUrl:'https://api.openai.com/v1',model}})},
    '../api-management/aiUsageTelemetry':{trackedProviderFetch:async request=>{sent.push(request);return{ok:status>=200&&status<300,status,headers,json:async()=>payloadFactory()};}},
  }})('src/components/circuit-changes/circuitPdfAiReview.ts');
  const pdf={numPages:3000,getPage:async page=>({cleanup(){},getViewport:({scale})=>({width:1000*scale,height:700*scale,convertToViewportPoint:(x,y)=>[x*scale,(700-y)*scale]}),render:options=>{renders.push({page,width:options.canvas.width,height:options.canvas.height});return{promise:Promise.resolve(),cancel(){}};},getTextContent:async()=>({items:[{str:'PCIE_RX_P',transform:[1,0,0,1,10,20]}]})})};
  const input={official:{id:'official',name:'官方.pdf',page:2,pdf},working:{id:'working',name:'工作.pdf',page:3,pdf},model:{id:`model-key::${model}`,label:'QA GPT',record:{id:'model-key',api_key:'qa-test-secret',is_active:true}},userName:'RD 工程師',signal:new AbortController().signal};
  return {k,input,sent,renders};
}

test('real provider adapter sends both full-page images at high detail and coordinate text with usage tracking',async()=>{
  const {k,input,sent,renders}=adapter(), result=await k.runCircuitPdfAiReview(input);
  assert.equal(sent.length,1);assert.equal(sent[0].apiKeyId,'model-key');assert.equal(sent[0].source,'ai-chat');
  const body=JSON.parse(sent[0].init.body), images=body.messages.flatMap(message=>message.content).filter(part=>part.type==='image_url');
  assert.equal(images.length,2);assert.ok(images.every(image=>image.image_url.detail==='high'));
  assert.match(JSON.stringify(body),/官方.pdf/);assert.match(JSON.stringify(body),/工作.pdf/);assert.match(JSON.stringify(body),/PCIE_RX_P（x=0\.010, y=0\.971）/);assert.match(JSON.stringify(body),/不可聲稱通過電氣驗證或正式審核/);
  // Providers scale pages down to about 2048 px before a model sees them, so nothing larger is uploaded.
  assert.deepEqual(renders.map(item=>[item.page,item.width,item.height]),[[2,2048,1434],[3,2048,1434]]);
  assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.reasoning_effort,'low');
  assert.equal(result.source,'ai');
  assert.match(result.id,/^[0-9a-f-]{36}$/);assert.equal(result.createdAt,result.updatedAt);assert.equal(result.generatedBy,'RD 工程師');assert.equal(result.findings[0].decision,'pending');
});

test('selected GPT-6.2 Sol sends PDF images and tracks the exact model with the saved key',async()=>{
  const {k,input,sent}=adapter(undefined,{model:'gpt-6.2-sol'});
  await k.runCircuitPdfAiReview(input);
  const [request]=sent;
  const body=JSON.parse(request.init.body);
  assert.equal(request.url,'https://api.openai.com/v1/chat/completions');
  assert.equal(request.apiKeyId,'model-key');
  assert.equal(request.model,'gpt-6.2-sol');
  assert.equal(body.model,request.model);
  assert.equal(body.messages.flatMap(message=>message.content).filter(part=>part.type==='image_url').length,2);
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

test('token usage reported by the provider is kept on the report and survives reload',async()=>{
  const {k,input}=adapter(()=>({usage:{prompt_tokens:5200,completion_tokens:640},choices:[{finish_reason:'stop',message:{content:JSON.stringify(analysis())}}]}));
  const result=await k.runCircuitPdfAiReview(input);
  assert.deepEqual({...result.usage},{input:5200,output:640});
  const reopened=k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(result)));
  assert.deepEqual({...reopened.usage},{input:5200,output:640});assert.equal(reopened.source,'ai');
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...JSON.parse(JSON.stringify(result)),usage:{input:-1,output:2}}),null);
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...JSON.parse(JSON.stringify(result)),source:'guess'}),null);
});

const item=(str,x,y)=>({str,x,y,width:.05,height:.012});
const sameDiff={textComparable:true,graphicsComparable:true,sizeChanged:false,textChanges:[],regions:[]};
const changedDiff={textComparable:true,graphicsComparable:true,sizeChanged:false,textChanges:[{kind:'changed',before:item('PCIE_RX_P',.3,.2),after:item('PCIE_RX_N',.3,.2)}],regions:[{box:{x:.6,y:.6,width:.1,height:.02},base:false,work:true}]};
const side=(id,page)=>({id,name:`${id}.pdf`,page});

test('a page the local comparison finds the same is a complete report without any AI request',()=>{
  const k=service(), result=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:sameDiff});
  assert.equal(result.source,'local');assert.equal(result.modelLabel,'本機比對（未使用 AI）');assert.equal(result.local.identical,true);assert.equal(k.isCircuitReportIdentical(result),true);
  assert.deepEqual([...result.checks.map(check=>check.state)],['no-visible-issue','no-visible-issue','no-visible-issue']);assert.equal(result.findings.length,0);assert.match(result.summary,/沒有送 AI/);
  const reopened=k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(JSON.parse(JSON.stringify(reopened)),JSON.parse(JSON.stringify(result)),'the stored report comes back unchanged, so a later manual save matches it');
});

test('a page that differs lists every difference with its place, and each check says what was compared',()=>{
  const k=service(), result=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:changedDiff});
  assert.equal(result.local.identical,false);assert.equal(k.isCircuitReportIdentical(result),false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.findings.map(finding=>[finding.id,finding.category,finding.title]))),[['F1','net-name','字改了：PCIE_RX_P → PCIE_RX_N'],['F2','connectivity','這裡的線或符號不一樣']]);
  assert.deepEqual(Object.fromEntries(result.checks.map(check=>[check.category,check.state])),{connectivity:'possible-issue','net-name':'possible-issue','label-name':'no-visible-issue'});
  assert.match(result.summary,/有 2 個地方不一樣（字改了 1 個、線不一樣 1 處）/);
  assert.ok(k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(result))));
  const unreadable=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:{...sameDiff,textComparable:false}});
  assert.deepEqual(Object.fromEntries(unreadable.checks.map(check=>[check.category,check.state])),{connectivity:'no-visible-issue','net-name':'unverifiable','label-name':'unverifiable'});
  assert.equal(unreadable.local.identical,true,'drawings laid over each other were the same');
});

test('with the differences already known the model is shown them enlarged, and the report lists the confirmed ones first',async()=>{
  const {k,input,sent,renders}=adapter(()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...analysis(),findings:[{...analysis().findings[0],title:'A1 改接到 B1',category:'connectivity'}],checks:analysis().checks.map(check=>check.category==='net-name'?{...check,state:'unverifiable'}:check)})}}]}));
  const result=await k.runCircuitPdfAiReview({...input,local:{diff:changedDiff}});
  const body=JSON.parse(sent[0].init.body), images=body.messages.flatMap(message=>message.content).filter(part=>part.type==='image_url');
  assert.equal(images.length,6,'two whole pages and two changed areas from both versions');
  assert.match(JSON.stringify(body),/已經確定的差異/);assert.match(JSON.stringify(body),/1\. 字改了：PCIE_RX_P → PCIE_RX_N/);assert.match(JSON.stringify(body),/不要重複列出/);
  assert.equal(renders.filter(item=>item.width===2048).length,2);
  assert.deepEqual([...result.findings.map(finding=>finding.title)],['字改了：PCIE_RX_P → PCIE_RX_N','這裡的線或符號不一樣','A1 改接到 B1']);
  assert.deepEqual([...result.findings.map(finding=>finding.id)],['F1','F2','F3']);
  assert.equal(result.checks.find(check=>check.category==='net-name').state,'possible-issue','the more careful of the two answers');
  assert.match(result.summary,/^電腦比對（沒用 AI）：這一頁有 2 個地方不一樣/);assert.match(result.summary,/AI 說明：/);
  assert.equal(result.modelLabel,'QA GPT＋本機比對');assert.equal(result.source,'ai');assert.equal(result.local.changed,1);
  assert.ok(k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(result))));
});

// Review 2026-11-19.
test('options only some models take are sent only to them, and a dropped connection is not counted as an answer',async()=>{
  const body=async model=>{const {k,input,sent}=adapter();const run=k.runCircuitPdfAiReview;void run;const made=loader({globals:{document:{createElement:()=>({width:0,height:0,getContext:()=>null,toBlob(done){done(new Blob(['PNG'],{type:'image/png'}));}})},FileReader:class{readAsDataURL(){this.result='data:image/png;base64,UE5H';Promise.resolve().then(()=>this.onload());}}},mocks:{
    '../api-management/apiKeyHelpers':{normalizeApiKeyPermissions:()=>({read:true,metadata:{provider:'openai',baseUrl:'https://api.openai.com/v1',model}})},
    '../api-management/aiUsageTelemetry':{trackedProviderFetch:async request=>{sent.push(request);return{ok:true,status:200,headers:new Headers(),json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(analysis())}}]})};}},
  }})('src/components/circuit-changes/circuitPdfAiReview.ts');await made.runCircuitPdfAiReview(input);return JSON.parse(sent[0].init.body);};
  const reasoning=await body('gpt-5.4');assert.equal(reasoning.reasoning_effort,'low');assert.equal(reasoning.response_format.type,'json_schema');
  const structured=await body('gpt-4.1-mini');assert.equal(structured.reasoning_effort,undefined);assert.equal(structured.response_format.type,'json_schema');
  const older=await body('gpt-4o');assert.equal(older.reasoning_effort,undefined);assert.equal(older.response_format,undefined);assert.equal(older.max_completion_tokens,undefined);
  const dropped=loader({globals:{TextEncoder,document:{createElement:()=>({width:0,height:0,getContext:()=>null,toBlob(done){done(new Blob(['PNG'],{type:'image/png'}));}})},FileReader:class{readAsDataURL(){this.result='data:image/png;base64,UE5H';Promise.resolve().then(()=>this.onload());}}},mocks:{
    '../api-management/apiKeyHelpers':{normalizeApiKeyPermissions:()=>({read:true,metadata:{provider:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-3.5-flash'}})},
    '../api-management/aiUsageTelemetry':{trackedProviderFetch:async()=>{throw new TypeError('Failed to fetch');}},
  }})('src/components/circuit-changes/circuitPdfAiReview.ts');
  await assert.rejects(dropped.runCircuitPdfAiReview(adapter().input),error=>error.kind==='network');
  const {k:cut,input}=adapter(()=>({choices:[{finish_reason:'length',message:{content:JSON.stringify(analysis())}}]}));
  await assert.rejects(cut.runCircuitPdfAiReview(input),error=>error.kind==='invalid','a cut-off answer is not asked for again');
});

test('a finding the model returned that cannot be kept never leaves a check clean, and every new report is already in its stored form',async()=>{
  const k=service();
  const partly=k.parseCircuitPdfAiAnalysis(JSON.stringify({...analysis(),findings:[{...analysis().findings[0],category:'erc-pass'}]}),target);
  assert.deepEqual(Object.fromEntries(partly.checks.map(check=>[check.category,check.state])),{connectivity:'unverifiable','net-name':'unverifiable','label-name':'unverifiable'});
  assert.match(partly.checks.find(check=>check.category==='label-name').note,/1 筆回覆無法列入/);
  // A box outside the page and a summary cut at a space are stored exactly as this window keeps them.
  const offSheet={textComparable:true,graphicsComparable:true,sizeChanged:false,regions:[],textChanges:[{kind:'added',after:{str:'OFF_SHEET',x:1.02,y:.5,width:.05,height:.012}}]};
  const local=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:offSheet});
  assert.deepEqual(JSON.parse(JSON.stringify(k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(local))))),JSON.parse(JSON.stringify(local)));
  const {k:service2,input}=adapter(()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...analysis(),summary:'字 '.repeat(1990)})}}]}));
  const merged=await service2.runCircuitPdfAiReview({...input,local:{diff:changedDiff}});
  assert.ok(merged.summary.length<=4000&&merged.summary===merged.summary.trim());
  assert.deepEqual(JSON.parse(JSON.stringify(service2.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(merged))))),JSON.parse(JSON.stringify(merged)));
});

// 2026-11-24: 「600多項不同每頁都這樣子」 — a redrawn sheet is settled by names, says what it did not compare, and keeps that when stored.
test('a redrawn sheet is reported by its parts and nets, never claims the wiring was checked, and reopens unchanged',()=>{
  const k=service();
  const diff={textComparable:true,graphicsComparable:false,sizeChanged:false,textChanges:[],regions:[],redrawn:'layout',pages:{base:2,work:3},contents:{base:['R99'],work:['NEW_NET']},
    contentChanges:[{side:'base',token:'R99',type:'refdes',count:1,item:item('R99',.5,.5)},{side:'work',token:'NEW_NET',type:'net',count:1,item:item('NEW_NET',.3,.7)},{side:'work',token:'4.7K',type:'other',count:1,item:item('4.7K',.4,.4)}]};
  const result=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff});
  assert.equal(result.source,'local');assert.equal(result.local.redrawn,'layout');assert.equal(result.local.identical,false);
  assert.match(result.summary,/重畫的圖/);assert.match(result.summary,/不比位置和線/);assert.match(result.summary,/電腦只比名字/);
  assert.deepEqual(Object.fromEntries(result.checks.map(check=>[check.category,check.state])),{connectivity:'unverifiable','net-name':'possible-issue','label-name':'possible-issue'});
  assert.deepEqual([...result.findings.map(finding=>finding.title)],['基準版有、比對版沒有的零件編號：R99','比對版多出來的線路名稱：NEW_NET','參考：其他字不一樣 1 個（數值、腳位名稱或備註）']);
  const reopened=k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(JSON.parse(JSON.stringify(reopened)),JSON.parse(JSON.stringify(result)),'the redraw mark survives a save and reopen');
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...JSON.parse(JSON.stringify(result)),local:{...result.local,redrawn:'guess'}}),null);
  const style=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:{...diff,redrawn:'style',contentChanges:[]}});
  assert.match(style.summary,/兩版的線畫法不一樣/);
  assert.deepEqual(Object.fromEntries(style.checks.map(check=>[check.category,check.state])),{connectivity:'unverifiable','net-name':'no-visible-issue','label-name':'no-visible-issue'});
});

test('a local report made before blocks were grouped is compared again in the next batch, unless someone judged it (2026-11-24)',()=>{
  const k=service(), fresh=k.buildCircuitLocalReport({official:side('official',2),working:side('working',3),userName:'RD',diff:changedDiff});
  assert.equal(fresh.local.method,k.CIRCUIT_LOCAL_METHOD);assert.equal(k.isCircuitLocalReportOutdated(fresh),false);
  assert.deepEqual(JSON.parse(JSON.stringify(k.normalizeCircuitPdfAiReviewReport(JSON.parse(JSON.stringify(fresh))))),JSON.parse(JSON.stringify(fresh)),'the method comes back unchanged');
  const {method:_method,...older}=fresh.local, old={...fresh,local:older};
  assert.equal(k.isCircuitLocalReportOutdated(old),true);
  assert.equal(k.isCircuitLocalReportOutdated({...old,findings:old.findings.map((finding,index)=>index?finding:{...finding,decision:'confirmed'})}),false,'a judged page is kept');
  assert.equal(k.isCircuitLocalReportOutdated({...old,local:{...older,identical:true}}),false,'an identical page stays identical');
  assert.equal(k.isCircuitLocalReportOutdated({...old,local:{...older,redrawn:'layout'}}),true,'a redrawn sheet is listed in plain words now too');
  assert.equal(k.isCircuitLocalReportOutdated({...old,source:'ai'}),false,'an AI reading is never redone for free');
  assert.equal(k.normalizeCircuitPdfAiReviewReport({...JSON.parse(JSON.stringify(fresh)),local:{...fresh.local,method:1.5}}),null);
});
