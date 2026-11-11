const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.CIRCUIT_AI_EVIDENCE_DIR||'../circuit-pdf-ai-review-evidence');

async function runParallelBatch(browser,origin,width) {
  const context=await browser.newContext({viewport:{width,height:884},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/?allPages');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    const status=(number)=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true}).getAttribute('data-status');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    await page.evaluate(()=>window.__circuitAiQA.mode='hold');
    await dialog.getByRole('button',{name:'全部頁面比對',exact:true}).click();
    await page.waitForFunction(()=>Object.keys(window.__circuitAiQA.held??{}).length>=3);
    await progress.getByText(/正在比對第 1、2、3 頁/).waitFor();
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held)),['1','2','3']);
    assert.equal(await status(4),'pending');
    assert.equal(await status(5),'unmatched');
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    await page.screenshot({path:path.join(evidence,`parallel-three-pages-${width}.png`)});

    await page.evaluate(()=>window.__circuitAiQA.held[2]());
    await page.waitForFunction(()=>window.__circuitAiQA.saves===1&&Boolean(window.__circuitAiQA.held[4]));
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage})=>workingPage)),[2]);
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held)),['1','3','4']);
    assert.equal(await status(2),'complete');
    await dialog.getByRole('button',{name:'停止全部比對',exact:true}).click();
    const resume=dialog.getByRole('button',{name:'繼續未完成頁面',exact:true});
    await resume.waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held).length),0);
    assert.equal(await status(1),'pending');
    assert.equal(await status(3),'pending');
    assert.equal(await status(4),'pending');
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.saves),1);

    await page.evaluate(()=>{window.__circuitAiQA.mode='normal';window.__circuitAiQA.failPages=[3]});
    await resume.click();
    await progress.getByText('部分頁面尚未完成',{exact:true}).waitFor();
    assert.equal(await status(3),'failed');
    assert.equal(await status(4),'complete');
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage})=>workingPage).sort()),[1,2,4]);
    await page.evaluate(()=>window.__circuitAiQA.failPages=[]);
    await resume.click();
    await progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    assert.equal(await status(3),'complete');
    const calls=await page.evaluate(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage));
    assert.equal(calls.filter(page=>page===2).length,1);
    assert.ok(!calls.includes(5));
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage,officialPage})=>[workingPage,officialPage]).sort()),[[1,2],[2,3],[3,4],[4,5]]);
    assert.deepEqual(errors,[]);
    return {width,checks:['three concurrent matched pairs with fourth pending','out-of-order result saves independently','cancel resets active pages and preserves saved report','resume skips saved and unmatched and retries failed page']};
  } finally {
    await context.close();
  }
}

(async()=>{fs.mkdirSync(evidence,{recursive:true});const{createServer}=await import('vite');const mock=path.resolve('tests/support/circuitPdfAiReviewMock.ts');const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[{find:'@/integrations/supabase/client',replacement:mock},{find:'../api-management/aiUsageTelemetry',replacement:mock},{find:'@',replacement:path.resolve('src')}]},optimizeDeps:{entries:['tests/support/circuitPdfAiReviewFixture.jsx'],include:['react/jsx-dev-runtime','pdfjs-dist','jspdf']},worker:{format:'es'},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),evidence,fs.realpathSync('node_modules')]}},plugins:[{name:'circuit-ai-fixture',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitPdfAiReviewFixture.jsx"></script></html>')})}}]});let browser;const results=[];
try{await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'chrome'});
for(const width of[1440,1173,390]){const context=await browser.newContext({viewport:{width,height:884},hasTouch:true,isMobile:width<768,reducedMotion:'reduce'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message)});page.setDefaultTimeout(20000);await page.goto(origin);const open=page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true});await open.click();const dialog=page.getByTestId('circuit-pdf-ai-review');await dialog.waitFor();await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
await dialog.getByRole('button',{name:'只比對這一頁',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===1);assert.equal((await page.evaluate(()=>window.__circuitAiQA.calls))[0].images,2);assert.deepEqual((await page.evaluate(()=>window.__circuitAiQA.calls))[0].detail,['high','high']);assert.match((await page.evaluate(()=>window.__circuitAiQA.calls))[0].text,/PCIE_RX_P/);assert.match(await dialog.innerText(),/不能證明完整電氣連通/);const first=await page.evaluate(()=>window.__circuitAiQA.rows[0].id);
await dialog.locator('.circuit-pdf-ai-finding summary').click();await dialog.getByRole('button',{name:'已確認',exact:true}).click();await dialog.getByRole('textbox',{name:'F1 人工核對備註',exact:true}).fill('QA 已核對原生 netlist，應更正 P/N。');await dialog.getByRole('button',{name:'返回圖面',exact:true}).click();assert.ok(await dialog.isVisible());assert.match(await dialog.getByRole('alert').innerText(),/尚未儲存/);await dialog.getByRole('button',{name:'儲存人工判讀',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.saves===2);assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows[0].id),first);assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows[0].findings[0].decision),'confirmed');await dialog.getByRole('button',{name:'返回圖面',exact:true}).click();await dialog.waitFor({state:'hidden'});await open.click();assert.match(await dialog.innerText(),/已確認/);
await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===2);assert.notEqual(await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id),first);await dialog.getByRole('combobox',{name:'歷次 AI 初審',exact:true}).selectOption(first);assert.match(await dialog.innerText(),/正在查看歷史初審/);await dialog.locator('.circuit-pdf-ai-finding summary').click();assert.equal(await dialog.getByRole('button',{name:'已確認',exact:true}).isEnabled(),false);await dialog.getByRole('combobox',{name:'歷次 AI 初審',exact:true}).selectOption('');
if(width===1440){const saved=await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id);await page.evaluate(()=>window.__circuitAiQA.mode='invalid');await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id),saved);await page.evaluate(()=>{window.__circuitAiQA.mode='normal';window.__circuitAiQA.saveFail=true});await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'QA 模擬儲存失敗'}).waitFor();assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.length),2);await page.evaluate(()=>window.__circuitAiQA.saveFail=false);await dialog.getByRole('button',{name:'儲存人工判讀',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===3);const count=await page.evaluate(()=>window.__circuitAiQA.calls.length);await page.evaluate(()=>window.__circuitAiQA.mode='slow');await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await page.waitForFunction(count=>window.__circuitAiQA.calls.length>count,count);await dialog.getByRole('button',{name:'取消初審',exact:true}).click();await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.length),3);}
await page.setViewportSize({width,height:500});
await page.waitForFunction(()=>{const box=document.querySelector('[data-testid="circuit-pdf-ai-review"]').getBoundingClientRect();return box.y>=-1&&box.bottom<=501}).catch(async error=>{await page.screenshot({path:path.join(evidence,`failure-short-${width}.png`)});console.error(await dialog.boundingBox());throw error});
await dialog.locator('.circuit-pdf-ai-body').evaluate(node=>node.scrollTop=node.scrollHeight);const box=await dialog.boundingBox(),footer=await dialog.locator('.circuit-pdf-ai-footer').boundingBox();assert.ok(box.y>=-1&&box.y+box.height<=501);assert.ok(footer.y>=0&&footer.y+footer.height<=501);assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:path.join(evidence,`short-${width}.png`)});await page.setViewportSize({width,height:884});await dialog.locator('.circuit-pdf-ai-body').evaluate(node=>node.scrollTop=0);await page.screenshot({path:path.join(evidence,`review-${width}.png`)});await dialog.getByRole('button',{name:'關閉 AI 比對',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'切換檢視權限',exact:true}).click();await open.click();assert.equal(await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).isEnabled(),false);assert.deepEqual(errors,[]);results.push({width,result:'passed',checks:['real PDF images and coordinate text sent','manual review save/reopen','old AI runs read-only','cancellation and failure preserve reports','short viewport no clipping','read-only permissions respected']});await context.close();}
const parallelBatch=[];
for(const width of [1440,390])parallelBatch.push(await runParallelBatch(browser,origin,width));
fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({result:'passed',checks:results,parallelBatch},null,2));console.log(JSON.stringify({checks:results,parallelBatch}));
}finally{if(browser)await browser.close();await server.close()}})().catch(error=>{console.error(error);process.exitCode=1});


