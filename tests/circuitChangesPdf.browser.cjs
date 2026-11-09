// 線路修改 PDF 圖面 in Chrome: dated versions, page by page framing into a change, comparison, progress across days,
// two editors and a viewer at once, a PDF over the server limit, and the phone layout. All data stays in the local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {jsPDF} = require('jspdf');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const {createCircuitChangesServer} = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_EVIDENCE_DIR || '../circuit-change-evidence', 'pdf');
const dialog = page => page.getByTestId('circuit-changes-dialog');
const panel = page => page.getByTestId('circuit-pdf-panel');
const stateOf = async origin => (await fetch(origin + '/__circuit/state')).json();
const control = (origin, body) => fetch(origin + '/__circuit/control', {method:'POST', body:JSON.stringify(body)});
const registryOf = async origin => Object.values((await stateOf(origin)).pdfRegistries)[0];

// Twelve A3 sheets; sheet 5 changes R2301 and its net between the two drawing dates.
function schematic(changed) {
  const pdf = new jsPDF({unit:'pt', format:[1190, 842], orientation:'landscape'});
  for (let sheet = 1; sheet <= 12; sheet++) {
    if (sheet > 1) pdf.addPage([1190, 842], 'landscape');
    pdf.setDrawColor(40); pdf.setLineWidth(1.2); pdf.rect(20, 20, 1150, 802);
    pdf.setFontSize(10); pdf.text(`Vera CPU Rack Sheet ${sheet} of 12 ${changed ? 'Rev B 2026-11-09' : 'Rev A 2026-11-08'}`, 880, 790);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) { const x = 90 + col * 170, y = 90 + row * 150; pdf.rect(x, y, 70, 40); pdf.line(x + 70, y + 20, x + 150, y + 20); }
    if (sheet === 5) { pdf.setFontSize(9); pdf.rect(420, 400, 40, 14); pdf.text(changed ? 'R2301 4.7K  P12V_VR_EN' : 'R2301 10K  P12V_EN', 420, 395); if (changed) pdf.line(460, 407, 560, 470); }
  }
  return Buffer.from(pdf.output('arraybuffer'));
}

async function createPage(browser, origin, account, width = 1440, height = 960) {
  const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:1, isMobile:width < 1024, hasTouch:width < 1024, reducedMotion:'reduce', locale:'zh-TW', timezoneId:'Asia/Taipei'});
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const open = async () => {
    await page.goto(origin + '/?qaMainRows&qaPages&qaUser=' + account);
    await page.getByTestId('material-table-card').waitFor();
    if (width < 1024) { await page.getByRole('button', {name:'排序與工具', exact:true}).tap(); await page.getByTestId('material-mobile-tools').waitFor(); }
    await page.getByTestId('material-circuit-changes').filter({visible:true}).click();
    await dialog(page).waitFor();
  };
  await open();
  return {context, page, errors, open};
}
async function rendered(page) {
  await page.waitForFunction(() => { const pages = [...document.querySelectorAll('.circuit-pdf-surface')]; return pages.length > 0 && pages.every(node => node.dataset.rendering === 'false'); });
}
async function frame(page, index = 0, from = [400 / 1190, 380 / 842], to = [590 / 1190, 480 / 842]) {
  const surface = panel(page).locator('.circuit-pdf-surface').nth(index);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]); await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], {steps:5}); await page.mouse.up();
  await panel(page).getByRole('group', {name:'加入框選區域'}).waitFor();
}
const pageNumber = page => panel(page).getByLabel('目前頁碼', {exact:true}).inputValue();
const versionLabel = async page => (await panel(page).locator('.circuit-pdf-version-button > small').innerText()).split(' · ')[0];
async function onPage(page, value) { await page.waitForFunction(expected => document.querySelector('input[aria-label="目前頁碼"]')?.value === String(expected), value); }
async function saved(page) { await page.waitForFunction(() => document.querySelector('.circuit-detail-footer [role="status"]')?.textContent === '已儲存'); }
async function imageCount(page, side, count) { await page.waitForFunction(([key, expected]) => Number(document.querySelector(`.circuit-image-column[data-side="${key}"]`)?.dataset.imageCount || 0) === expected, [side, count]); }
async function eventually(check, message, timeout = 8000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await check(); if (last) return last; } catch (error) { last = error; } await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error(`${message}${last instanceof Error ? `: ${last.message}` : ''}`);
}

(async () => {
  fs.mkdirSync(evidence, {recursive:true});
  const older = path.join(evidence, 'Vera_SCH_20261108.pdf'), newer = path.join(evidence, 'Vera_SCH_20261109.pdf'), large = path.join(evidence, 'Vera_SCH_20261110.pdf');
  fs.writeFileSync(older, schematic(false)); fs.writeFileSync(newer, schematic(true));
  // Over the 50 MB server limit: the same sheets followed by padding after the end of the PDF.
  fs.writeFileSync(large, Buffer.concat([schematic(true), Buffer.from('\n%'), Buffer.alloc(51 * 1024 * 1024, 0x30), Buffer.from('\n')]));
  const fixture = createCircuitChangesServer();
  const {createServer} = await import('vite');
  const materialMock = path.resolve('tests/support/materialWorkspaceMock.js');
  const storageMock = path.resolve('tests/support/circuitChangesStorageMock.js');
  const pdfStorageMock = path.resolve('tests/support/circuitChangesPdfStorageMock.js');
  const supabaseMock = path.resolve('tests/support/circuitChangesSupabaseMock.js');
  let server, browser;
  const sessions = [], report = {checks:[], result:'running'};
  const check = name => { report.checks.push(name); console.log('✓', name); };
  try {
    server = await createServer({configFile:false, root:process.cwd(), cacheDir:path.join(evidence, 'vite-cache'), resolve:{alias:[
      {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/, replacement:materialMock},
      {find:'@/integrations/supabase/client', replacement:supabaseMock},
      {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement:materialMock},
      {find:'@', replacement:path.resolve('src')},
    ]}, worker:{format:'es'}, optimizeDeps:{entries:['tests/support/circuitChangesFixture.jsx'], include:['react/jsx-dev-runtime', 'exceljs', 'pdfjs-dist']},
    server:{host:'127.0.0.1', port:0, fs:{allow:[process.cwd(), evidence, fs.realpathSync('node_modules')]}}, plugins:[
      {name:'circuit-repository-fixture', enforce:'pre', resolveId(source, importer) { const own = importer?.replaceAll('\\', '/').includes('/circuit-changes/'); if (own && source === './storage') return storageMock; if (own && source === './pdfStorage') return pdfStorageMock; if (own && source === './officialPdfStorage') return path.resolve('tests/support/circuitPdfOfficialMock.js'); }},
      {name:'circuit-http-fixture', configureServer(vite) { vite.middlewares.use(fixture.middleware); vite.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/') return next();
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; font-src 'self' data:; worker-src 'self' blob:; base-uri 'none'");
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>線路修改 PDF 隔離驗證</title><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>');
      }); }},
    ]});
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({channel:'chrome'});

    // --- First use on a laptop screen: the PDF pane is there with its upload target, the form beside it, the list folded.
    const a = await createPage(browser, origin, 'A'); sessions.push(a);
    const p = a.page;
    await panel(p).getByRole('button', {name:/上傳原理圖 PDF/}).waitFor();
    assert.ok(await dialog(p).getByRole('textbox', {name:'修改標題', exact:true}).isVisible(), 'the form stays on screen beside the PDF');
    assert.equal(await dialog(p).getByRole('button', {name:'PDF 圖面', exact:true}).getAttribute('aria-pressed'), 'true');
    await dialog(p).getByRole('button', {name:'展開修改清單', exact:true}).click();
    await dialog(p).locator('.circuit-item-list').waitFor();
    await dialog(p).getByRole('button', {name:'收合修改清單', exact:true}).click();
    await dialog(p).getByRole('button', {name:'展開修改清單', exact:true}).waitFor();
    assert.equal((await stateOf(origin)).pdfWrites, 0, 'opening the pane writes nothing');
    await p.screenshot({path:path.join(evidence, '1-first-use-1440.png')});
    check('first use: upload target, form beside it, list folds and unfolds, nothing written');

    // --- Upload the first dated PDF; its date comes from the file name.
    await panel(p).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(older);
    await rendered(p);
    assert.equal(await versionLabel(p), '11/08 版');
    assert.equal(await panel(p).locator('.circuit-pdf-strip > button').count(), 12);
    assert.match(await panel(p).locator('.circuit-pdf-progress').innerText(), /已看 0 \/ 12 頁/);
    assert.equal(await pageNumber(p), '1');
    let registry = await registryOf(origin);
    assert.equal(registry.documents.length, 1); assert.equal(registry.documents[0].date, '2026-11-08'); assert.equal((await stateOf(origin)).pdfs.length, 1);
    check('upload: dated from the file name, stored, opened on page 1 with a 12-page overview');

    // --- Zoom and page turning.
    const zoomText = () => panel(p).locator('.circuit-pdf-zoom > span').innerText();
    const fitted = await zoomText();
    await panel(p).getByRole('button', {name:'放大', exact:true}).click(); await rendered(p);
    assert.notEqual(await zoomText(), fitted); assert.equal(await panel(p).getByRole('button', {name:'符合寬度', exact:true}).getAttribute('aria-pressed'), 'false');
    await panel(p).getByRole('button', {name:'縮小', exact:true}).click(); await rendered(p);
    await panel(p).getByRole('button', {name:'符合寬度', exact:true}).click(); await rendered(p);
    assert.equal(await zoomText(), fitted);
    await panel(p).getByLabel('目前頁碼', {exact:true}).fill('5'); await panel(p).getByLabel('目前頁碼', {exact:true}).press('Enter'); await onPage(p, 5);
    await panel(p).getByRole('button', {name:'下一頁', exact:true}).click(); await onPage(p, 6);
    await panel(p).getByRole('button', {name:'上一頁', exact:true}).click(); await onPage(p, 5);
    await panel(p).getByRole('button', {name:/^第 3 頁，/}).click(); await onPage(p, 3);
    await panel(p).locator('.circuit-pdf-stage').focus(); await p.keyboard.press('ArrowRight'); await onPage(p, 4);
    await rendered(p);
    check('zoom in, out and back to fit width; page number, previous, next, overview cell and arrow key');

    // --- Framing: Escape drops only the framed area; a framed area goes into the change and fills its page.
    await frame(p);
    for (const name of ['加到修改前', '加到修改後', '加到補充圖']) assert.ok(await panel(p).getByRole('button', {name, exact:true}).isVisible(), name);
    await p.keyboard.press('Escape');
    await panel(p).getByRole('group', {name:'加入框選區域'}).waitFor({state:'hidden'});
    assert.ok(await dialog(p).isVisible(), 'Escape with a framed area keeps the dialog open');
    await frame(p);
    await panel(p).getByRole('button', {name:'加到補充圖', exact:true}).click();
    await imageCount(p, 'reference', 1); await saved(p);
    let state = await stateOf(origin);
    assert.equal(state.items.length, 1, 'the framed area created the change');
    assert.equal(state.items[0].content.page, '4', 'the page field is filled from the PDF');
    const reference = state.items[0].content.images[0];
    assert.equal(reference.side, 'reference'); assert.equal(reference.source.page, 4); assert.equal(reference.source.date, '2026-11-08');
    assert.match(reference.caption, /2026-11-08 版 PDF「Vera_SCH_20261108\.pdf」第 4 頁/);
    // The framed area is 190 points wide; on screen it is about 115 px, rendered from the PDF it is 8 times its own size.
    assert.equal(reference.width, 1520, `the picture is rendered from the PDF, not copied from the screen (${reference.width} px wide)`);
    check('Escape drops the framed area only; 加到補充圖 creates the change, fills 頁碼 and keeps the source page');

    // --- Version list: edit the date and the note, Escape closes it.
    await panel(p).getByRole('button', {name:'選擇 PDF 版本', exact:true}).click();
    const versions = panel(p).getByRole('group', {name:'PDF 版本（依圖面日期）'});
    await versions.waitFor();
    await versions.getByLabel('Vera_SCH_20261108.pdf 的版本備註', {exact:true}).fill('第1天'); await p.keyboard.press('Tab');
    await versions.getByLabel('Vera_SCH_20261108.pdf 的圖面日期', {exact:true}).fill('2026-11-07'); await p.keyboard.press('Tab');
    await eventually(async () => { const row = (await registryOf(origin)).documents[0]; return row.label === '第1天' && row.date === '2026-11-07'; }, 'date and note are saved');
    await p.keyboard.press('Escape');
    await versions.waitFor({state:'hidden'});
    assert.ok(await dialog(p).isVisible());
    assert.equal(await versionLabel(p), '11/07 版 第1天');
    check('version list: drawing date and note are edited and saved; Escape closes the list, not the dialog');

    // --- The next day's PDF: 上傳新 PDF, it opens at the page reached so far.
    const chooser = p.waitForEvent('filechooser');
    await panel(p).getByRole('button', {name:'上傳新 PDF', exact:true}).click();
    await (await chooser).setFiles(newer);
    await p.waitForFunction(() => document.querySelector('.circuit-pdf-version-button > small')?.textContent.startsWith('11/09 版 ·'));
    await onPage(p, 4); await rendered(p);
    check('上傳新 PDF adds the next dated version and keeps the page reached');

    // --- Comparison with the older date, same area into before and after of a new change.
    await panel(p).getByRole('combobox', {name:'對照較早的 PDF 版本', exact:true}).selectOption({label:'11/07 版 第1天 · Vera_SCH_20261108.pdf'});
    await p.waitForFunction(() => document.querySelectorAll('.circuit-pdf-surface').length === 2); await rendered(p);
    await panel(p).getByRole('button', {name:'對照頁往後一頁', exact:true}).click();
    assert.equal(await panel(p).locator('.circuit-pdf-offset > span').innerText(), '第 5 頁');
    await panel(p).getByRole('button', {name:'對照頁往前一頁', exact:true}).click();
    assert.equal(await panel(p).locator('.circuit-pdf-offset > span').innerText(), '第 4 頁');
    await dialog(p).getByRole('button', {name:'新增修改', exact:true}).click();
    await dialog(p).getByText('填寫後自動建立', {exact:true}).waitFor();
    await panel(p).getByRole('button', {name:'下一頁', exact:true}).click(); await onPage(p, 5); await rendered(p);
    assert.equal(await panel(p).locator('figure[data-pane="compare"] figcaption').innerText(), '自選對照 · 11/07 版 第1天 第 5 頁');
    await frame(p, 0);
    assert.equal(await panel(p).locator('.circuit-pdf-selection').count(), 2, 'the framed area is shown on both dates');
    await panel(p).getByRole('button', {name:'前後同區域加入', exact:true}).click();
    await imageCount(p, 'before', 1); await imageCount(p, 'after', 1); await saved(p);
    state = await stateOf(origin);
    const second = state.items.find(row => row.number === 2);
    assert.ok(second, 'the second change exists'); assert.equal(second.content.page, '5');
    assert.deepEqual(second.content.images.map(image => [image.side, image.source.date, image.source.page]), [['before', '2026-11-07', 5], ['after', '2026-11-09', 5]]);
    await panel(p).getByRole('group', {name:'本頁的修改項目'}).getByRole('button', {name:'#002', exact:true}).waitFor();
    await frame(p, 0, [100 / 1190, 80 / 842], [300 / 1190, 160 / 842]);
    await panel(p).getByRole('button', {name:'只加修改後', exact:true}).click();
    await imageCount(p, 'after', 2); await saved(p);
    await frame(p, 1);
    await panel(p).getByRole('button', {name:'只加修改前', exact:true}).click();
    await imageCount(p, 'before', 2); await saved(p);
    await frame(p, 0);
    await panel(p).getByRole('button', {name:'取消框選', exact:true}).click();
    await panel(p).getByRole('group', {name:'加入框選區域'}).waitFor({state:'hidden'});
    await p.screenshot({path:path.join(evidence, '2-compare-1440.png')});
    check('comparison: page offset, same area into 修改前 and 修改後 of a new change, 只加修改後, 只加修改前, cancel, 本頁修改 #002');

    // --- Progress: finish two pages, undo one.
    await panel(p).getByRole('button', {name:'看完，下一頁', exact:true}).click(); await onPage(p, 6);
    await panel(p).getByRole('button', {name:'看完，下一頁', exact:true}).click(); await onPage(p, 7);
    await panel(p).getByRole('button', {name:'上一頁', exact:true}).click(); await onPage(p, 6);
    assert.equal(await panel(p).getByRole('checkbox', {name:'本頁看過', exact:true}).isChecked(), true);
    await panel(p).getByRole('checkbox', {name:'本頁看過', exact:true}).uncheck();
    assert.equal(await panel(p).locator('[data-strip-page="5"]').getAttribute('data-state'), 'here');
    assert.equal(await panel(p).locator('[data-strip-page="6"]').getAttribute('data-state'), 'none');
    await eventually(async () => { const pages = (await registryOf(origin)).pages; return pages[5]?.checked === true && pages[6]?.checked === false; }, 'page marks are saved');
    check('看完，下一頁 marks pages and turns; 本頁看過 can be undone; the overview shows it');

    // --- Tomorrow: reopening continues on the newest PDF at the page this person reached.
    await panel(p).getByRole('button', {name:'下一頁', exact:true}).click(); await onPage(p, 7);
    await eventually(async () => (await registryOf(origin)).positions['00000000-0000-4000-8000-000000000001']?.page === 7, 'the reading position is saved');
    await a.open();
    await rendered(p); await onPage(p, 7);
    assert.equal(await versionLabel(p), '11/09 版');
    assert.equal(await panel(p).locator('[data-strip-page="5"]').getAttribute('data-state'), 'here');
    check('reopening continues on the newest PDF at page 7 with the marks shown');

    // --- Two editors finishing pages at the same moment keep both marks.
    const b = await createPage(browser, origin, 'B'); sessions.push(b);
    await rendered(b.page);
    assert.equal(await pageNumber(b.page), '1', 'a colleague who has not read yet starts at the first page nobody went through');
    await panel(p).getByLabel('目前頁碼', {exact:true}).fill('8'); await panel(p).getByLabel('目前頁碼', {exact:true}).press('Enter'); await onPage(p, 8);
    await control(origin, {action:'pdf_write_delay', ms:400});
    await Promise.all([panel(p).getByRole('button', {name:'看完，下一頁', exact:true}).click(), panel(b.page).getByRole('button', {name:'看完，下一頁', exact:true}).click()]);
    await eventually(async () => { const pages = (await registryOf(origin)).pages; return pages[1]?.checked && pages[8]?.checked && pages[5]?.checked; }, 'both editors\' marks are stored', 15000);
    await control(origin, {action:'pdf_write_delay', ms:0});
    report.pdfConflicts = (await stateOf(origin)).pdfConflicts;
    check(`two editors finishing pages at once keep both marks (${report.pdfConflicts} overlapping save(s) retried)`);

    // --- A viewer can read and turn pages but is offered nothing that would be refused.
    const viewer = await createPage(browser, origin, 'view'); sessions.push(viewer);
    await rendered(viewer.page);
    assert.equal(await panel(viewer.page).getByRole('button', {name:'上傳新 PDF', exact:true}).count(), 0);
    assert.equal(await panel(viewer.page).getByRole('button', {name:'看完，下一頁', exact:true}).count(), 0);
    await frame(viewer.page);
    assert.match(await panel(viewer.page).locator('.circuit-pdf-actions-target').innerText(), /目前為檢視權限，無法加入截圖/);
    assert.equal(await panel(viewer.page).getByRole('button', {name:'加到修改後', exact:true}).isDisabled(), true);
    check('viewer: reads PDFs, no upload or progress controls, framing explains why it cannot add');

    // --- A PDF over 50 MB opens on this computer only; a colleague opens it from the same file.
    const objectsBefore = (await stateOf(origin)).pdfs.length;
    await panel(p).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(large);
    await p.waitForFunction(() => document.querySelector('.circuit-pdf-version-button > small')?.textContent.startsWith('11/10 版 ·'), null, {timeout:60000});
    await rendered(p);
    assert.match(await panel(p).locator('.circuit-pdf-message').innerText(), /50 MB/);
    registry = await registryOf(origin);
    const big = registry.documents.find(row => row.date === '2026-11-10');
    assert.equal(big.localOnly, true); assert.equal(big.path, ''); assert.equal((await stateOf(origin)).pdfs.length, objectsBefore, 'nothing over the limit is sent to the server');
    await b.open();
    await panel(b.page).getByRole('button', {name:'選擇 PDF 版本', exact:true}).click();
    await panel(b.page).getByRole('button', {name:/^開啟 11\/10 版/}).click();
    await panel(b.page).getByRole('button', {name:'選擇檔案開啟', exact:true}).waitFor();
    await panel(b.page).locator('input[aria-label="選擇本機 PDF 原檔"]').setInputFiles(large);
    await rendered(b.page);
    check('a 51 MB PDF opens locally without uploading; a colleague is asked for the file and opens it');

    // --- Archiving a version: it leaves the main list while its original and pictures stay.
    await panel(p).getByRole('button', {name:'選擇 PDF 版本', exact:true}).click();
    await panel(p).getByRole('button', {name:'刪除 PDF：Vera_SCH_20261108.pdf', exact:true}).click();
    await panel(p).getByRole('button', {name:'確認刪除 11/07 版 第1天', exact:true}).click();
    await eventually(async () => (await registryOf(origin)).documents.find(row => row.date === '2026-11-07')?.removedAt, 'the version is marked removed');
    await eventually(async () => (await stateOf(origin)).pdfs.every(name => !name.includes(big.id)) && (await stateOf(origin)).pdfs.length === objectsBefore, 'archiving keeps the original PDF file');
    await p.keyboard.press('Escape');
    await dialog(p).getByRole('button', {name:'展開修改清單', exact:true}).click();
    await dialog(p).getByTestId('circuit-change-item').filter({hasText:'#002'}).click();
    await imageCount(p, 'before', 2);
    await dialog(p).locator('.circuit-image-column[data-side="before"]').getByRole('button', {name:/到 PDF 第 5 頁（2026-11-07）/}).click();
    await dialog(p).getByRole('alert').filter({hasText:'已從清單移除'}).waitFor();
    assert.equal((await stateOf(origin)).items.find(row => row.number === 2).content.images.filter(image => image.side === 'before').length, 2);
    check('archiving a version: hidden from the main list, its original and pictures kept, and P5 explains where it went');

    // --- 刪除 beside the version picker: it asks first, Escape or 取消 keep the PDF, 刪除 hides it, and it can be restored.
    const shownName = async () => (await panel(p).getByRole('button', {name:'選擇 PDF 版本', exact:true}).getAttribute('title')).split(' · ')[0];
    const doomed = await shownName();
    const deleteButton = panel(p).getByRole('button', {name:'刪除這份 PDF', exact:true});
    await deleteButton.click();
    const confirmBar = panel(p).getByRole('group', {name:'確認刪除 PDF'});
    assert.ok((await confirmBar.innerText()).includes(doomed), 'the confirmation names the PDF');
    await confirmBar.getByRole('button', {name:'取消', exact:true}).click();
    await confirmBar.waitFor({state:'hidden'});
    await deleteButton.click(); await confirmBar.waitFor();
    await p.keyboard.press('Escape'); await confirmBar.waitFor({state:'hidden'});
    assert.equal(await dialog(p).isVisible(), true, 'Escape cancels the deletion, not the window');
    assert.ok(!(await registryOf(origin)).documents.find(row => row.name === doomed)?.removedAt, 'cancelling deletes nothing');
    await deleteButton.click();
    await confirmBar.getByRole('button', {name:'確認刪除 ' + doomed, exact:true}).click();
    await eventually(async () => (await registryOf(origin)).documents.find(row => row.name === doomed)?.removedAt, 'the PDF is deleted from the list');
    await panel(p).getByRole('button', {name:'選擇 PDF 版本', exact:true}).click();
    await panel(p).getByRole('button', {name:/已刪除的 PDF/}).click();
    await panel(p).getByRole('button', {name:'還原 PDF：' + doomed, exact:true}).click();
    await eventually(async () => !(await registryOf(origin)).documents.find(row => row.name === doomed)?.removedAt, 'the deleted PDF is restored');
    await p.keyboard.press('Escape');
    check('刪除 beside the version picker: named confirmation, 取消 and Escape keep the PDF, 刪除 removes it, 還原 brings it back');

    // --- The picture's page button from a version that is still there, and closing the pane.
    await dialog(p).locator('.circuit-image-column[data-side="after"]').getByRole('button', {name:/到 PDF 第 5 頁（2026-11-09）/}).click();
    await onPage(p, 5);
    assert.equal(await versionLabel(p), '11/09 版');
    await dialog(p).getByRole('button', {name:'PDF 圖面', exact:true}).click();
    await panel(p).waitFor({state:'hidden'});
    assert.equal(await dialog(p).locator('.circuit-workspace').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2, 'without the PDF the dialog is list | form as before');
    await dialog(p).getByRole('button', {name:'PDF 圖面', exact:true}).click();
    await panel(p).waitFor();
    check('P5 opens the picture\'s page; PDF 圖面 closes the pane back to list | form and opens it again');

    // --- Phone: the PDF is a pane of its own, framing and finishing are within thumb reach.
    const phone = await createPage(browser, origin, 'A', 390, 844); sessions.push(phone);
    const q = phone.page;
    await dialog(q).getByRole('button', {name:'PDF 圖面', exact:true}).tap();
    // This browser has no copy of the 51 MB PDF last opened on the laptop, so it offers the file picker; the phone switches to 11/09.
    await panel(q).getByRole('button', {name:'選擇 PDF 版本', exact:true}).tap();
    await panel(q).getByRole('button', {name:'開啟 11/09 版 Vera_SCH_20261109.pdf', exact:true}).tap();
    await rendered(q);
    assert.equal(await dialog(q).locator('.circuit-detail').isVisible(), false, 'one pane at a time on a phone');
    const finish = panel(q).locator('.circuit-pdf-finish-bar');
    const finishBox = await finish.boundingBox();
    assert.ok(finishBox && finishBox.y + finishBox.height <= 844 + 1, 'the finishing bar is on screen');
    await panel(q).getByRole('button', {name:'框選', exact:true}).tap();
    await frame(q);
    const actionsBox = await panel(q).getByRole('group', {name:'加入框選區域'}).boundingBox();
    assert.ok(actionsBox.y + actionsBox.height <= 844 + 1, 'the add buttons are on screen');
    await panel(q).getByRole('button', {name:'加到修改後', exact:true}).tap();
    await panel(q).locator('.circuit-pdf-actions[role="status"]').waitFor();
    assert.equal(await q.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways page scroll');
    await q.screenshot({path:path.join(evidence, '3-phone-390.png')});
    await panel(q).getByRole('button', {name:'返回修改內容', exact:true}).first().tap();
    await dialog(q).locator('.circuit-detail').waitFor();
    check('phone 390: PDF pane alone, framing toggle, add buttons and finishing bar on screen, back to the form');

    for (const session of sessions) assert.deepEqual(session.errors, [], 'no page errors');
    report.result = 'passed';
    console.log('Circuit change PDF workflow passed: ' + report.checks.length + ' checks');
  } catch (error) {
    report.result = 'failed'; report.failure = String(error.stack || error);
    for (const [index, session] of sessions.entries()) await session.page.screenshot({path:path.join(evidence, `failure-${index}.png`)}).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(evidence, 'pdf-report.json'), JSON.stringify(report, null, 2));
    fs.rmSync(large, {force:true});
    for (const session of sessions) await session.context.close().catch(() => {});
    await browser?.close(); await server?.close(); fixture.close();
  }
})();
