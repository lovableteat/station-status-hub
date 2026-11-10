// Integrated UI + real hook/media/export; shared HTTP/SSE data and image bytes stay local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const {createCircuitChangesServer} = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_EVIDENCE_DIR || '../circuit-change-evidence');
const dialog = page => page.getByTestId('circuit-changes-dialog');
const stateOf = async (origin) => (await fetch(origin + '/__circuit/state')).json();

async function createPage(browser, origin, account, width = 1440, height = 960) {
  const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:1, isMobile:width < 1024, hasTouch:width < 1024, reducedMotion:'reduce', locale:'zh-TW', timezoneId:'Asia/Taipei'});
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], navigations = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.goto(origin + '/?qaMainRows&qaPages&qaUser=' + account);
  await page.getByTestId('material-table-card').waitFor();
  if (width < 1024) {
    await page.getByRole('button', {name:'排序與工具', exact:true}).tap();
    await page.getByTestId('material-mobile-tools').waitFor();
  }
  await page.getByTestId('material-circuit-changes').filter({visible:true}).click();
  await dialog(page).waitFor();
  await page.getByRole('heading', {name:'線路修改', exact:true}).waitFor();
  // Problems are marked in 線路 Review (the default task) and fixed / reviewed in 改善追蹤 (see task() below).
  return {context,page,errors,navigations};
}
async function task(page, name) {
  await dialog(page).getByRole('tab', {name:new RegExp('^' + name)}).click();
  await page.waitForFunction(label => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.includes(label), name);
}
async function saved(page) {
  await page.waitForFunction(() => document.querySelector('.circuit-detail-footer [role="status"]')?.textContent === '已儲存');
  await page.getByRole('button', {name:'儲存修改', exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button', {name:'儲存修改', exact:true}).isDisabled(), true);
}
async function status(page, value) {
  await page.waitForFunction(expected => document.querySelector('[data-testid="circuit-change-item"][aria-pressed="true"] .circuit-list-status')?.getAttribute('data-status') === expected, value);
}
async function imageCount(page, expected) {
  await page.waitForFunction(count => [...document.querySelectorAll('.circuit-image-column')].reduce((total, pane) => total + Number(pane.dataset.imageCount || 0), 0) === count, expected);
}
async function upload(page, side, files) {
  const promise = page.waitForEvent('filechooser');
  await page.getByRole('button', {name:`加入${side}`, exact:true}).click();
  await (await promise).setFiles(files);
}
async function checkMobileGeometry(page) {
  return page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}; };
    const panel = document.querySelector('[data-testid="circuit-changes-dialog"]');
    const footer = panel.querySelector('.circuit-detail-footer');
    return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,panel:box(panel),footer:box(footer),buttons:[...footer.querySelectorAll('button')].map(box)};
  });
}

(async () => {
  fs.mkdirSync(evidence,{recursive:true});
  const fixture = createCircuitChangesServer();
  const {createServer} = await import('vite');
  const materialMock = path.resolve('tests/support/materialWorkspaceMock.js');
  const storageMock = path.resolve('tests/support/circuitChangesStorageMock.js');
  const pdfStorageMock = path.resolve('tests/support/circuitChangesPdfStorageMock.js');
  const supabaseMock = path.resolve('tests/support/circuitChangesSupabaseMock.js');
  let server, browser;
  const sessions = [], report = {checks:[],mobile:[],result:'running'};
  try {
    server = await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'vite-cache'),resolve:{alias:[
      {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/,replacement:materialMock},
      {find:'@/integrations/supabase/client',replacement:supabaseMock},
      {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/,replacement:materialMock},
      {find:'@',replacement:path.resolve('src')},
    ]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/circuitChangesFixture.jsx'],include:['react/jsx-dev-runtime','exceljs','pdfjs-dist']},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}},plugins:[
      {name:'circuit-repository-fixture',enforce:'pre',resolveId(source,importer){const own=importer?.replaceAll('\\','/').includes('/circuit-changes/');if(own&&source === './storage')return storageMock;if(own&&source === './pdfStorage')return pdfStorageMock;if(own&&source === './officialPdfStorage')return path.resolve('tests/support/circuitPdfOfficialMock.js');}},
      {name:'circuit-http-fixture',configureServer(vite){vite.middlewares.use(fixture.middleware);vite.middlewares.use((req,res,next)=>{
        if(req.url?.split('?')[0] !== '/')return next();
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; font-src 'self' data:; base-uri 'none'");
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>線路修改隔離驗證</title><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>');
      });}},
    ]});
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({channel:'chrome'});
    const a = await createPage(browser,origin,'A'); sessions.push(a);
    // Nothing recorded yet: the form and both picture targets are there on open, and looking at them writes nothing.
    await a.page.getByRole('textbox',{name:'標題',exact:true}).waitFor();
    assert.ok(await a.page.getByRole('button',{name:'加入問題截圖',exact:true}).isVisible());
    assert.equal(await a.page.getByRole('button',{name:'加入改好後截圖',exact:true}).count(),0,'線路 Review only marks the problem; 改好後截圖 belongs to 改善追蹤');
    assert.equal(await a.page.getByRole('button',{name:'回報改善',exact:true}).count(),0,'線路 Review has no 回報改善');
    await dialog(a.page).getByRole('button',{name:'新增問題',exact:true}).click();
    await dialog(a.page).getByRole('button',{name:'新增問題',exact:true}).click();
    let serverState=await stateOf(origin);
    assert.equal(serverState.sets.length+serverState.items.length,0,'opening the dialog or pressing 新增問題 on an empty form must not leave records');
    report.checks.push('first open is a ready form with visible picture targets and writes nothing');
    await dialog(a.page).getByRole('button',{name:'更多',exact:true}).click();await dialog(a.page).page().getByRole('menuitem',{name:'新增改版清單',exact:true}).click();
    await a.page.getByRole('textbox',{name:'改版紀錄名稱',exact:true}).fill('QA E1.S 線路修改 V1 → V2');
    await a.page.getByRole('textbox',{name:'修改前版次',exact:true}).fill('V1');
    await a.page.getByRole('textbox',{name:'修改後版次',exact:true}).fill('V2');
    await a.page.getByRole('button',{name:'建立清單',exact:true}).click();
    await a.page.getByRole('heading',{name:'新增改版清單',exact:true}).waitFor({state:'hidden'});
    await a.page.getByRole('textbox',{name:'標題',exact:true}).fill('QA R2301 阻值與接法調整');
    await a.page.getByRole('textbox',{name:'Ref',exact:true}).fill('R2301, U2');
    await a.page.getByRole('textbox',{name:'問題說明',exact:true}).fill('Review 要求調整上拉與電源接法');
    await saved(a.page);
    report.checks.push('create batch, stable item number, fields auto-save');
    const pngData = await a.page.evaluate(() => {
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d');
      c.fillStyle='#fff';c.fillRect(0,0,640,360);c.fillStyle='#111';c.font='22px sans-serif';c.fillText('QA CIRCUIT R2301',30,42);
      c.lineWidth=3;c.strokeStyle='#253c42';c.beginPath();c.moveTo(40,180);c.lineTo(180,180);c.lineTo(180,150);c.lineTo(350,150);c.lineTo(350,210);c.lineTo(180,210);c.lineTo(180,180);c.moveTo(350,180);c.lineTo(590,180);c.stroke();c.fillText('4.7K',220,134);c.fillText('VCC',42,166);c.fillText('U2',535,166);return canvas.toDataURL('image/png').split(',')[1];
    });
    const png=Buffer.from(pngData,'base64');fs.writeFileSync(path.join(evidence,'qa-circuit.png'),png);
    const image = name => ({name,mimeType:'image/png',buffer:png});
    await upload(a.page,'問題截圖',Array.from({length:12},()=>image('same.png')));
    await imageCount(a.page,12);await saved(a.page);
    serverState=await stateOf(origin);const firstId=serverState.items[0].id;
    assert.equal(serverState.sets.length,1,'the change went into the batch the user created, not into a second default one');assert.equal(serverState.items.length,1);
    assert.equal(new Set(serverState.items[0].content.images.map(file=>file.path)).size,12,'same filenames must append with unique paths');
    assert.equal(serverState.items[0].content.images.filter(file=>file.side==='before').length,12);
    // The fix is written in 改善追蹤; the problem stays readable there.
    await task(a.page,'改善追蹤');
    assert.equal(await a.page.getByRole('textbox',{name:'標題',exact:true}).count(),0,'改善追蹤 shows the problem as text until 修改問題 is pressed');
    await a.page.getByRole('textbox',{name:'改善說明',exact:true}).fill('R2301 改為 4.7K，保留修改前後圖與逐項確認紀錄');await saved(a.page);
    await upload(a.page,'改好後截圖',[image('fail-once.png')]);
    await a.page.getByRole('button',{name:'重試失敗圖片',exact:true}).waitFor();
    await imageCount(a.page,12);
    await a.page.getByRole('button',{name:'重試失敗圖片',exact:true}).click();
    await imageCount(a.page,13);await saved(a.page);
    report.checks.push('12 same-name originals append in order; partial upload failure retains originals and retry adds only failed file');
    await a.page.getByRole('button',{name:'放大圖片 same.png',exact:true}).first().click();
    const imageViewer=a.page.locator('.circuit-image-viewer-dialog');await imageViewer.waitFor();
    await imageViewer.getByRole('button',{name:'放大圖片',exact:true}).click();
    await imageViewer.getByRole('button',{name:'圖片符合視窗',exact:true}).click();
    const surface=imageViewer.locator('.circuit-image-surface');await surface.locator('img').waitFor();
    await imageViewer.getByRole('button',{name:'位置標記',exact:true}).click();
    const surfaceBox=await surface.boundingBox();
    await a.page.mouse.click(surfaceBox.x+surfaceBox.width*.35,surfaceBox.y+surfaceBox.height*.45);
    await imageViewer.getByRole('textbox',{name:'標記 1 說明',exact:true}).fill('R2301 改為 4.7K');
    await imageViewer.getByRole('button',{name:'框選',exact:true}).click();
    await a.page.mouse.move(surfaceBox.x+surfaceBox.width*.5,surfaceBox.y+surfaceBox.height*.35);await a.page.mouse.down();
    await a.page.mouse.move(surfaceBox.x+surfaceBox.width*.7,surfaceBox.y+surfaceBox.height*.65);await a.page.mouse.up();
    await imageViewer.getByRole('textbox',{name:'標記 2 說明',exact:true}).fill('檢查這段接法');
    await imageViewer.getByRole('textbox',{name:'圖片說明',exact:true}).fill('修改前電路，位置1與框2需要調整');
    await imageViewer.getByRole('button',{name:'關閉圖片',exact:true}).click();await imageViewer.waitFor({state:'hidden'});await saved(a.page);
    serverState=await stateOf(origin);assert.equal(serverState.items[0].content.images.filter(file=>file.marks.length===2).length,1);
    report.checks.push('actual image viewer zoom, pin, box and captions persist separately from original bytes');
    const transfer=(selector,type,options={})=>a.page.evaluate(({selector,type,base64,options})=>{
      const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0)),data=new DataTransfer();
      data.items.add(new File([bytes],options.name||'shot.png',{type:'image/png'}));if(options.text)data.setData('text/plain',options.text);
      const event=type==='paste'?new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}):new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data});
      document.querySelector(selector).dispatchEvent(event);return event.defaultPrevented;
    },{selector,type,base64:pngData,options});
    assert.equal(await transfer('.circuit-image-column[data-side="reference"]','drop',{name:'dropped-reference.png'}),true);
    await imageCount(a.page,14);await saved(a.page);
    serverState=await stateOf(origin);assert.equal(serverState.items[0].content.images.find(file=>file.name==='dropped-reference.png').side,'reference','a drop lands in the pane it was dropped on');
    await a.page.getByRole('textbox',{name:'改善說明',exact:true}).focus();
    assert.equal(await transfer('textarea[aria-label="改善說明"]','paste',{text:'R2301 10K -> 4.7K'}),false,'cell text copied from a spreadsheet is pasted as text, not uploaded as a picture');
    assert.equal(await transfer('[data-ui="scrim"]','dragover'),true,'a file dragged beside the dialog must not make the browser open it');
    await a.page.waitForTimeout(600);await imageCount(a.page,14);
    await a.page.getByRole('button',{name:'移除圖片 dropped-reference.png',exact:true}).click();await imageCount(a.page,13);
    await a.page.getByRole('button',{name:'復原',exact:true}).click();await imageCount(a.page,14);
    await a.page.getByRole('button',{name:'移除圖片 dropped-reference.png',exact:true}).click();await imageCount(a.page,13);await saved(a.page);
    report.checks.push('drop targets the pane under the pointer, spreadsheet text is not hijacked, stray drops are neutralised, image removal can be undone');
    const b=await createPage(browser,origin,'B');sessions.push(b);
    await b.page.getByRole('textbox',{name:'標題',exact:true}).waitFor();
    assert.equal(await b.page.getByRole('textbox',{name:'標題',exact:true}).inputValue(),'QA R2301 阻值與接法調整');
    await task(b.page,'改善追蹤');
    const aNav=a.navigations.length,bNav=b.navigations.length;
    await a.page.getByRole('button',{name:'回報改善',exact:true}).click();await status(a.page,'in_review');await status(b.page,'in_review');
    await b.page.getByRole('textbox',{name:'主管意見或退回原因',exact:true}).fill('請補修改後接法及上拉阻值的依據');
    await b.page.getByRole('button',{name:'退回重改',exact:true}).click();await status(b.page,'needs_changes');await status(a.page,'needs_changes');
    await a.page.getByRole('textbox',{name:'改善說明',exact:true}).fill('已補修改後接法，R2301 4.7K 依最新設計確認');await saved(a.page);await status(a.page,'draft');
    await a.page.getByRole('button',{name:'回報改善',exact:true}).click();await status(b.page,'in_review');
    await b.page.getByRole('button',{name:'確認結案',exact:true}).click();await status(b.page,'approved');await status(a.page,'approved');
    // An approved change is locked; editing it is a deliberate step and starts a new revision that needs review again.
    assert.equal(await a.page.getByRole('textbox',{name:'改善說明',exact:true}).isDisabled(),true);
    await a.page.getByRole('button',{name:'修改內容',exact:true}).click();
    await a.page.getByRole('button',{name:'修改問題',exact:true}).click();
    await a.page.getByRole('textbox',{name:'標題',exact:true}).fill('QA R2301 新修訂需要再次 Review');await saved(a.page);await status(a.page,'draft');await status(b.page,'draft');
    assert.equal(a.navigations.length,aNav);assert.equal(b.navigations.length,bNav);
    report.checks.push('two-editor shared review: submit, return with reason, revise, resubmit, approve; editing approved content resets draft without navigation');
    const historyButton=a.page.getByRole('button',{name:/^追蹤紀錄 \d+$/});
    if(await historyButton.getAttribute('aria-pressed')!=='true') await historyButton.click();
    const approved=a.page.locator('.circuit-history article').filter({hasText:/· 確認結案/}).first();
    await approved.getByRole('button',{name:'查看此修訂',exact:true}).click();
    await a.page.getByText(/正在查看修訂/).waitFor();
    assert.equal(await a.page.getByRole('textbox',{name:'標題',exact:true}).inputValue(),'QA R2301 阻值與接法調整');
    assert.equal(await a.page.getByRole('textbox',{name:'標題',exact:true}).isDisabled(),true);
    await a.page.getByRole('button',{name:'返回目前修訂',exact:true}).click();
    assert.equal(await a.page.getByRole('textbox',{name:'標題',exact:true}).inputValue(),'QA R2301 新修訂需要再次 Review');
    await fetch(origin+'/__circuit/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'conflict_next_save',itemId:firstId})});
    await a.page.getByRole('textbox',{name:'問題說明',exact:true}).fill('QA CAS conflict draft must remain');
    await a.page.getByRole('button',{name:'儲存我的修訂',exact:true}).waitFor();
    assert.equal(await a.page.getByRole('textbox',{name:'問題說明',exact:true}).inputValue(),'QA CAS conflict draft must remain');
    await a.page.getByRole('button',{name:'儲存我的修訂',exact:true}).click();await saved(a.page);
    report.checks.push('immutable approved revision can be viewed; forced HTTP409 preserves draft until explicit save-my-revision');
    const originalPromise=a.page.waitForEvent('download');
    await a.page.getByRole('button',{name:'下載原圖 same.png',exact:true}).first().click();
    const original=await originalPromise;await original.saveAs(path.join(evidence,'downloaded-original.png'));
    assert.ok(fs.readFileSync(path.join(evidence,'downloaded-original.png')).equals(png));
    assert.equal(await dialog(a.page).getByRole('button',{name:'新增問題',exact:true}).count(),0,'new problems are marked in 線路 Review');
    await task(a.page,'線路 Review');
    await dialog(a.page).getByRole('button',{name:'新增問題',exact:true}).click();
    await a.page.getByRole('textbox',{name:'標題',exact:true}).fill('QA 第二項修改也必須匯出');await saved(a.page);
    await task(a.page,'改善追蹤');
    await a.page.getByRole('textbox',{name:'改善說明',exact:true}).fill('Change List 不能只匯出選中的一項');await saved(a.page);
    await a.page.getByRole('textbox',{name:'搜尋線路修改',exact:true}).fill('第二項');
    await a.page.getByTestId('circuit-active-filters').waitFor();assert.equal(await a.page.getByTestId('circuit-change-item').count(),1);
    assert.ok(new URL(a.page.url()).searchParams.get('circuitQuery').includes('第二項'));
    await a.page.getByTestId('circuit-active-filters').getByRole('button',{name:'全部清除',exact:true}).click();
    assert.equal(await a.page.getByTestId('circuit-change-item').count(),2);
    const excelPromise=a.page.waitForEvent('download');
    await a.page.getByRole('button',{name:'匯出 Change List',exact:true}).click();
    const excel=await excelPromise;const excelPath=path.join(evidence,'change-list.xlsx');await excel.saveAs(excelPath);
    const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.readFile(excelPath);
    let embedded=0;const texts=[];
    for(const sheet of book.worksheets){embedded+=sheet.getImages().length;sheet.eachRow(row=>row.eachCell(cell=>texts.push(String(cell.text||''))));}
    assert.ok(embedded>=13,`all 13 current originals must appear as exported previews, got ${embedded}`);
    assert.ok(texts.some(value=>value.includes('QA 第二項修改也必須匯出')));
    assert.ok(texts.some(value=>value.includes('請補修改後接法及上拉阻值的依據')));
    report.export={worksheets:book.worksheets.map(sheet=>sheet.name),images:embedded};
    report.checks.push('original bytes download unchanged; Excel includes all filtered items, all current images and reviewer history');
    for(const width of[390,536]){
      const mobile=await createPage(browser,origin,'A',width,884);sessions.push(mobile);
      await mobile.page.getByTestId('circuit-change-item').first().tap();
      await mobile.page.getByRole('textbox',{name:'標題',exact:true}).waitFor();
      const geometry=await checkMobileGeometry(mobile.page);
      assert.equal(geometry.width,geometry.pageWidth);assert.ok(geometry.panel.w<=width);assert.ok(geometry.footer.bottom<=geometry.height+1);assert.ok(geometry.buttons.every(box=>box.h>=40));report.mobile.push(geometry);
      await mobile.page.screenshot({path:path.join(evidence,`mobile-${width}.png`)});
      if(width===390){await mobile.page.setViewportSize({width:390,height:500});await task(mobile.page,'改善追蹤');await mobile.page.getByRole('textbox',{name:'改善說明',exact:true}).focus();const short=await checkMobileGeometry(mobile.page);assert.ok(short.footer.bottom<=501);report.shortViewport=short;await mobile.page.setViewportSize({width:390,height:884});}
      await mobile.page.getByRole('button',{name:'關閉線路修改',exact:true}).tap();await dialog(mobile.page).waitFor({state:'hidden'});
    }
    const viewer=await createPage(browser,origin,'view',390,884);sessions.push(viewer);
    await viewer.page.getByTestId('circuit-change-item').first().tap();
    assert.equal(await dialog(viewer.page).getByRole('button',{name:'新增問題',exact:true}).count(),0);
    assert.equal(await viewer.page.getByRole('textbox',{name:'標題',exact:true}).isDisabled(),true);
    assert.equal(await viewer.page.getByRole('button',{name:'回報改善',exact:true}).count(),0);
    await a.page.screenshot({path:path.join(evidence,'desktop.png')});
    for(const session of sessions)assert.deepEqual(session.errors,[]);
    report.checks.push('390/536 mobile entry/detail/back and pinned footer, 500px short viewport, readonly viewer has no write controls');
    report.result='passed';report.state=await stateOf(origin);console.log('Circuit changes integrated browser workflow passed');
  }catch(error){report.result='failed';report.error=error.stack;for(let index=0;index<sessions.length;index++)await sessions[index].page.screenshot({path:path.join(evidence,`failure-${index}.png`)}).catch(()=>{});throw error;}
  finally{fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));for(const session of sessions)await session.context.close().catch(()=>{});if(browser)await browser.close();fixture.close();if(server)await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
