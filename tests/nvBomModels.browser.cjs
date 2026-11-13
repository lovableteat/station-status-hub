// Real NV loader, request building, telemetry, parsing and UI; only account/provider transport is local.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.NV_MODELS_EVIDENCE_DIR||'../nv-ai-models');
const expected=['gpt-5.4','gpt-6.1-sol','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.8-flash','qa-claude','qa-text'];
const keyIds=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const modelKey=model=>model.startsWith('gpt-')?keyIds[0]:model.startsWith('gemini-')?keyIds[1]:model==='qa-claude'?keyIds[2]:keyIds[3];
const startButton=page=>page.getByRole('button',{name:/^開始比對/});
const changes=page=>page.locator('.nv-bom-result article[data-kind]');
async function showRemovedDetail(page){
 const card=page.locator('.nv-bom-result article[data-kind="removed"]');
 const expand=card.getByRole('button',{name:'查看詳情',exact:true});
 if(await expand.count())await expand.click();
}
async function showSettings(page){
 const settings=page.locator('.nv-bom-settings');
 if(!await settings.evaluate(details=>details.open))await settings.locator('summary').click();
}
async function waitForComparison(page,requestCount){
 await page.waitForFunction(count=>window.__nvQA.requests.length===count&&!Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()==='停止 AI 核對'),requestCount);
}
async function run(browser,origin,width){
 const context=await browser.newContext({viewport:{width,height:884},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'zh-TW'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[],report={width,checks:[]};page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('.nv-bom-models input').length===7);
  assert.deepEqual(await page.evaluate(()=>window.__nvQA.discoveries.map(call=>({operation:call.operation,apiKeyId:call.apiKeyId,rawCredentialPresent:!!call.apiKey}))),[{operation:'models',apiKeyId:keyIds[0],rawCredentialPresent:false}]);
  const models=page.getByRole('group',{name:'BOM 比對 AI 服務',exact:true});
  const labels=await models.locator('label').allTextContents();for(const model of expected)assert.ok(labels.some(label=>label.endsWith(model)),model+' is missing');
  assert.match(await page.locator('.nv-bom-model-heading strong').innerText(),/用 AI 幫忙核對/);
  await page.getByRole('button',{name:'重查 AI',exact:true}).click();
  await page.waitForFunction(()=>window.__nvQA.geminiDiscoveryCount===2);
  assert.equal(await page.evaluate(()=>window.__nvQA.reads.length),2);
  assert.equal(await page.evaluate(()=>window.__nvQA.requests.length),0);
  await page.getByRole('button',{name:'全選可用選項',exact:true}).click();assert.equal(await models.locator('input:checked').count(),7);
  await page.getByRole('button',{name:'清除選取',exact:true}).click();assert.equal(await models.locator('input:checked').count(),0);
  const start=startButton(page);assert.equal(await start.isEnabled(),false);
  await page.screenshot({path:path.join(evidence,`models-${width}.png`)});
  report.checks.push('all seven configured model choices appear, including custom; select-all and clear work');
  for(const side of ['before','after']){
   const picker=page.locator(`section[data-side="${side}"]`),chooserPromise=page.waitForEvent('filechooser');
   await picker.getByRole('button',{name:'選擇檔案',exact:true}).click();const chooser=await chooserPromise;
   await chooser.setFiles(path.join(evidence,`QA_NV_${side}.csv`));await picker.getByText(`QA_NV_${side}.csv`,{exact:true}).waitFor();
  }
  await start.click();await changes(page).first().waitFor();
  assert.equal(await changes(page).count(),5);
  assert.equal(await page.evaluate(()=>window.__nvQA.requests.length),0);
  report.checks.push('confirmed workbook columns produce a complete local diff without contacting an AI model');
  const supplyChange=page.locator('.nv-bom-result article[data-action="sourceChanged"]').filter({hasText:'QA-NV-001'});
  const supplySummary=supplyChange.locator('.nv-bom-result-main');
  const supplyDetails=supplyChange.getByRole('region',{name:'來源差異',exact:true});
  const toggle=supplyChange.getByRole('button',{name:'查看詳情',exact:true});
  const expectSupplyDiff=async(scope)=>{
   const vendor=scope.getByText('廠商',{exact:true});
   const mpn=scope.getByText('廠商料號',{exact:true});
   assert.ok(await vendor.isVisible());assert.ok(await mpn.isVisible());
   for(const [label,value,verb] of [
    ['新版新增廠商：','QA New Vendor','新增'],
    ['新版移除廠商：','QA Other','移除'],
    ['新版新增廠商料號：','QA-ALT','新增'],
    ['新版移除廠商料號：','QA-BASE','移除'],
   ]){
    const badge=scope.getByLabel(new RegExp(label));
    assert.ok(await badge.isVisible(),label);
    assert.ok(await badge.getByText(verb,{exact:true}).isVisible(),label);
    assert.ok(await badge.getByText(value,{exact:true}).isVisible(),label);
   }
  };
  assert.match(await supplySummary.innerText(),/新版供料清單有變動/);
  await expectSupplyDiff(supplySummary);
  assert.doesNotMatch(await supplySummary.innerText(),/新增 \d+ 個廠商/);
  assert.match(await supplySummary.innerText(),/位號清單相同，共 2 個。用量維持 2。/);
  await supplySummary.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`supply-summary-${width}.png`)});
  if(width<768)await toggle.tap();else await toggle.click();
  await supplyDetails.getByRole('heading',{name:'新舊版供料清單差異',exact:true}).waitFor();
  await expectSupplyDiff(supplyDetails);
  assert.match(await supplyDetails.innerText(),/位號清單相同，共 2 個。用量維持 2。/);
  assert.match(await supplyDetails.innerText(),/廠商與料號分欄比對，兩者的對應請核對原始 Excel。/);
  await supplySummary.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`supply-change-${width}.png`)});
  await supplyChange.getByRole('button',{name:'收合詳情',exact:true}).click();
  assert.equal(await supplyDetails.count(),0);
  report.checks.push('supplier and MPN additions and removals are grouped separately, with unchanged quantity and references in both views');
  const orderOnly=changes(page).filter({hasText:'QA-NV-004'});
  const orderSummary=orderOnly.locator('.nv-bom-result-main');
  const orderText=await orderSummary.innerText();
  assert.ok(await orderSummary.getByText('排列順序',{exact:true}).isVisible());
  assert.match(orderText,/只調整廠商與廠商料號的排列順序/);
  assert.match(orderText,/廠商\s*僅順序不同/);
  assert.match(orderText,/廠商料號\s*僅順序不同/);
  assert.match(orderText,/位號清單相同，共 2 個。用量維持 2。/);
  assert.equal(await orderOnly.getByLabel(/^新版(新增|移除)廠商/).count(),0);
  await orderSummary.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`supply-order-summary-${width}.png`)});
  const orderToggle=orderOnly.getByRole('button',{name:'查看詳情',exact:true});
  if(width<768)await orderToggle.tap();else await orderToggle.click();
  const orderDetails=orderOnly.locator('.nv-bom-result-details');
  await orderDetails.waitFor();
  const orderEvidence=orderDetails.getByRole('region',{name:'來源差異',exact:true});
  assert.ok(await orderEvidence.getByRole('heading',{name:'新舊版供料清單差異',exact:true}).isVisible());
  const orderDetailsText=await orderDetails.innerText();
  assert.match(orderDetailsText,/廠商\s*僅順序不同/);
  assert.match(orderDetailsText,/廠商料號\s*僅順序不同/);
  assert.match(orderDetailsText,/位號清單相同，共 2 個。用量維持 2。/);
  assert.match(orderDetailsText,/兩欄都沒有新增或移除項目。/);
  assert.equal(await orderOnly.getByLabel(/^新版(新增|移除)廠商/).count(),0);
  for(const [version,sequence] of [
   ['舊版','QA Vendor A → QA Vendor B'],
   ['新版','QA Vendor B → QA Vendor A'],
   ['舊版','QA-MPN-A → QA-MPN-B'],
   ['新版','QA-MPN-B → QA-MPN-A'],
  ]) assert.ok(await orderEvidence.getByText(new RegExp(`${version}順序\\s*${sequence}`)).isVisible());
  for(const [version,vendor,mpn] of [
   ['舊版','QA Vendor A;QA Vendor B','QA-MPN-A;QA-MPN-B'],
   ['新版','QA Vendor B;QA Vendor A','QA-MPN-B;QA-MPN-A'],
  ]){
   const original=orderDetails.getByRole('region',{name:version,exact:true});
   assert.ok(await original.getByText(vendor,{exact:true}).isVisible());
   assert.ok(await original.getByText(mpn,{exact:true}).isVisible());
  }
  await orderEvidence.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`supply-order-details-${width}.png`)});
  await orderOnly.getByRole('button',{name:'收合詳情',exact:true}).click();
  assert.equal(await orderDetails.count(),0);
  report.checks.push('supplier and MPN order-only differences explain what moved, never claim adds or removals, and preserve raw old/new evidence');
  const sourceChange=changes(page).filter({hasText:'QA-NV-005'});
  const sourceSummary=sourceChange.locator('.nv-bom-result-main');
  const expectSourceTransition=async(scope)=>{
   const copy=await scope.innerText();
   assert.match(copy,/來源欄/);
   assert.match(copy,/舊版\s*單一來源（Single）/);
   assert.match(copy,/新版\s*多個來源（Multiple）/);
   assert.match(copy,/廠商與廠商料號相同。\s*用量維持 1。/);
   assert.equal(await scope.getByLabel(/^新版(新增|移除)廠商/).count(),0);
  };
  assert.equal(await sourceChange.getAttribute('data-scope'),'board');
  assert.match(await sourceSummary.innerText(),/供料來源由單一來源改為多個來源/);
  await expectSourceTransition(sourceSummary);
  await sourceSummary.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`source-policy-summary-${width}.png`)});
  const sourceToggle=sourceChange.getByRole('button',{name:'查看詳情',exact:true});
  if(width<768)await sourceToggle.tap();else await sourceToggle.click();
  const sourceDetails=sourceChange.locator('.nv-bom-result-details');
  const sourceEvidence=sourceDetails.getByRole('region',{name:'來源差異',exact:true});
  await sourceEvidence.waitFor();
  assert.ok(await sourceEvidence.getByRole('heading',{name:'Excel 來源欄前後對照',exact:true}).isVisible());
  await expectSourceTransition(sourceEvidence);
  for(const [version,raw] of [['舊版','Single'],['新版','Multiple']]){
   const original=sourceDetails.getByRole('region',{name:version,exact:true});
   const originalSource=original.locator('[data-field-changed="true"]').filter({has:page.getByText('來源欄',{exact:true})});
   assert.ok(await originalSource.getByText(raw,{exact:true}).isVisible(),`${version} highlighted source value`);
  }
  await sourceEvidence.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,`source-policy-details-${width}.png`)});
  await sourceChange.getByRole('button',{name:'收合詳情',exact:true}).click();
  assert.equal(await sourceDetails.count(),0);
  report.checks.push('same PCB has an explicit Single to Multiple source transition and highlighted raw evidence without a supplier or MPN change');
  await showSettings(page);await models.getByRole('checkbox',{name:/qa-text$/}).check();await start.click();
  await waitForComparison(page,1);
  assert.deepEqual(await page.evaluate(()=>window.__nvQA.requests.map(request=>request.model)),['qa-text']);
  await page.getByRole('tab').filter({hasText:'qa-text'}).click();
  assert.equal(await changes(page).count(),5);
  report.checks.push('one selected custom model receives only the complete five-difference review request');
  await showSettings(page);await page.getByRole('button',{name:'全選可用選項',exact:true}).click();await start.click();
  await waitForComparison(page,8);
  const tabs=page.getByRole('tab');assert.equal(await tabs.count(),8);
  const state=await page.evaluate(()=>({requests:window.__nvQA.requests,telemetry:window.__nvQA.telemetry,reads:window.__nvQA.reads}));
  const starts=state.telemetry.filter(event=>event.name==='start_ai_model_usage_attempt'),finishes=state.telemetry.filter(event=>event.name==='finish_ai_model_usage_attempt');
  assert.equal(starts.length,8);assert.equal(finishes.length,8);
  for(const event of starts)assert.equal(event.p_api_key_id,modelKey(event.p_model),'telemetry must keep the raw key UUID');
  assert.ok(state.reads.every(table=>table==='api_keys'));
  for(const model of expected)assert.equal(state.requests.filter(request=>request.model===model).length,model==='qa-text'?2:1,model);
  for(const request of state.requests){
   const message=request.body.contents?.at(-1)??request.body.messages?.at(-1);
   const content=message.parts??message.content;
   const input=JSON.parse(typeof content==='string'?content:content.map(part=>part.text||'').join(''));
   assert.equal(input.items.length,5,'only verified differences should be sent for review');
   if(request.provider==='openai')assert.equal(request.apiKeyId,keyIds[0]);
   if(request.provider==='gemini')assert.ok(request.url.includes(`/models/${request.model}:generateContent`));
   else assert.equal(request.body.model,request.model);
  }
  for(const model of expected.filter(model=>model!=='gpt-6.1-sol')){
   await tabs.filter({hasText:model}).click();
   for(const kind of ['added','removed','changed'])assert.equal(await page.locator(`.nv-bom-result article[data-kind="${kind}"]`).count(),kind==='changed'?3:1,model+' '+kind);
   assert.match(await page.locator('.nv-bom-summary').innerText(),/AI 已核對 5／5/);
  }
  await tabs.filter({hasText:'gpt-6.1-sol'}).click();assert.match(await page.getByRole('alert').innerText(),/尚未開通.*gpt-6.1-sol/);
  await tabs.filter({hasText:'gemini-3.8-flash'}).click();assert.equal(await page.getByRole('alert').count(),0);
  report.checks.push('all seven model routes use their selected model and raw key UUID; one Sol 403 does not discard six completed results');
  await showRemovedDetail(page);
  const annotation=page.getByRole('textbox',{name:'QA-NV-002 人工備註',exact:true}),checked=page.getByRole('checkbox',{name:'已核對 QA-NV-002',exact:true});
  await annotation.fill('QA reviewed removal');await checked.check();
  await tabs.filter({hasText:'gpt-5.4'}).click();await showRemovedDetail(page);assert.equal(await annotation.inputValue(),'');
  await tabs.filter({hasText:'gemini-3.8-flash'}).click();await showRemovedDetail(page);assert.equal(await annotation.inputValue(),'QA reviewed removal');assert.equal(await checked.isChecked(),true);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出此 AI 結果',exact:true}).click();const download=await downloadPromise;
  const exported=path.join(evidence,`export-${width}.xlsx`);await download.saveAs(exported);
  const {Workbook}=require('exceljs'),book=new Workbook();await book.xlsx.readFile(exported);const data=book.getWorksheet('新增刪除與變更');
  assert.equal(data.rowCount,6);
  const removed=data.getRows(2,5).find(row=>row.getCell(3).value==='QA-OLD');
  assert.ok(removed);assert.equal(removed.getCell(14).value,'是');assert.equal(removed.getCell(15).value,'QA reviewed removal');
  assert.match(String(book.getWorksheet('比對來源').getRow(3).getCell(2).value),/gemini-3.8-flash/);
  report.checks.push('per-model annotations survive result switches and export retains every difference plus selected AI and manual note');
  const exportButton=page.getByRole('button',{name:'匯出此 AI 結果',exact:true});
  const backButton=page.getByRole('button',{name:'返回版本管理',exact:true});
  const exportBox=await exportButton.boundingBox(),backBox=await backButton.boundingBox();
  assert.ok(exportBox&&backBox&&exportBox.x<width/2,'export should be in the left-side actions');
  assert.ok(exportBox.x>=backBox.x-2,'export should align with or follow the back button');
  await page.getByText('已儲存比對紀錄',{exact:true}).waitFor();
  const historyButton=page.getByRole('button',{name:'比對紀錄',exact:true});
  await historyButton.click();
  const savedEntries=page.getByRole('button',{name:/QA_NV_before\.csv.*QA_NV_after\.csv/});
  const savedEntry=savedEntries.first();
  await savedEntry.waitFor();
  assert.equal(await savedEntries.count(),3,'local and both AI comparison runs should be retained');
  await page.screenshot({path:path.join(evidence,`history-before-reload-${width}.png`)});
  await page.reload();
  await historyButton.click();
  await savedEntry.click();
  await page.getByRole('tab').filter({hasText:'gemini-3.8-flash'}).click();
  assert.equal(await changes(page).count(),5);
  assert.equal(await page.evaluate(()=>window.__nvQA.requests.length),0,'opening history should not re-run an AI model');
  await showRemovedDetail(page);
  assert.equal(await annotation.inputValue(),'QA reviewed removal');
  assert.equal(await checked.isChecked(),true);
  const restoredDownloadPromise=page.waitForEvent('download');
  await exportButton.click();
  const restoredDownload=await restoredDownloadPromise;
  const restoredExport=path.join(evidence,`history-export-${width}.xlsx`);
  await restoredDownload.saveAs(restoredExport);
  const restoredBook=new Workbook();
  await restoredBook.xlsx.readFile(restoredExport);
  const restoredRows=restoredBook.getWorksheet('新增刪除與變更');
  assert.equal(restoredRows.rowCount,6);
  const restoredRemoved=restoredRows.getRows(2,5).find(row=>row.getCell(3).value==='QA-OLD');
  assert.ok(restoredRemoved);
  assert.equal(restoredRemoved.getCell(14).value,'是');
  assert.equal(restoredRemoved.getCell(15).value,'QA reviewed removal');
  report.checks.push('left-side export; comparison history survives page reload and restores model results, annotations and downloadable workbook without new provider requests');
  report.geometry=await page.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('.nv-bom-result article[data-kind]')].map(row=>row.getBoundingClientRect().height)}));
  assert.equal(report.geometry.width,report.geometry.pageWidth);assert.deepEqual(errors,[]);report.errors=errors;report.result='passed';
  await page.screenshot({path:path.join(evidence,`results-${width}.png`)});
  await page.goto(`${origin}/?historyScope=qa-unrelated-project`);
  await historyButton.click();
  await page.getByText('目前沒有已儲存的比對紀錄。',{exact:true}).waitFor();
  assert.equal(await savedEntries.count(),0,'a different project must not see this project’s comparison history');
  report.checks.push('saved comparison is isolated from a different project in the same browser');
  return report;
 }catch(error){await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{});throw error;}finally{await context.close();}
}
(async()=>{fs.mkdirSync(evidence,{recursive:true});
 const header='NV PN,MPN,Manufacturer,Description,Qty,Ref Des,Source\n';
 fs.writeFileSync(path.join(evidence,'QA_NV_before.csv'),header+'QA-NV-001,QA-KEEP;QA-BASE,QA Maker;QA Other,Existing part,2,"R1,R4"\nQA-NV-002,QA-OLD,QA Maker,Removed part,1,R2\nQA-NV-004,QA-MPN-A;QA-MPN-B,QA Vendor A;QA Vendor B,Order-only part,2,"R5,R6"\nQA-NV-005,QA-PCB-MPN,QA PCB Vendor,BARE PCB fixture,1,,Single\n');
 fs.writeFileSync(path.join(evidence,'QA_NV_after.csv'),header+'QA-NV-001,QA-ALT;QA-KEEP,QA Maker;QA New Vendor,Existing part,2,"R1,R4"\nQA-NV-003,QA-NEW,QA Maker,Added part,1,R3\nQA-NV-004,QA-MPN-B;QA-MPN-A,QA Vendor B;QA Vendor A,Order-only part,2,"R5,R6"\nQA-NV-005,QA-PCB-MPN,QA PCB Vendor,BARE PCB fixture,1,,Multiple\n');
 const {createServer}=await import('vite');const mock=path.resolve('tests/support/nvBomModelsMock.js');let server,browser;const reports=[];
 try{
  server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[{find:'@/integrations/supabase/client',replacement:mock},{find:'@',replacement:path.resolve('src')}]},optimizeDeps:{entries:['tests/support/nvBomModelsFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-nv-models',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/nvBomModelsFixture.jsx"></script></html>');});}}]});
  await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;browser=await chromium.launch({channel:'chrome'});
  for(const width of [1543,390])reports.push(await run(browser,origin,width));console.log('NV comparison QA passed: 1543/390, local comparison, seven AI request routes, partial failure, annotations and export');
 }finally{fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({reports,provider:'isolated transport; actual loader/builders/telemetry/parser/UI',productionWrites:false},null,2));if(browser)await browser.close();if(server)await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
