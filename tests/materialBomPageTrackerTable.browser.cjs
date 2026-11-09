// Real material workspace and page tracker; storage, accounts and AI keys stay isolated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const evidence = path.resolve(process.env.PAGE_TRACKER_EVIDENCE_DIR || '../bom-page-tracker-table-evidence');
fs.mkdirSync(evidence, { recursive: true });

const trackerDialog = page => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '頁數進度', exact: true }) });
async function openTracker(page, width) {
  if (width < 1024) {
    await page.getByRole('button', { name: '排序與工具', exact: true }).tap();
    await page.getByTestId('material-mobile-tools').getByRole('button', { name: '頁數進度', exact: true }).tap();
  } else await page.getByRole('button', { name: /已完成.*頁/ }).click();
  const tracker = trackerDialog(page); await tracker.waitFor(); return tracker;
}
async function tableGeometry(tracker, pageNumber) {
  const table = tracker.getByRole('table');
  const row = tracker.getByLabel(`第 ${pageNumber} 頁標題`, { exact: true }).locator('xpath=ancestor::tr');
  return { table, row, metrics: await row.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    cells: [...element.cells].map(cell => ({ x: cell.getBoundingClientRect().x, width: cell.getBoundingClientRect().width })),
  })) };
}
async function assertFrame(page, tracker, height) {
  await page.waitForFunction(height => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.textContent.includes('儲存頁數進度'));
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect(); return rect.y >= -1 && rect.bottom <= height + 1;
  }, height);
  const rect = await tracker.boundingBox(); assert.ok(rect && rect.y >= -1 && rect.y + rect.height <= height + 1);
  assert.ok(await tracker.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Only the page table may scroll horizontally');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const name of ['關閉', '儲存頁數進度']) {
    const box = await tracker.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= height + 1, `${name} outside viewport: ${JSON.stringify(box)}`);
  }
}
async function assertEditableHeader(tracker, pageNumber, fieldName) {
  const input = tracker.getByLabel(`第 ${pageNumber} 頁${fieldName}`, { exact: true });
  await input.scrollIntoViewIfNeeded(); await input.focus();
  const measured = await input.evaluate(element => {
    const cell = element.closest('td'), table = element.closest('table'), scroll = table.parentElement;
    const header = table.querySelectorAll('thead th')[cell.cellIndex];
    const text = document.createRange(); text.selectNodeContents(header);
    const rect = text.getBoundingClientRect(), box = scroll.getBoundingClientRect(), frozen = table.querySelector('thead th').getBoundingClientRect(), field = element.getBoundingClientRect();
    return { text: header.textContent.trim(), left: rect.left, right: rect.right, frozenRight: frozen.right, viewportRight: box.right, fieldLeft: field.left, fieldRight: field.right, scrollLeft: scroll.scrollLeft };
  });
  assert.equal(measured.text, fieldName === '標題' ? '頁面標題' : '備註');
  assert.ok(measured.left >= measured.frozenRight - 1 && measured.right <= measured.viewportRight + 1, `Header text must remain visible beside the frozen page: ${JSON.stringify(measured)}`);
  assert.ok(measured.fieldLeft >= measured.frozenRight - 1 && measured.fieldRight <= measured.viewportRight + 1, `Whole edit field must fit beside the frozen page: ${JSON.stringify(measured)}`);
  return measured;
}
async function run(browser, origin, width) {
  const context = await browser.newContext({ viewport: { width, height: 884 }, deviceScaleFactor: 1, isMobile: width < 1024, hasTouch: true, reducedMotion: 'reduce', locale: 'zh-TW' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(25000);
  try {
    await page.goto(origin + '/?qaMainRows&qaPages'); await page.getByTestId('material-table-card').waitFor();
    const tracker = await openTracker(page, width);
    assert.deepEqual(await tracker.getByRole('columnheader').allTextContents(), ['頁碼', '狀態', '目前頁', '頁面標題', '備註']);
    const original = await page.evaluate(() => structuredClone(window.__pdfAiFixture.tracker));
    await assertFrame(page, tracker, 884);
    await page.screenshot({ path: path.join(evidence, `initial-${width}.png`) });

    await tracker.getByLabel('總頁數', { exact: true }).fill('500');
    await tracker.getByLabel('第 500 頁標題', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await tracker.getByRole('table').locator('tbody tr').count(), 500);
    const title500 = tracker.getByLabel('第 500 頁標題', { exact: true }), note500 = tracker.getByLabel('第 500 頁備註', { exact: true });
    await title500.fill('QA 第500頁標題，取消後不得保存');
    await note500.fill('QA 第500頁草稿備註');
    assert.equal(await tracker.getByLabel('目前做到第幾頁', { exact: true }).inputValue(), '500');
    await tracker.getByRole('button', { name: 'PDF AI', exact: true }).tap();
    const ai = page.getByTestId('bom-page-pdf-ai'); await ai.waitFor();
    await ai.getByRole('button', { name: '關閉 PDF AI', exact: true }).tap(); await ai.waitFor({ state: 'hidden' });
    assert.equal(await title500.inputValue(), 'QA 第500頁標題，取消後不得保存');
    await tracker.getByRole('button', { name: '關閉', exact: true }).tap(); await tracker.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.__pdfAiFixture.tracker), original, 'Closing tracker retains saved state');

    await openTracker(page, width); assert.equal(await tracker.getByLabel('總頁數', { exact: true }).inputValue(), '4');
    await tracker.getByLabel('總頁數', { exact: true }).fill('500');
    await title500.waitFor({ state: 'attached' });
    const longTitle = '第500頁電源與訊號連接修改標題 '.repeat(8), longNote = '長備註保留全部內容，不得把其他列撐高。'.repeat(30);
    await title500.fill(longTitle); await note500.fill(longNote);
    const lastStatus = tracker.getByRole('group', { name: '第 500 頁狀態', exact: true });
    await lastStatus.getByRole('button', { name: '已完成', exact: true }).tap();
    await lastStatus.getByRole('button', { name: '待處理', exact: true }).tap();
    const finalRow = await tableGeometry(tracker, 500), firstRow = await tableGeometry(tracker, 1);
    assert.ok(Math.abs(finalRow.metrics.height - firstRow.metrics.height) <= 1, 'Long title/note must not change row height');
    const headers = await finalRow.table.getByRole('columnheader').evaluateAll(cells => cells.map(cell => ({ x: cell.getBoundingClientRect().x, width: cell.getBoundingClientRect().width })));
    finalRow.metrics.cells.forEach((cell, index) => {
      assert.ok(Math.abs(cell.x - headers[index].x) <= 1 && Math.abs(cell.width - headers[index].width) <= 1, `Column ${index} is not aligned`);
    });
    const scroll = tracker.getByTestId('bom-page-tracker-scroll');
    const sticky = await scroll.evaluate(el => {
      const header = el.querySelector('thead th').getBoundingClientRect(), box = el.getBoundingClientRect();
      return { scrollTop: el.scrollTop, delta: header.y - box.y, height: el.clientHeight, overflowX: getComputedStyle(el).overflowX };
    });
    assert.ok(sticky.scrollTop > 0 && Math.abs(sticky.delta) <= 2, `Table header must stay visible: ${JSON.stringify(sticky)}`);
    if (width < 1024) assert.equal(sticky.overflowX, 'auto');
    if (process.env.PAGE_TRACKER_HEADERS_ONLY) {
      await page.setViewportSize({ width, height: 500 }); await assertFrame(page, tracker, 500);
      const titleHeader = await assertEditableHeader(tracker, 500, '標題');
      await page.screenshot({ path: path.join(evidence, `title-header-short-${width}.png`) });
      const noteHeader = await assertEditableHeader(tracker, 500, '備註');
      await page.screenshot({ path: path.join(evidence, `note-header-short-${width}.png`) });
      await tracker.getByRole('button', { name: '關閉', exact: true }).tap();
      assert.deepEqual(errors, []);
      return { width, height: 500, result: 'passed', titleHeader, noteHeader, checks: ['500th title and note fields fit beside frozen page', 'both column headers remain visible after focus', 'short viewport footer and cancel work'] };
    }

    await tracker.getByLabel('起始頁', { exact: true }).fill('1'); await tracker.getByLabel('結束頁', { exact: true }).fill('3');
    const batch = tracker.locator('[data-testid="bom-page-tracker-batch"]');
    await batch.getByRole('button', { name: '已完成但缺料', exact: true }).tap();
    await page.waitForFunction(() => [1, 2, 3].every(number => [...document.querySelector(`[aria-label="第 ${number} 頁狀態"]`).querySelectorAll('button')].some(button => button.textContent.trim() === '已完成但缺料' && button.getAttribute('aria-pressed') === 'true')));
    assert.equal(await tracker.getByLabel('第 1 頁標題', { exact: true }).inputValue(), original.pages[0].title);
    assert.equal(await tracker.getByLabel('第 1 頁備註', { exact: true }).inputValue(), original.pages[0].note);
    for (const number of [1, 2, 3]) assert.equal(await tracker.getByRole('group', { name: `第 ${number} 頁狀態`, exact: true }).getByRole('button', { name: '已完成但缺料', exact: true }).getAttribute('aria-pressed'), 'true');
    const secondRow = tracker.getByLabel('第 2 頁標題', { exact: true }).locator('xpath=ancestor::tr');
    await secondRow.getByRole('button', { name: '設為目前頁', exact: true }).tap();
    assert.equal(await tracker.getByLabel('目前做到第幾頁', { exact: true }).inputValue(), '2');
    await tracker.getByLabel('目前做到第幾頁', { exact: true }).fill('1');
    await page.setViewportSize({ width, height: 500 }); await assertFrame(page, tracker, 500);
    await title500.scrollIntoViewIfNeeded();
    const shortScroll = await scroll.evaluate(el => ({ height: el.clientHeight, scrollTop: el.scrollTop, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    assert.ok(shortScroll.height >= 100, `Short viewport must retain a usable page table: ${JSON.stringify(shortScroll)}`);
    await title500.fill(longTitle); await note500.fill(longNote);
    if (width < 768) { await assertEditableHeader(tracker, 500, '標題'); await assertEditableHeader(tracker, 500, '備註'); }
    await page.screenshot({ path: path.join(evidence, `short-last-page-${width}.png`) });
    await tracker.getByRole('button', { name: '儲存頁數進度', exact: true }).tap(); await tracker.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(() => structuredClone(window.__pdfAiFixture));
    assert.equal(saved.saves, 1); assert.equal(saved.tracker.totalPages, 500); assert.equal(saved.tracker.pages.length, 500);
    assert.equal(saved.tracker.pages[499].title, longTitle); assert.equal(saved.tracker.pages[499].note, longNote);
    assert.deepEqual(saved.tracker.pages.slice(0, 3).map(page => page.status), ['done_missing', 'done_missing', 'done_missing']);
    assert.equal(saved.tracker.pages[3].status, original.pages[3].status); assert.equal(saved.tracker.pages[3].note, original.pages[3].note);
    await page.setViewportSize({ width, height: 884 }); await openTracker(page, width);
    assert.equal(await title500.inputValue(), longTitle); assert.equal(await note500.inputValue(), longNote);
    await title500.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(evidence, `saved-last-page-${width}.png`) });
    await tracker.getByRole('button', { name: '關閉', exact: true }).tap();
    assert.deepEqual(errors, []);
    return { width, result: 'passed', rowHeight: finalRow.metrics.height, shortTable: shortScroll, checks: ['five visible column headers', '500 aligned equal-height rows', 'sticky table header and internal scroll', 'title and note edits', 'batch status retains text', 'PDF AI opens and returns with draft', 'cancel does not persist', 'save/reopen retains all 500 pages', 'short viewport last-row edit and visible footer'] };
  } catch (error) { await page.screenshot({ path: path.join(evidence, `failure-${width}.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); }
}

(async () => {
  const { createServer } = await import('vite'), mock = path.resolve('tests/support/materialBomPagePdfAiMock.js'), report = { result: 'running', checks: [] }; let server, browser;
  try {
    server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, '.vite'), resolve: { alias: [
      { find: /^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/, replacement: mock },
      { find: /^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement: mock }, { find: '@', replacement: path.resolve('src') },
    ] }, worker: { format: 'es' }, optimizeDeps: { entries: ['tests/support/materialWorkspaceFixture.jsx'], include: ['react/jsx-dev-runtime'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), fs.realpathSync('node_modules')] } }, plugins: [{ name: 'page-tracker-table-fixture', configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/') return next();
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/materialWorkspaceFixture.jsx"></script></html>');
    }); } }] });
    await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: 'chrome' });
    for (const width of process.env.PAGE_TRACKER_WIDTHS ? process.env.PAGE_TRACKER_WIDTHS.split(',').map(Number) : [1440, 1180, 390, 536]) report.checks.push(await run(browser, origin, width));
    report.result = 'passed'; console.log(`Page tracker ${process.env.PAGE_TRACKER_HEADERS_ONLY ? 'mobile header focus' : 'table workflow'} passed at ${report.checks.map(check => check.width).join('/')} including page 500`);
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); if (browser) await browser.close(); if (server) await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
