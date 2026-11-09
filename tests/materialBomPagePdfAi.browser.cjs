// Real PDF.js rendering/service/UI; provider replies, accounts and BOM writes stay isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const {jsPDF}=require('jspdf');
const evidence=path.resolve(process.env.PDF_AI_EVIDENCE_DIR||'../pdf-ai-integration-evidence');
fs.mkdirSync(evidence,{recursive:true});
const titles=['CPU POWER','CLOCK TREE','RESET CONTROL'];
function makePdf(){const pdf=new jsPDF({unit:'pt',format:[600,400],orientation:'landscape'});titles.forEach((title,index)=>{if(index)pdf.addPage([600,400],'landscape');pdf.setFontSize(12);pdf.text('UPPER LEFT MUST NOT BE SENT',20,25);pdf.text('Title: '+title,320,360);pdf.text('Sheet '+(index+1),470,385)});return Buffer.from(pdf.output('arraybuffer'))}
const trackerDialog=page=>page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'頁數進度',exact:true})});
async function openTracker(page,width){
 if(width<1024){await page.getByRole('button',{name:'排序與工具',exact:true}).tap();await page.getByTestId('material-mobile-tools').getByRole('button',{name:'頁數進度',exact:true}).tap()}
 else await page.getByRole('button',{name:/已完成.*頁/}).click();
 await trackerDialog(page).waitFor();return trackerDialog(page);
}
async function run(browser,origin,width,state,pdf){
 const context=await browser.newContext({viewport:{width,height:884},deviceScaleFactor:1,isMobile:width<1024,hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000);
 try{
  state.mode='ok';await page.goto(origin+'/?qaMainRows&qaPages');await page.getByTestId('material-table-card').waitFor();
  const tracker=await openTracker(page,width);assert.equal(await tracker.getByLabel('總頁數',{exact:true}).inputValue(),'4');
  const original=await page.evaluate(()=>structuredClone(window.__pdfAiFixture.tracker));
  await tracker.getByRole('button',{name:'PDF AI',exact:true}).tap();const ai=page.getByTestId('bom-page-pdf-ai');await ai.waitFor();
  await ai.getByRole('combobox',{name:'PDF AI 服務',exact:true}).selectOption('pdf-qa-model');
  await ai.getByLabel('選擇標題辨識 PDF',{exact:true}).setInputFiles({name:'synthetic-three-pages.pdf',mimeType:'application/pdf',buffer:pdf});
  await ai.getByRole('button',{name:'辨識全部頁面',exact:true}).tap();await ai.getByLabel('PDF 第 3 頁標題',{exact:true}).waitFor();
  for(let index=0;index<titles.length;index++)assert.equal(await ai.getByLabel(`PDF 第 ${index+1} 頁標題`,{exact:true}).inputValue(),titles[index]);
  assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),original,'AI preview must not save the BOM tracker');
  if(width>=640){const image=ai.getByAltText('第 1 頁右下角標題原圖');await image.waitFor();assert.ok(await image.evaluate(img=>img.complete&&img.naturalWidth===1600&&img.naturalHeight===640))}
  await ai.getByLabel('PDF 第 2 頁標題',{exact:true}).fill('CLOCK TREE 人工確認');
  await ai.getByRole('button',{name:'預覽 PDF 第 3 頁',exact:true}).tap();
  await ai.getByRole('button',{name:'預覽 PDF 第 1 頁',exact:true}).tap();
  const popupPromise=page.waitForEvent('popup');
  await ai.getByRole('link',{name:width>=640?'放大預覽':'右下原圖',exact:true}).tap();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  assert.ok(await popup.locator('img').evaluate(image=>image.complete&&image.naturalWidth===1600&&image.naturalHeight===640));await popup.close();
  await ai.getByRole('button',{name:'更換 PDF／模型',exact:true}).tap();
  await ai.getByLabel('選擇標題辨識 PDF',{exact:true}).setInputFiles({name:'synthetic-three-pages.pdf',mimeType:'application/pdf',buffer:pdf});
  await ai.getByRole('button',{name:'辨識全部頁面',exact:true}).tap();await ai.getByLabel('PDF 第 3 頁標題',{exact:true}).waitFor();
  await ai.getByLabel('PDF 第 2 頁標題',{exact:true}).fill('CLOCK TREE 人工確認');
  await page.screenshot({path:path.join(evidence,`preview-${width}.png`)});
  const apply=ai.getByRole('button',{name:'套用 3 頁',exact:true});
  if(width<1024){await page.setViewportSize({width,height:500});const box=await apply.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=500,JSON.stringify(box));await page.setViewportSize({width,height:884})}
  await apply.tap();await ai.waitFor({state:'hidden'});
  assert.equal(await tracker.getByLabel('總頁數',{exact:true}).inputValue(),'4','short PDF must preserve all four existing tracker pages');
  assert.equal(await tracker.getByLabel('目前做到第幾頁',{exact:true}).inputValue(),'3');
  assert.equal(await tracker.getByRole('textbox',{name:'第 4 頁標題',exact:true}).inputValue(),'第4頁必須保留');
  assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),original,'Apply changes only the outer unsaved draft');
  await tracker.getByRole('button',{name:'關閉',exact:true}).tap();await tracker.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),original,'Cancelling page tracker must retain all saved content');
  await openTracker(page,width);await tracker.getByRole('button',{name:'PDF AI',exact:true}).tap();await ai.waitFor();
  await ai.getByLabel('選擇標題辨識 PDF',{exact:true}).setInputFiles({name:'synthetic-three-pages.pdf',mimeType:'application/pdf',buffer:pdf});
  await ai.getByRole('button',{name:'辨識全部頁面',exact:true}).tap();await ai.getByLabel('PDF 第 3 頁標題',{exact:true}).waitFor();
  await ai.getByLabel('PDF 第 2 頁標題',{exact:true}).fill('CLOCK TREE 人工確認');
  await ai.getByRole('button',{name:'套用 3 頁',exact:true}).tap();await ai.waitFor({state:'hidden'});
  await tracker.getByRole('button',{name:'儲存頁數進度',exact:true}).tap();await tracker.waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>window.__pdfAiFixture);
  assert.equal(saved.saves,1);assert.equal(saved.tracker.totalPages,4);assert.equal(saved.tracker.pages.length,4);
  assert.deepEqual(saved.tracker.pages.map(({pageNumber,status,note})=>({pageNumber,status,note})),original.pages.map(({pageNumber,status,note})=>({pageNumber,status,note})));
  assert.equal(saved.tracker.pages[0].title,'CPU POWER');assert.equal(saved.tracker.pages[1].title,'CLOCK TREE 人工確認');assert.equal(saved.tracker.pages[3].title,'第4頁必須保留');
  await openTracker(page,width);assert.equal(await tracker.getByRole('textbox',{name:'第 2 頁標題',exact:true}).inputValue(),'CLOCK TREE 人工確認');
  await tracker.getByRole('button',{name:'PDF AI',exact:true}).tap();await ai.waitFor();
  await ai.getByLabel('選擇標題辨識 PDF',{exact:true}).setInputFiles({name:'synthetic-three-pages.pdf',mimeType:'application/pdf',buffer:pdf});
  state.mode='partial';await ai.getByRole('button',{name:'辨識全部頁面',exact:true}).tap();await ai.getByRole('alert').filter({hasText:'頁數不完整'}).waitFor();
  assert.equal(await ai.getByRole('button',{name:'套用 頁',exact:true}).isDisabled(),true);
  assert.equal(await ai.getByRole('textbox',{name:'PDF 第 1 頁標題',exact:true}).count(),0);
  assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),saved.tracker,'Incomplete AI results may not alter tracker');
  state.mode='delay';const before=state.calls.length;await ai.getByRole('button',{name:'辨識全部頁面',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('[data-testid="bom-page-pdf-ai"]')?.textContent.includes('取消辨識'));
  const requestDeadline=Date.now()+10000;while(state.calls.length===before&&Date.now()<requestDeadline)await new Promise(resolve=>setTimeout(resolve,25));
  assert.ok(state.calls.length>before,'Cancellation must be verified after the provider request starts');
  await ai.getByRole('button',{name:'取消辨識',exact:true}).tap();await ai.getByRole('alert').filter({hasText:'已取消'}).waitFor();
  await ai.getByRole('button',{name:'取消',exact:true}).tap();await ai.waitFor({state:'hidden'});await tracker.getByRole('button',{name:'關閉',exact:true}).tap();
  assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),saved.tracker);
  assert.deepEqual(errors,[]);return{width,checks:['actual PDF.js crop/page mapping','editable preview and original-image link','replace PDF/model resets preview','apply and cancel do not persist','explicit save/reopen keeps status/note/page4','partial AI results blocked','in-flight provider cancellation preserves data',...(width<1024?['500px short viewport footer reachable']:[])],cancelledProviderRequests:state.calls.length-before};
 }catch(error){await page.screenshot({path:path.join(evidence,`failure-${width}.png`)});throw error}finally{await context.close()}
}
(async()=>{
 const {createServer}=await import('vite'),mock=path.resolve('tests/support/materialBomPagePdfAiMock.js'),state={mode:'ok',calls:[]},timers=new Set();let server,browser;
 try{
  server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[
   {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/,replacement:mock},
   {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/,replacement:mock},{find:'@',replacement:path.resolve('src')}
  ]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/materialWorkspaceFixture.jsx'],include:['react/jsx-dev-runtime','pdfjs-dist']},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),evidence,fs.realpathSync('node_modules')]}},plugins:[{
   name:'pdf-ai-test-transport',enforce:'pre',resolveId(source,importer){if(source==='./aiProviderTransport'&&importer?.replaceAll('\\','/').endsWith('/api-management/aiUsageTelemetry.ts'))return'\0pdf-ai-test-transport'},load(id){if(id==='\0pdf-ai-test-transport')return'export const fetchAiProvider = async (_provider,_url,init) => fetch("/__qa/provider",init);'},
   configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/materialWorkspaceFixture.jsx"></script></html>');return}
    if(req.url!=='/__qa/provider')return next();let raw='';for await(const chunk of req)raw+=chunk;const payload=JSON.parse(raw);
    const pages=payload.messages.filter(message=>message.role==='user').map(message=>{const text=message.content.find(part=>part.type==='text').text;assert.ok(!text.includes('UPPER LEFT'));const pageNumber=Number(text.match(/實際 PDF 頁碼：(\d+)/)[1]);assert.ok(text.includes(titles[pageNumber-1]));assert.match(message.content.find(part=>part.type==='image_url').image_url.url,/^data:image\/jpeg;base64,/);return{pageNumber,title:titles[pageNumber-1]}});
    state.calls.push({pages:pages.map(row=>row.pageNumber),mode:state.mode});const mode=state.mode;
    const respond=()=>{if(res.destroyed)return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({pages:mode==='partial'?pages.slice(0,-1):pages})}}]}))};
    if(mode==='delay'){const timer=setTimeout(()=>{timers.delete(timer);respond()},5000);timers.add(timer)}else respond();
   })}
  }]});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({channel:'chrome'});const pdf=makePdf(),report=[];
  for(const width of[1440,390,536])report.push(await run(browser,origin,width,state,pdf));
  fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({result:'passed',checks:report,providerRequests:state.calls},null,2));console.log('PDF AI integrated browser flow passed at1440/390/536');
 }finally{for(const timer of timers)clearTimeout(timer);if(browser)await browser.close();if(server)await server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
