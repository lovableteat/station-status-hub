// Real NV loader, request building, telemetry, parsing and UI; only account/provider transport is local.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.NV_MODELS_EVIDENCE_DIR||'../nv-ai-models');
const expected=['gpt-5.4','gpt-6.1-sol','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.8-flash','qa-claude','qa-text'];
const keyIds=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const modelKey=model=>model.startsWith('gpt-')?keyIds[0]:model.startsWith('gemini-')?keyIds[1]:model==='qa-claude'?keyIds[2]:keyIds[3];
async function run(browser,origin,width){
 const context=await browser.newContext({viewport:{width,height:884},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'zh-TW'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[],report={width,checks:[]};page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('.nv-bom-models input').length===7);
  const models=page.getByRole('group',{name:'BOM 比對 AI 服務',exact:true});
  const labels=await models.locator('label').allTextContents();for(const model of expected)assert.ok(labels.some(label=>label.endsWith(model)),model+' is missing');
  assert.match(await page.locator('.nv-bom-model-heading strong').innerText(),/7/);
  await page.getByRole('button',{name:'全選',exact:true}).click();assert.equal(await models.locator('input:checked').count(),7);
  await page.getByRole('button',{name:'清除選取',exact:true}).click();assert.equal(await models.locator('input:checked').count(),0);
  const start=page.getByRole('button',{name:/^開始 AI 比對/});assert.equal(await start.isEnabled(),false);
  await page.screenshot({path:path.join(evidence,`models-${width}.png`)});
  report.checks.push('all seven configured model choices appear, including custom; select-all and clear work');
  for(const side of ['before','after']){
   const picker=page.locator(`section[data-side="${side}"]`),chooserPromise=page.waitForEvent('filechooser');
   await picker.getByRole('button',{name:'選擇檔案',exact:true}).click();const chooser=await chooserPromise;
   await chooser.setFiles(path.join(evidence,`QA_NV_${side}.csv`));await picker.getByText(`QA_NV_${side}.csv`,{exact:true}).waitFor();
  }
  await models.getByRole('checkbox',{name:/qa-text$/}).check();await start.click();
  await page.waitForFunction(()=>window.__nvQA.requests.length===2&&[...document.querySelectorAll('button')].some(e=>e.textContent.startsWith('開始 AI 比對')&&!e.disabled));
  assert.deepEqual(await page.evaluate(()=>window.__nvQA.requests.map(request=>request.model)),['qa-text','qa-text']);
  assert.equal(await page.locator('.nv-bom-table tbody tr').count(),3);
  report.checks.push('one selected custom model receives the actual mapping and complete three-difference review requests');
  await page.locator('.nv-bom-settings > summary').click();await page.getByRole('button',{name:'全選',exact:true}).click();await start.click();
  await page.waitForFunction(()=>window.__nvQA.requests.length===15&&[...document.querySelectorAll('button')].some(e=>e.textContent.startsWith('開始 AI 比對')&&!e.disabled));
  const tabs=page.getByRole('tab');assert.equal(await tabs.count(),7);
  const state=await page.evaluate(()=>({requests:window.__nvQA.requests,telemetry:window.__nvQA.telemetry,reads:window.__nvQA.reads}));
  const starts=state.telemetry.filter(event=>event.name==='start_ai_model_usage_attempt'),finishes=state.telemetry.filter(event=>event.name==='finish_ai_model_usage_attempt');
  assert.equal(starts.length,15);assert.equal(finishes.length,15);
  for(const event of starts)assert.equal(event.p_api_key_id,modelKey(event.p_model),'telemetry must keep the raw key UUID');
  assert.ok(state.reads.every(table=>table==='api_keys'));
  for(const model of expected)assert.equal(state.requests.filter(request=>request.model===model).length,model==='qa-text'?4:model==='gpt-6.1-sol'?1:2,model);
  for(const request of state.requests){
   if(request.provider==='openai')assert.equal(request.apiKeyId,keyIds[0]);
   if(request.provider==='gemini')assert.ok(request.url.includes(`/models/${request.model}:generateContent`));
   else assert.equal(request.body.model,request.model);
  }
  for(const model of expected.filter(model=>model!=='gpt-6.1-sol')){
   await tabs.filter({hasText:model}).click();
   for(const kind of ['added','removed','changed'])assert.equal(await page.locator(`.nv-bom-table tr[data-kind="${kind}"]`).count(),1,model+' '+kind);
   assert.match(await page.locator('.nv-bom-summary').innerText(),/AI 已核對 3／3/);
  }
  await tabs.filter({hasText:'gpt-6.1-sol'}).click();assert.match(await page.getByRole('alert').innerText(),/尚未開通.*gpt-6.1-sol/);
  await tabs.filter({hasText:'gemini-3.8-flash'}).click();assert.equal(await page.getByRole('alert').count(),0);
  report.checks.push('all seven model routes use their selected model and raw key UUID; one Sol 403 does not discard six completed results');
  const annotation=page.getByRole('textbox',{name:'QA-NV-002 人工備註',exact:true}),checked=page.getByRole('checkbox',{name:'已核對 QA-NV-002',exact:true});
  await annotation.fill('QA reviewed removal');await checked.check();
  await tabs.filter({hasText:'gpt-5.4'}).click();assert.equal(await page.getByRole('textbox',{name:'QA-NV-002 人工備註',exact:true}).inputValue(),'');
  await tabs.filter({hasText:'gemini-3.8-flash'}).click();assert.equal(await annotation.inputValue(),'QA reviewed removal');assert.equal(await checked.isChecked(),true);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出此 AI 結果',exact:true}).click();const download=await downloadPromise;
  const exported=path.join(evidence,`export-${width}.xlsx`);await download.saveAs(exported);
  const {Workbook}=require('exceljs'),book=new Workbook();await book.xlsx.readFile(exported);const data=book.getWorksheet('新增刪除與變更');
  assert.equal(data.rowCount,4);assert.equal(data.getRow(2).getCell(3).value,'QA-OLD');assert.equal(data.getRow(2).getCell(14).value,'是');assert.equal(data.getRow(2).getCell(15).value,'QA reviewed removal');
  assert.match(String(book.getWorksheet('比對來源').getRow(3).getCell(2).value),/gemini-3.8-flash/);
  report.checks.push('per-model annotations survive result switches and export retains every difference plus selected AI and manual note');
  report.geometry=await page.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('.nv-bom-table tbody tr')].map(row=>row.getBoundingClientRect().height)}));
  assert.equal(report.geometry.width,report.geometry.pageWidth);assert.deepEqual(errors,[]);report.errors=errors;report.result='passed';
  await page.screenshot({path:path.join(evidence,`results-${width}.png`)});return report;
 }catch(error){await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{});throw error;}finally{await context.close();}
}
(async()=>{fs.mkdirSync(evidence,{recursive:true});const {createServer}=await import('vite');const mock=path.resolve('tests/support/nvBomModelsMock.js');let server,browser;const reports=[];
 try{
  server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[{find:'@/integrations/supabase/client',replacement:mock},{find:'@',replacement:path.resolve('src')}]},optimizeDeps:{entries:['tests/support/nvBomModelsFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-nv-models',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/nvBomModelsFixture.jsx"></script></html>');});}}]});
  await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;browser=await chromium.launch({channel:'chrome'});
  for(const width of [1543,390])reports.push(await run(browser,origin,width));console.log('NV model QA passed: 1543/390, seven real request routes, partial failure, annotations and export');
 }finally{fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({reports,provider:'isolated transport; actual loader/builders/telemetry/parser/UI',productionWrites:false},null,2));if(browser)await browser.close();if(server)await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
