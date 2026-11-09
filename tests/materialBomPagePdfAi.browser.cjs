// Actual PDF.js rendering, service, provider request builder and dialog; no paid calls or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { jsPDF } = require('jspdf');
const evidence = path.resolve(process.env.PDF_AI_EVIDENCE_DIR || '../pdf-ai-fixes-evidence');
fs.mkdirSync(evidence, { recursive: true });
const titles = ['CPU POWER', 'CLOCK TREE', 'RESET CONTROL'];
const longTitles = Array.from({ length: 500 }, (_, index) => `PAGE ${String(index + 1).padStart(3, '0')} POWER`);
function makePdf(pageTitles) {
  const pdf = new jsPDF({ unit: 'pt', format: [600, 400], orientation: 'landscape' });
  pageTitles.forEach((title, index) => {
    if (index) pdf.addPage([600, 400], 'landscape');
    pdf.setFontSize(12); pdf.setTextColor(0); pdf.text('UPPER LEFT MUST NOT BE SENT', 20, 25);
    pdf.setFontSize(7); pdf.setTextColor(0, 0, 255); pdf.text('NEARBY SCHEMATIC MUST NOT BE SENT', 330, 300);
    pdf.setDrawColor(0); pdf.setLineWidth(.4); pdf.rect(472, 352, 120, 40);
    pdf.setTextColor(0); pdf.setFontSize(4);
    pdf.text('NVIDIA Engineering', 476, 361);
    pdf.text('Title: ' + title, 476, 374);
    pdf.text('Doc QA0001 / Rev B / Sheet ' + (index + 1), 476, 387);
  });
  return Buffer.from(pdf.output('arraybuffer'));
}
const trackerDialog = page => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '頁數進度', exact: true }) });
async function openTracker(page, width) {
  if (width < 1024) {
    await page.getByRole('button', { name: '排序與工具', exact: true }).tap();
    await page.getByTestId('material-mobile-tools').getByRole('button', { name: '頁數進度', exact: true }).tap();
  } else await page.getByRole('button', { name: /已完成.*頁/ }).click();
  const tracker = trackerDialog(page); await tracker.waitFor(); return tracker;
}
async function openAi(tracker, page) {
  await tracker.getByRole('button', { name: 'PDF AI', exact: true }).tap();
  const ai = page.getByTestId('bom-page-pdf-ai'); await ai.waitFor();
  await ai.getByRole('combobox', { name: 'PDF AI 服務', exact: true }).selectOption('pdf-qa-model');
  return ai;
}
async function choosePdf(ai, pdf, name = 'synthetic-three-pages.pdf', count = 3) {
  const chooserPromise=ai.page().waitForEvent('filechooser'); await ai.getByRole('button',{name:/^(選擇 PDF|更換 PDF)$/}).tap(); const chooser=await chooserPromise; await chooser.setFiles({ name, mimeType: 'application/pdf', buffer: pdf });
  await ai.getByTestId('bom-pdf-selected-file').filter({ hasText: name }).waitFor();
  assert.ok((await ai.getByTestId('bom-pdf-selected-file').innerText()).includes(name));
  await ai.getByAltText('第 1 頁右下角標題原圖', { exact: true }).waitFor();
  await ai.getByRole('button', { name: '辨識全部頁面', exact: true }).waitFor();
  assert.equal(await ai.getByRole('button', { name: '辨識全部頁面', exact: true }).isEnabled(), true);
  assert.ok((await ai.innerText()).includes(`實際 PDF 共 ${count} 頁`), 'Physical page count must be shown before AI starts');
}
async function assertPreview(ai, pageNumber) {
  const image = ai.getByAltText(`第 ${pageNumber} 頁右下角標題原圖`, { exact: true }); await image.waitFor();
  await image.evaluate(img => img.decode());
  const measured = await image.evaluate(img => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0, dark = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 2] > 140 && pixels[index] < 100 && pixels[index + 1] < 100) blue++;
      if (pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100) dark++;
    }
    const box = img.getBoundingClientRect();
    return { width: img.naturalWidth, height: img.naturalHeight, blue, dark, displayRatio: box.width / box.height, objectFit: getComputedStyle(img).objectFit };
  });
  assert.ok(measured.width >= 1000 && measured.height > 0, JSON.stringify(measured));
  assert.ok(measured.width / measured.height > 1.8, 'Tiny title block should fill a landscape crop instead of a tall blank corner');
  assert.equal(measured.blue, 0, 'Nearby blue schematic text must be outside the title crop');
  assert.ok(measured.dark > 1000, 'Title block must retain visible high-resolution ink');
  assert.ok((measured.objectFit === 'contain' || Math.abs(measured.displayRatio - measured.width / measured.height) < .05), 'Preview must preserve the PDF crop aspect ratio');
  return measured;
}
async function showPane(ai, name) { const control=ai.getByRole('button',{name:name==='標題清單'?/^標題清單/:name,exact:true}); if(await control.isVisible()) await control.tap(); }
async function assertViewport(page, ai, height) {
  const box = await ai.boundingBox(); assert.ok(box && box.y >= -1 && box.y + box.height <= height + 1, JSON.stringify(box));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  for (const name of ['取消', '套用 3 頁']) {
    const button = ai.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox(); assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height + 1, `${name}: ${JSON.stringify(bounds)}`);
  }
}
async function runRegular(browser, origin, width, height, state, pdf) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 1024, hasTouch: true, reducedMotion: 'reduce', locale: 'zh-TW' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000);
  try {
    state.mode = 'ok'; state.expectedTitles = titles;
    await page.goto(origin + '/?qaMainRows&qaPages'); await page.getByTestId('material-table-card').waitFor();
    const tracker = await openTracker(page, width), original = await page.evaluate(() => structuredClone(window.__pdfAiFixture.tracker));
    const ai = await openAi(tracker, page), before = state.calls.length;
    await choosePdf(ai, pdf); assert.equal(state.calls.length, before, 'Selecting a PDF must preview it without an AI call');
    const crop = await assertPreview(ai, 1);
    if (width===1440) {
      const bytes=await ai.getByAltText('第 1 頁右下角標題原圖',{exact:true}).evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))); fs.writeFileSync(path.join(evidence,'tiny-titleblock-crop.png'),Buffer.from(bytes));
      const popupPromise=page.waitForEvent('popup'); await ai.locator('a[href^="blob:"]').filter({visible:true}).first().tap(); const popup=await popupPromise; await popup.waitForLoadState('domcontentloaded'); assert.ok(await popup.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth>=1000})); await popup.close();
    }
    await page.screenshot({ path: path.join(evidence, `selected-${width}.png`) });
    const currentImage=()=>ai.getByAltText('第 1 頁右下角標題原圖',{exact:true});
    await ai.getByRole('button',{name:'放大截圖',exact:true}).tap(); assert.equal(await currentImage().evaluate(img=>img.style.width),'150%');
    await ai.getByRole('button',{name:'縮小截圖',exact:true}).tap(); assert.equal(await currentImage().evaluate(img=>img.style.width),'100%');
    await ai.getByRole('button',{name:'放大截圖',exact:true}).tap(); await ai.getByRole('button',{name:'符合寬度',exact:true}).tap(); assert.equal(await currentImage().evaluate(img=>img.style.width),'100%');
    await ai.getByRole('button',{name:'下一個 PDF 頁面',exact:true}).tap(); await assertPreview(ai,2);
    await ai.getByRole('button',{name:'上一個 PDF 頁面',exact:true}).tap(); await assertPreview(ai,1);
    assert.equal(state.calls.length,before,'Page previews and zoom must not call AI');
    await choosePdf(ai,pdf,'synthetic-reselected-three-pages.pdf'); assert.equal(state.calls.length,before,'Replacing a selected PDF must not call AI');
    await ai.getByRole('button', { name: '辨識全部頁面', exact: true }).tap();
    await ai.getByLabel('PDF 第 3 頁標題', { exact: true }).waitFor();
    for (let index = 0; index < titles.length; index++) assert.equal(await ai.getByLabel(`PDF 第 ${index + 1} 頁標題`, { exact: true }).inputValue(), titles[index]);
    assert.deepEqual(await page.evaluate(() => window.__pdfAiFixture.tracker), original);
    const models=ai.getByRole('combobox',{name:'PDF AI 服務',exact:true}); await models.selectOption('pdf-qa-model-2'); assert.equal(await models.inputValue(),'pdf-qa-model-2'); await models.selectOption('pdf-qa-model');
    await ai.getByRole('button', { name: '預覽 PDF 第 3 頁', exact: true }).tap(); await assertPreview(ai, 3);
    if(width<768) assert.equal(await ai.getByRole('button',{name:'截圖預覽',exact:true}).getAttribute('aria-pressed'),'true','Clicking a page must open its image automatically on phone');
    const source3 = await ai.getByAltText('第 3 頁右下角標題原圖', { exact:true }).getAttribute('src');
    await showPane(ai, '標題清單');
    await ai.getByRole('button', { name: '預覽 PDF 第 1 頁', exact: true }).tap(); await assertPreview(ai, 1);
    assert.notEqual(await ai.getByAltText('第 1 頁右下角標題原圖', { exact:true }).getAttribute('src'), source3, 'Changing selected page must change the displayed crop');
    await showPane(ai, '標題清單');
    await ai.getByLabel('PDF 第 2 頁標題', { exact: true }).fill('CLOCK TREE 人工確認');
    if(width<768) assert.equal(await ai.getByRole('button',{name:/^標題清單/}).getAttribute('aria-pressed'),'true','Editing a title must keep the editable list open');
    await showPane(ai, '截圖預覽'); await assertPreview(ai, 2);
    await assertViewport(page, ai, height); await page.screenshot({ path: path.join(evidence, `preview-${width}.png`) });
    if (width < 1024) {
      await page.setViewportSize({ width, height: 500 }); await page.locator('[data-testid="bom-page-pdf-ai"][data-compact="true"]').waitFor(); await assertViewport(page, ai, 500);
      const usablePreview=await ai.locator('.bom-pdf-preview-scroll').evaluate(area=>{const outer=area.getBoundingClientRect(),image=area.querySelector('img')?.getBoundingClientRect();return{height:area.clientHeight,visibleImageHeight:image?Math.max(0,Math.min(outer.bottom,image.bottom)-Math.max(outer.top,image.top)):0};});
      assert.ok(usablePreview.height>=80 && usablePreview.visibleImageHeight>=64,'Short viewport must retain a usable image, not only a visible footer: '+JSON.stringify(usablePreview));
      await page.screenshot({ path: path.join(evidence, `short-${width}.png`) }); await page.setViewportSize({ width, height });
    }
    await ai.getByRole('button', { name: '套用 3 頁', exact: true }).tap(); await ai.waitFor({ state: 'hidden' });
    assert.equal(await tracker.getByLabel('總頁數', { exact: true }).inputValue(), '4');
    assert.equal(await tracker.getByLabel('目前做到第幾頁', { exact: true }).inputValue(), '3');
    assert.equal(await tracker.getByRole('textbox', { name: '第 4 頁標題', exact: true }).inputValue(), '第4頁必須保留');
    assert.deepEqual(await page.evaluate(() => window.__pdfAiFixture.tracker), original, 'Apply modifies only the outer draft');
    if (width === 1440) {
      await tracker.getByRole('button', { name: '儲存頁數進度', exact: true }).tap(); await tracker.waitFor({ state: 'hidden' });
      const saved = await page.evaluate(() => window.__pdfAiFixture); assert.equal(saved.saves, 1);
      assert.deepEqual(saved.tracker.pages.map(({ pageNumber, status, note }) => ({ pageNumber, status, note })), original.pages.map(({ pageNumber, status, note }) => ({ pageNumber, status, note })));
      assert.equal(saved.tracker.pages[1].title, 'CLOCK TREE 人工確認');
      await openTracker(page, width); assert.equal(await tracker.getByRole('textbox', { name: '第 2 頁標題', exact: true }).inputValue(), 'CLOCK TREE 人工確認');
      const reopened = await openAi(tracker, page); await choosePdf(reopened, pdf);
      state.mode = 'partial'; await reopened.getByRole('button', { name: '辨識全部頁面', exact: true }).tap(); await reopened.getByRole('alert').filter({ hasText: '頁數不完整' }).waitFor();
      assert.equal(await reopened.getByRole('textbox', { name: 'PDF 第 1 頁標題', exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__pdfAiFixture.tracker), saved.tracker);
      state.mode = 'delay'; const callsBefore = state.calls.length;
      await reopened.getByRole('button', { name: '辨識全部頁面', exact: true }).tap();
      const deadline = Date.now() + 10000; while (state.calls.length === callsBefore && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      assert.ok(state.calls.length > callsBefore, 'Cancel must happen after the provider request starts');
      await reopened.getByRole('button', { name: '取消辨識', exact: true }).tap(); await reopened.getByRole('alert').filter({ hasText: '已取消' }).waitFor();
      await reopened.getByRole('button', { name: '取消', exact: true }).tap(); await reopened.waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => window.__pdfAiFixture.tracker), saved.tracker);
    }
    await tracker.getByRole('button', { name: '關閉', exact: true }).tap(); await tracker.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    return { width, height, crop, checks: ['selected filename and actual PDF preview before AI', 'tight lossless crop excludes neighboring schematic text', 'actual page selection and editable titles', 'dialog and footer inside viewport', 'apply preserves saved progress and later pages', ...(width === 1440 ? ['explicit save/reopen', 'incomplete response blocked', 'in-flight cancellation'] : ['outer cancel keeps saved tracker']), ...(width < 1024 ? ['500px short viewport reachable'] : [])] };
  } catch (error) { await page.screenshot({ path: path.join(evidence, `failure-${width}.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
async function run500(browser, origin, state, pdf) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 884 }, hasTouch: true, reducedMotion: 'reduce', locale: 'zh-TW' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000);
  try {
    state.mode = 'ok'; state.expectedTitles = longTitles; const before = state.calls.length;
    await page.goto(origin + '/?qaMainRows&qaPages'); await page.getByTestId('material-table-card').waitFor();
    const tracker = await openTracker(page, 1440), original = await page.evaluate(() => structuredClone(window.__pdfAiFixture.tracker));
    const ai = await openAi(tracker, page); await choosePdf(ai, pdf, 'synthetic-full-500-pages.pdf', 500);
    assert.equal(state.calls.length, before);
    const started = Date.now(); await ai.getByRole('button', { name: '辨識全部頁面', exact: true }).tap();
    const apply = ai.getByRole('button', { name: '套用 500 頁', exact: true }); await apply.waitFor({ timeout: 240000 });
    assert.equal(await apply.isEnabled(), true);
    const calls = state.calls.slice(before), sent = calls.flatMap(call => call.pages);
    assert.deepEqual(sent, Array.from({ length: 500 }, (_, index) => index + 1)); assert.equal(calls.length, 63); assert.equal(calls.at(-1).pages.length, 4);
    const jump = ai.getByLabel('跳至 PDF 頁碼', { exact: true }); await jump.fill('500');
    await ai.getByRole('button', { name: '前往頁面', exact: true }).tap(); await assertPreview(ai, 500);
    const last = ai.getByRole('textbox', { name: 'PDF 第 500 頁標題', exact: true }); assert.equal(await last.inputValue(), longTitles[499]);
    assert.equal(await last.isVisible(), true); const list = ai.getByTestId('bom-pdf-title-list'), listTop = await list.evaluate(element => element.scrollTop);
    const lastBox=await last.boundingBox(), listBox=await list.boundingBox(); assert.ok(lastBox && listBox && lastBox.y>=listBox.y-1 && lastBox.y+lastBox.height<=listBox.y+listBox.height+1, 'Jump500 must reveal its row inside the list');
    await last.focus(); await page.waitForTimeout(100); assert.ok(Math.abs(await list.evaluate(element => element.scrollTop) - listTop) < 2, 'Focusing a selected title must not jump the list');
    await page.screenshot({ path: path.join(evidence, 'full-500-last-page.png') });
    await apply.tap(); await ai.waitFor({ state: 'hidden' });
    assert.equal(await tracker.getByLabel('總頁數', { exact: true }).inputValue(), '500');
    await tracker.getByRole('button', { name: '儲存頁數進度', exact: true }).tap(); await tracker.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => window.__pdfAiFixture.tracker);
    assert.equal(saved.totalPages, 500); assert.equal(saved.pages.length, 500); assert.equal(saved.pages[499].title, longTitles[499]);
    assert.deepEqual(saved.pages.slice(0, 4).map(({ pageNumber, status, note }) => ({ pageNumber, status, note })), original.pages.map(({ pageNumber, status, note }) => ({ pageNumber, status, note })));
    assert.deepEqual(errors, []);
    return { pages: 500, batches: calls.length, lastBatchPages: calls.at(-1).pages, elapsedMs: Date.now() - started, checks: ['all500 physical pages processed exactly once', 'last page jump updates preview and keeps list stable', 'all500 titles persisted', 'existing statuses and notes retained'] };
  } catch (error) { await page.screenshot({ path: path.join(evidence, 'failure-500.png') }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
async function runActualPreview(browser, origin, state, filePath) {
  const context=await browser.newContext({viewport:{width:1440,height:884},hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.setDefaultTimeout(60000);
  try {
    const before=state.calls.length, started=Date.now(); await page.goto(origin+'/?qaMainRows&qaPages'); await page.getByTestId('material-table-card').waitFor();
    const tracker=await openTracker(page,1440), original=await page.evaluate(()=>structuredClone(window.__pdfAiFixture.tracker));
    const ai=await openAi(tracker,page), chooserPromise=page.waitForEvent('filechooser'); await ai.getByRole('button',{name:'選擇 PDF',exact:true}).tap(); const chooser=await chooserPromise; await chooser.setFiles(filePath);
    await ai.getByTestId('bom-pdf-selected-file').filter({hasText:path.basename(filePath)}).waitFor();
    const first=ai.getByAltText('第 1 頁右下角標題原圖',{exact:true}); await first.waitFor(); await first.evaluate(img=>img.decode());
    const count=Number((await ai.getByTestId('bom-pdf-selected-file').innerText()).match(/實際\s*(\d+)\s*頁/)[1]); assert.ok(count>0&&count<=500);
    const pages=[1,...(count>=11?[11]:[])], crops=[]; let source1='';
    for(const number of pages){
      if(number!==1){await ai.getByLabel('跳至 PDF 頁碼',{exact:true}).fill(String(number));await ai.getByRole('button',{name:'前往頁面',exact:true}).tap();}
      const image=ai.getByAltText('第 '+number+' 頁右下角標題原圖',{exact:true});await image.waitFor();await image.evaluate(img=>img.decode());
      const measured=await image.evaluate(async img=>({width:img.naturalWidth,height:img.naturalHeight,src:img.src,bytes:Array.from(new Uint8Array(await(await fetch(img.src)).arrayBuffer()))}));
      assert.ok(measured.width>=1000&&measured.height>0);if(number===1)source1=measured.src;else assert.notEqual(measured.src,source1);
      fs.writeFileSync(path.join(evidence,'actual-page-'+number+'-crop.png'),Buffer.from(measured.bytes));await page.screenshot({path:path.join(evidence,'actual-page-'+number+'-preview.png')});
      crops.push({pageNumber:number,width:measured.width,height:measured.height});
    }
    assert.equal(state.calls.length,before,'Actual user PDF must never be sent to the mocked or paid AI transport');assert.deepEqual(await page.evaluate(()=>window.__pdfAiFixture.tracker),original);assert.equal(await page.evaluate(()=>window.__pdfAiFixture.saves),0);
    await ai.getByRole('button',{name:'關閉 PDF AI',exact:true}).tap();await ai.waitFor({state:'hidden'});await tracker.getByRole('button',{name:'關閉',exact:true}).tap();assert.deepEqual(errors,[]);
    return{file:path.basename(filePath),physicalPages:count,crops,providerCalls:state.calls.length-before,savedWrites:0,elapsedMs:Date.now()-started};
  }catch(error){await page.screenshot({path:path.join(evidence,'failure-actual-preview.png')}).catch(()=>{});throw error;}finally{await context.close();}
}
(async () => {
  const { createServer } = await import('vite'), mock = path.resolve('tests/support/materialBomPagePdfAiMock.js');
  const state = { mode: 'ok', expectedTitles: titles, calls: [] }, timers = new Set(), report = { result: 'running', checks: [] }; let server, browser;
  try {
    server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, '.vite'), resolve: { alias: [
      { find: /^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/, replacement: mock },
      { find: /^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement: mock }, { find: '@', replacement: path.resolve('src') },
    ] }, worker: { format: 'es' }, optimizeDeps: { entries: ['tests/support/materialWorkspaceFixture.jsx'], include: ['react/jsx-dev-runtime', 'pdfjs-dist'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), evidence, fs.realpathSync('node_modules')] } }, plugins: [{
      name: 'pdf-ai-test-transport', enforce: 'pre', resolveId(source, importer) { if (source === './aiProviderTransport' && importer?.replaceAll('\\', '/').endsWith('/api-management/aiUsageTelemetry.ts')) return '\0pdf-ai-test-transport'; },
      load(id) { if (id === '\0pdf-ai-test-transport') return 'export const fetchAiProvider = async (_provider,_url,init) => fetch("/__qa/provider",init);'; },
      configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/materialWorkspaceFixture.jsx"></script></html>'); return; }
        if (req.url !== '/__qa/provider') return next();
        let raw = ''; for await (const chunk of req) raw += chunk; const payload = JSON.parse(raw);
        const pages = payload.messages.filter(message => message.role === 'user').map(message => {
          const text = message.content.find(part => part.type === 'text').text; assert.ok(!text.includes('UPPER LEFT')); assert.ok(!text.includes('NEARBY SCHEMATIC'));
          const pageNumber = Number(text.match(/實際 PDF 頁碼：(\d+)/)[1]), title = state.expectedTitles[pageNumber - 1]; assert.ok(title && text.includes(title), text);
          assert.match(message.content.find(part => part.type === 'image_url').image_url.url, /^data:image\/(?:png|jpeg);base64,/);
          return { pageNumber, title };
        });
        state.calls.push({ pages: pages.map(row => row.pageNumber), mode: state.mode }); const mode = state.mode;
        const respond = () => { if (res.destroyed) return; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ pages: mode === 'partial' ? pages.slice(0, -1) : pages }) } }] })); };
        if (mode === 'delay') { const timer = setTimeout(() => { timers.delete(timer); respond(); }, 5000); timers.add(timer); } else respond();
      }); },
    }] });
    await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port; browser = await chromium.launch({ channel: 'chrome' });
    const pdf = makePdf(titles), full = makePdf(longTitles); fs.writeFileSync(path.join(evidence, 'synthetic-tiny-titleblock.pdf'), pdf); fs.writeFileSync(path.join(evidence, 'synthetic-full-500-pages.pdf'), full);
    if(process.env.PDF_AI_ACTUAL_FILE) report.actualPreview=await runActualPreview(browser,origin,state,process.env.PDF_AI_ACTUAL_FILE);
    else {
      for (const [width, height] of [[1440, 884], [780, 825], [390, 884], [536, 884]]) report.checks.push(await runRegular(browser, origin, width, height, state, pdf));
      if(!process.env.PDF_AI_SKIP_500) report.full500 = await run500(browser, origin, state, full); else report.full500Skipped='layout-only confirmation; complete500-page result retained in prior browser-report';
    } report.result = 'passed'; report.providerRequests = state.calls;
    console.log(process.env.PDF_AI_ACTUAL_FILE?'Actual user PDF preview-only flow passed without provider calls':process.env.PDF_AI_SKIP_500?'PDF AI layout-only confirmation passed at1440/780/390/536':'PDF AI layout, file selection, crop and complete500-page browser flows passed');
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { report.providerRequests=state.calls; fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); for (const timer of timers) clearTimeout(timer); if (browser) await browser.close(); if (server) await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
