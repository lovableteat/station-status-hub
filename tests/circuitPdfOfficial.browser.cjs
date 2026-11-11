// Official PDF pinning, retained revisions and mouse page-map dragging in the real workspace, with isolated persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { jsPDF } = require('jspdf');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { createCircuitChangesServer } = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_OFFICIAL_EVIDENCE_DIR || '../circuit-official-evidence');
const dialog = page => page.getByTestId('circuit-changes-dialog');
const panel = page => page.getByTestId('circuit-pdf-panel');

function schematic(label) {
  const pdf = new jsPDF({ unit: 'pt', format: [1190, 842], orientation: 'landscape' });
  for (let page = 1; page <= 500; page++) {
    if (page > 1) pdf.addPage([1190, 842], 'landscape');
    pdf.setFontSize(20); pdf.text(`${label} - page ${page}`, 60, 60);
    pdf.setFontSize(11); pdf.rect(100, 150, 90, 50); pdf.text('R2301', 110, 170); pdf.line(190, 175, 400, 175); pdf.text('P12V_EN', 250, 165);
  }
  return Buffer.from(pdf.output('arraybuffer'));
}
async function eventually(read, message, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error(message);
}
async function rendered(page) {
  await page.waitForFunction(() => { const pages = [...document.querySelectorAll('.circuit-pdf-surface')]; return pages.length > 0 && pages.every(node => node.dataset.rendering === 'false'); });
}
const versionManagerFor = page => panel(page).getByRole('group', { name: 'PDF 清單（依圖面日期）' });
async function headerFits(page, width) {
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-testid="circuit-changes-dialog"]')?.getBoundingClientRect();
    const actions = document.querySelector('.circuit-header-actions')?.getBoundingClientRect();
    return frame && actions && Math.abs(frame.width - (innerWidth - (innerWidth >= 1024 ? 34 : 0))) <= 1 && frame.left >= 0 && frame.right <= innerWidth + 1 && actions.left >= 0 && actions.right <= innerWidth + 1;
  }, undefined, { timeout: 3000 });
  const geometry = await dialog(page).locator('.circuit-header-actions').evaluate(node => {
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, overflow: node.scrollWidth - node.clientWidth, buttons: [...node.querySelectorAll('button')].map(button => { const b = button.getBoundingClientRect(); return { label: button.getAttribute('aria-label'), top: b.top, left: b.left, right: b.right, height: b.height }; }), labels: [...node.querySelectorAll('button')].map(button => button.getAttribute('aria-label')) };
  });
  // 匯出問題清單 is shown where there is a problem list (線路 Review, 改善追蹤), not in AI 比對 or 官方版本. On a phone it is inside 更多.
  const listTask = await dialog(page).locator('.circuit-task[aria-selected="true"]').evaluate(node => ['review', 'track'].includes(node.dataset.task));
  assert.deepEqual(geometry.labels, listTask && width >= 1024 ? ['匯出問題清單', '更多', '關閉線路修改'] : ['更多', '關閉線路修改']);
  if (width >= 1024) {
    const tasks = await dialog(page).locator('.circuit-tasks').boundingBox();
    assert.ok(tasks && tasks.x >= 0 && tasks.x + tasks.width <= width + 1, 'the four task tabs fit: ' + JSON.stringify(tasks));
  } else {
    // Phone, in the drawing: the top bar is one row with a worded way back, and the drawing's own actions replace the tabs.
    const header = await dialog(page).locator('.circuit-header').boundingBox();
    assert.ok(header && header.height <= 60, 'the phone top bar is one row: ' + JSON.stringify(header));
    assert.ok((await dialog(page).getByRole('button', { name: /^返回/ }).innerText()).trim().length >= 2, 'the way back carries its word');
    assert.equal(await dialog(page).getByRole('tab').count(), 0, 'a pushed screen does not stack the tabs under its own actions');
  }
  assert.ok(geometry.left >= 0 && geometry.right <= width + 1 && geometry.overflow <= 1, JSON.stringify(geometry));
  assert.ok(geometry.buttons.every(button => Math.abs(button.top - geometry.buttons[0].top) <= 1 && button.height >= (width < 1024 ? 44 : 40)), JSON.stringify(geometry));
  assert.equal(await panel(page).locator('.circuit-pdf-official').count(), 0, 'The baseline banner no longer takes a PDF row');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function managerFits(page, label) {
  const bounds = await panel(page).locator('.circuit-pdf-version-list').evaluate(node => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    const body = node.querySelector('.circuit-pdf-version-body');
    return { manager: rect(node), pdf: rect(node.closest('.circuit-pdf-panel')), body: rect(body), overflow: node.scrollWidth - node.clientWidth, ownScroll: getComputedStyle(body).overflowY };
  });
  assert.ok(bounds.manager.x >= bounds.pdf.x - 1 && bounds.manager.right <= bounds.pdf.right + 1 && bounds.manager.y >= bounds.pdf.y - 1 && bounds.manager.bottom <= bounds.pdf.bottom + 1, label + ': ' + JSON.stringify(bounds));
  assert.ok(bounds.body.bottom <= bounds.manager.bottom + 1 && bounds.overflow <= 1, label + ' controls must stay inside the manager');
  assert.equal(bounds.ownScroll, 'auto');
  return bounds;
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const files = ['Official_20261101.pdf', 'Working_20261108.pdf', 'Working_20261109.pdf'].map(name => path.join(evidence, name));
  files.forEach((filename, index) => fs.writeFileSync(filename, schematic(index ? `WORKING ${index}` : 'OFFICIAL')));
  const fixture = createCircuitChangesServer(), report = { result: 'running', checks: [] };
  const at = '2026-11-09T00:00:00.000Z';
  for (const [id, title] of [['qa-group-a', 'QA 修改組 A'], ['qa-group-b', 'QA 修改組 B']]) fixture.state.sets.set(id, { id, seriesId: 'series:qa', workspaceId: 'bom:qa-board:v2:qa0002', projectId: 'qa-project', title, fromLabel: 'V1', toLabel: 'V2', createdAt: at, updatedAt: at, createdBy: '00000000-0000-4000-8000-000000000001' });
  const materialMock = path.resolve('tests/support/materialWorkspaceMock.js');
  const { createServer } = await import('vite');
  let server, browser;
  const contexts = [];
  try {
    server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, 'vite-cache'), resolve: { alias: [
      { find: /^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/, replacement: materialMock },
      { find: '@/integrations/supabase/client', replacement: path.resolve('tests/support/circuitChangesSupabaseMock.js') },
      { find: /^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement: materialMock },
      { find: '@', replacement: path.resolve('src') },
    ] }, worker: { format: 'es' }, optimizeDeps: { entries: ['tests/support/circuitChangesFixture.jsx'], include: ['react/jsx-dev-runtime', 'exceljs', 'pdfjs-dist'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), evidence, fs.realpathSync('node_modules')] } }, plugins: [
      { name: 'official-pdf-storage', enforce: 'pre', resolveId(source, importer) { if (!importer?.replaceAll('\\', '/').includes('/circuit-changes/')) return; if (source === './storage') return path.resolve('tests/support/circuitChangesStorageMock.js'); if (source === './pdfStorage') return path.resolve('tests/support/circuitChangesPdfStorageMock.js'); if (source === './officialPdfStorage') return path.resolve('tests/support/circuitPdfOfficialMock.js'); } },
      { name: 'official-pdf-http', configureServer(vite) { vite.middlewares.use(fixture.middleware); vite.middlewares.use((req, res, next) => { if (req.url?.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>'); }); } },
    ] });
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: 'chrome' });
    const registry = () => fixture.state.pdfRegistries.get('series:qa');
    const open = async (width, account = 'A') => {
      const context = await browser.newContext({ viewport: { width, height: 884 }, hasTouch: true, isMobile: width < 1024, reducedMotion: 'reduce', locale: 'zh-TW' }); contexts.push(context);
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(25000);
      await page.goto(origin + '/?qaMainRows&qaPages&qaUser=' + account); await page.getByTestId('material-table-card').waitFor();
      if (width < 1024) await page.getByRole('button', { name: '排序與工具', exact: true }).click();
      await page.getByTestId('material-circuit-changes').filter({ visible: true }).click(); await dialog(page).waitFor();
      if (width < 1024) { await page.waitForFunction(()=>{const list=document.querySelector('[data-testid="circuit-changes-dialog"] .circuit-item-list');return list&&list.getAttribute('aria-busy')!=='true';});await page.waitForTimeout(300); await dialog(page).getByRole('button', { name: '看圖面', exact: true }).filter({ visible: true }).first().click(); }
      return { page, errors };
    };
    const desktop = await open(1440), page = desktop.page;
    const versionManager = () => panel(page).getByRole('group', { name: 'PDF 清單（依圖面日期）' });
    await dialog(page).getByRole('tab', { name: /^官方版本/ }).click();
    await dialog(page).getByTestId('circuit-official-versions').getByText('還沒有設定', { exact: true }).waitFor();
    await dialog(page).getByRole('tab', { name: /^AI 比對/ }).click();
    await panel(page).waitFor();
    await panel(page).getByRole('region', { name: 'AI 比對怎麼用', exact: true }).waitFor();
    assert.equal(await panel(page).getByRole('button', { name: '上傳 PDF', exact: true }).count(), 1, 'with no PDF yet AI 比對 offers upload');
    await dialog(page).getByRole('tab', { name: /^線路 Review/ }).click();
    report.checks.push('官方版本 has its own page that says when none is set; AI 比對 waits for a PDF');
    await panel(page).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(files[0]); await rendered(page);
    assert.ok(!fixture.state.pdfOfficials.get('series:qa'), 'Uploading a PDF must not silently designate an official baseline');
    const baselineId = registry().documents[0].id;
    // The official version is set on its own page only; the version list just shows it.
    await dialog(page).getByRole('tab', { name: /^官方版本/ }).click();
    await dialog(page).getByRole('button', { name: '設定官方版本', exact: true }).click();
    await dialog(page).getByRole('button', { name: '設為官方版本：Official_20261101.pdf', exact: true }).click();
    assert.ok(!fixture.state.pdfOfficials.get('series:qa'), 'The confirmation must show before changing the shared pointer');
    await dialog(page).getByRole('button', { name: '確定更換', exact: true }).click();
    await eventually(() => fixture.state.pdfOfficials.get('series:qa')?.documentId === baselineId, 'The explicit pin must persist separately from the version registry');
    await dialog(page).getByRole('tab', { name: /^線路 Review/ }).click(); await rendered(page);
    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    assert.equal(await panel(page).getByRole('button', { name: /^設為官方版本：|^刪除 PDF：/ }).count(), 0, 'The version list has no second way to set the official version or delete');
    const baselineSnapshot = structuredClone(fixture.state.pdfOfficials.get('series:qa').document);
    assert.equal(baselineSnapshot.name, 'Official_20261101.pdf');
    assert.match(await panel(page).locator('.circuit-pdf-baseline-section').innerText(), /Official_20261101\.pdf/);
    assert.equal(await panel(page).getByRole('button', { name: '刪除 PDF：Official_20261101.pdf', exact: true }).count(), 0, 'The official original cannot be deleted');
    const manager = panel(page).getByRole('group', { name: 'PDF 清單（依圖面日期）' });
    await manager.getByText('沒有其他 PDF', { exact: true }).waitFor();
    assert.equal(await manager.locator('.circuit-pdf-baseline-section input').count(), 0, 'A fixed baseline is a readable summary, not disabled input fields');
    assert.equal(await manager.locator('.circuit-pdf-working-section li').count(), 0, 'The official baseline must not be duplicated among working versions');
    await managerFits(page, 'desktop empty working versions');
    await page.screenshot({ path: path.join(evidence, 'manager-official-only-1440.png') });
    await manager.getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    await manager.waitFor({ state: 'hidden' });
    assert.ok(await dialog(page).isVisible(), 'Closing the manager must retain the workspace');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '選擇 PDF');
    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await page.keyboard.press('Escape');
    await manager.waitFor({ state: 'hidden' });
    assert.ok(await dialog(page).isVisible());
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '選擇 PDF');
    report.checks.push('first upload is not silently official; explicit official baseline persists');

    for (const file of files.slice(1)) {
      if (file === files[1]) {
        const chooser = page.waitForEvent('filechooser');
        await panel(page).getByRole('button', { name: '上傳 PDF', exact: true }).click();
        await (await chooser).setFiles(file);
      } else await panel(page).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(file);
      await rendered(page);
      await eventually(() => registry().documents.some(row => row.name === path.basename(file)), 'Every working PDF must append to history');
      assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
      // AI 比對 shows the official version beside the new one; 線路 Review shows the drawing alone.
      await dialog(page).getByRole('tab', { name: /^AI 比對/ }).click();
      await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').waitFor();
      assert.match(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), /Official_20261101\.pdf/);
      await dialog(page).getByRole('tab', { name: /^線路 Review/ }).click();
      await panel(page).locator('.circuit-pdf-page[data-pane="compare"]').waitFor({ state: 'detached' });
    }
    assert.equal(registry().documents.length, 3); assert.equal(fixture.state.pdfs.size, 3, 'No older original file may be overwritten or deleted');
    report.checks.push('two newer working revisions retain the same official pointer and all three original PDFs');

    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    assert.equal(await manager.locator('.circuit-pdf-working-section li').count(), 2);
    assert.equal(await manager.getByLabel('Working_20261109.pdf 的備註', { exact: true }).count(), 0, 'Metadata editors stay hidden until explicitly opened');
    await manager.getByRole('button', { name: '改日期與備註：Working_20261109.pdf', exact: true }).click();
    await manager.getByLabel('Working_20261109.pdf 的備註', { exact: true }).fill('訊號修正'); await page.keyboard.press('Tab');
    await manager.getByLabel('Working_20261109.pdf 的圖面日期', { exact: true }).fill('2026-11-10'); await page.keyboard.press('Tab');
    await eventually(() => { const row = registry().documents.find(row => row.name === 'Working_20261109.pdf'); return row.label === '訊號修正' && row.date === '2026-11-10'; }, 'Version metadata keeps the existing save timing');
    await managerFits(page, 'desktop metadata editing');
    await page.screenshot({ path: path.join(evidence, 'manager-working-edit-1440.png') });
    await manager.getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await manager.getByRole('button', { name: '改日期與備註：Working_20261109.pdf', exact: true }).click();
    assert.equal(await manager.getByLabel('Working_20261109.pdf 的備註', { exact: true }).inputValue(), '訊號修正');
    assert.equal(await manager.getByLabel('Working_20261109.pdf 的圖面日期', { exact: true }).inputValue(), '2026-11-10');
    await page.keyboard.press('Escape');
    report.checks.push('manager separates baseline and working versions; metadata editing is explicit and persists across closing/reopening');

    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await panel(page).getByRole('button', { name: '刪除 PDF：Working_20261108.pdf', exact: true }).click();
    await panel(page).getByRole('button', { name: '確認刪除 Working_20261108.pdf', exact: true }).click();
    if (!(await manager.isVisible())) await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await eventually(() => registry().documents.find(row => row.name === 'Working_20261108.pdf')?.removedAt, 'Archiving must persist without deleting the original');
    assert.equal(fixture.state.pdfs.size, 3);
    await panel(page).getByRole('button', { name: /已刪除的 PDF/ }).click();
    await panel(page).getByRole('button', { name: '還原 PDF：Working_20261108.pdf', exact: true }).click();
    await eventually(() => !registry().documents.find(row => row.name === 'Working_20261108.pdf')?.removedAt, 'An archived working PDF must be restorable');
    assert.equal(fixture.state.pdfs.size, 3); assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
    await page.keyboard.press('Escape');
    report.checks.push('official original cannot be archived; working version archive and restore preserve originals and baseline');

    await dialog(page).getByRole('tab', { name: /^AI 比對/ }).click();
    await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').waitFor();
    await panel(page).getByLabel('目前頁碼', { exact: true }).fill('5'); await panel(page).getByLabel('目前頁碼', { exact: true }).press('Enter'); await rendered(page);
    await panel(page).getByRole('button', { name: '官方對應頁往後一頁', exact: true }).click(); await rendered(page);
    assert.equal(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), 'Official_20261101.pdf 第 6 頁');
    report.checks.push('official comparison supports an explicitly matched page offset');

    // The overview is a slider: drag the white marker, read the label, release to open that page.
    const strip = panel(page).locator('.circuit-pdf-strip'), box = await strip.boundingBox();
    assert.ok(await strip.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'All 500 pages fit the row; nothing to scroll');
    const marker = await strip.locator('[data-current]').boundingBox();
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height / 2, { steps: 10 });
    const scrubbed = /第 (\d+) 頁/.exec(await strip.locator('.circuit-pdf-strip-label').innerText())[1];
    // The drawing follows while the button is still held.
    await page.waitForFunction(value => document.querySelector('input[aria-label="目前頁碼"]').value === value, scrubbed);
    await page.mouse.up();
    assert.ok(Number(scrubbed) > 250, 'Dragging the marker moves through the pages: ' + scrubbed);
    // 500 pages are ~1px each: hovering shows which page a click opens, and the click opens exactly that page.
    await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2);
    const hovered = /第 (\d+) 頁/.exec(await strip.locator('.circuit-pdf-strip-label').innerText())[1];
    await page.mouse.click(box.x + box.width * .2, box.y + box.height / 2);
    await page.waitForFunction(value => document.querySelector('input[aria-label="目前頁碼"]').value === value, hovered);
    await strip.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(value => document.querySelector('input[aria-label="目前頁碼"]').value === String(Number(value) + 1), hovered);
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('input[aria-label="目前頁碼"]').value === '1');
    report.checks.push('dragging the page marker opens the page its label shows; click and arrow keys still work');
    for (const width of [1440, 1280, 1173]) {
      await page.setViewportSize({ width, height: 884 });
      await headerFits(page, width);
      await page.screenshot({ path: path.join(evidence, `header-actions-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 884 });
    report.checks.push('task tabs, 匯出, 更多 and close stay on one row at 1440/1280/1173');
    await strip.focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('input[aria-label="目前頁碼"]').value === '500'); await rendered(page);
    await panel(page).getByLabel('官方對應頁', { exact: true }).fill('500'); await rendered(page);
    assert.equal(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), 'Official_20261101.pdf 第 500 頁');
    const aiButton = panel(page).getByTestId('circuit-pdf-ai-bar').getByRole('button', { name: 'AI 比對新舊版', exact: true });
    assert.equal(await aiButton.isEnabled(), true, 'Matching the last official page must resolve the out-of-range offset and enable review');
    await aiButton.click();
    const aiDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'AI 比對新舊版', exact: true }) });
    await aiDialog.waitFor();
    await aiDialog.getByRole('button', { name: /^(關閉 AI 比對|Close)$/ }).first().click();
    await aiDialog.waitFor({ state: 'hidden' });
    assert.ok(await dialog(page).isVisible());
    report.checks.push('the AI 比對 button opens and closes its review surface without starting a provider analysis');
    const compareBounds = await panel(page).locator('.circuit-pdf-page[data-pane="compare"]').boundingBox(), workingBounds = await panel(page).locator('.circuit-pdf-page[data-pane="active"]').boundingBox();
    assert.ok(compareBounds.x < workingBounds.x && Math.abs(compareBounds.y - workingBounds.y) < 2, 'The desktop official and working drawings must appear side by side');
    report.checks.push('500-page working and official PDFs can navigate and render the last matched page');

    await dialog(page).getByRole('tab', { name: /^改善追蹤/ }).click();
    await dialog(page).getByRole('combobox', { name: '選擇改版紀錄', exact: true }).selectOption('qa-group-b');
    assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
    await dialog(page).getByRole('tab', { name: /^AI 比對/ }).click();
    assert.match(await panel(page).getByTestId('circuit-pdf-ai-bar').locator('[data-side="old"] select').getAttribute('title'), /Official_20261101\.pdf/);
    await page.screenshot({ path: path.join(evidence, 'official-compare-1440.png') });
    await dialog(page).getByRole('button', { name: '關閉線路修改', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' });
    // Legacy version metadata may change; it must never replace the protected official file snapshot.
    const legacyBaseline = registry().documents.find(row => row.id === baselineId);
    Object.assign(legacyBaseline, { name: 'Edited_legacy_metadata.pdf', path: registry().documents.find(row => row.name === 'Working_20261109.pdf').path });
    await page.getByTestId('material-circuit-changes').filter({ visible: true }).click(); await dialog(page).waitFor(); await rendered(page);
    assert.equal(await dialog(page).getByRole('tab', { name: /^AI 比對/ }).getAttribute('aria-selected'), 'true', 'the window reopens on the task used last');
    assert.match(await panel(page).getByTestId('circuit-pdf-ai-bar').locator('[data-side="old"] select').getAttribute('title'), /Official_20261101\.pdf/);
    assert.deepEqual(fixture.state.pdfOfficials.get('series:qa').document, baselineSnapshot, 'Legacy registry metadata cannot mutate the official file snapshot');
    assert.match(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), /Official_20261101\.pdf/);
    report.checks.push('official baseline survives a modification-group switch and closing/reopening the workspace');
    report.checks.push('protected official file snapshot remains independent of later legacy registry edits');

    await dialog(page).getByRole('tab', { name: /^線路 Review/ }).click();
    await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await manager.getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    for (const name of ['Working_20261108.pdf', 'Working_20261109.pdf']) {
      if (!(await manager.isVisible())) await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
      const confirmBar = panel(page).getByRole('group', { name: '確認刪除 PDF' });
      await manager.getByRole('button', { name: '刪除 PDF：' + name, exact: true }).click();
      if (name === 'Working_20261108.pdf') {
        await confirmBar.getByRole('button', { name: '取消', exact: true }).click();
        assert.ok(!registry().documents.find(row => row.name === name).removedAt, 'Cancel must leave the PDF available');
        await manager.getByRole('button', { name: '刪除 PDF：' + name, exact: true }).click();
      }
      await confirmBar.getByRole('button', { name: '確認刪除 ' + name, exact: true }).click();
      await eventually(() => registry().documents.find(row => row.name === name)?.removedAt, 'Deleting the work version keeps its original for restoration');
    }
    if (!(await manager.isVisible())) await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await manager.getByText('沒有其他 PDF', { exact: true }).waitFor();
    await manager.getByRole('button', { name: /已刪除的 PDF/ }).click();
    assert.equal(await manager.getByRole('button', { name: /^還原 PDF：/ }).count(), 2);
    await managerFits(page, 'desktop official-only with deleted working versions');
    await page.screenshot({ path: path.join(evidence, 'manager-deleted-1440.png') });
    const beforeRestore = await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).innerText();
    for (const name of ['Working_20261108.pdf', 'Working_20261109.pdf']) {
      await manager.getByRole('button', { name: '還原 PDF：' + name, exact: true }).click();
      await eventually(() => !registry().documents.find(row => row.name === name)?.removedAt, 'Restore returns the PDF to working versions');
      assert.equal(await panel(page).getByRole('button', { name: '選擇 PDF', exact: true }).innerText(), beforeRestore, 'Restoring does not change the current PDF');
    }
    await manager.getByRole('status').waitFor();
    assert.equal(await manager.locator('.circuit-pdf-working-section li').count(), 2);
    await manager.getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    report.checks.push('official-only empty state, named delete cancel, compact restoration and restored-work feedback are usable without switching the active PDF');

    const viewer = await open(390, 'view'); await rendered(viewer.page);
    await headerFits(viewer.page, 390);
    await viewer.page.screenshot({ path: path.join(evidence, 'header-actions-390.png') });
    await panel(viewer.page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await versionManagerFor(viewer.page).waitFor();
    assert.match(await panel(viewer.page).locator('.circuit-pdf-baseline-section').innerText(), /Official_20261101\.pdf/);
    await versionManagerFor(viewer.page).getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    assert.equal(await viewer.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '選擇 PDF', 'closing the version list returns focus to its button');
    await panel(viewer.page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    assert.equal(await panel(viewer.page).getByRole('button', { name: /設為官方版本：/ }).count(), 0, 'A viewer cannot designate a baseline');
    const versionBounds = await panel(viewer.page).locator('.circuit-pdf-version-list').boundingBox();
    assert.ok(versionBounds.x >= 0 && versionBounds.x + versionBounds.width <= 390 && versionBounds.y + versionBounds.height <= 884, 'The whole phone version popup must fit within the viewport');
    await viewer.page.screenshot({ path: path.join(evidence, 'official-versions-390.png') });
    await managerFits(viewer.page, 'phone manager');
    assert.equal(await panel(viewer.page).getByRole('button', { name: /^改日期與備註：|^刪除 PDF：|^還原 PDF：/ }).count(), 0, 'Read-only people only see opening controls');
    await viewer.page.setViewportSize({ width: 390, height: 500 });
    await viewer.page.waitForFunction(() => document.querySelector('.circuit-pdf-version-list').getBoundingClientRect().bottom <= innerHeight + 1);
    await managerFits(viewer.page, 'short phone manager');
    await viewer.page.screenshot({ path: path.join(evidence, 'manager-short-390.png') });
    await viewer.page.keyboard.press('Escape');
    await viewer.page.screenshot({ path: path.join(evidence, 'official-compare-390.png') });
    assert.equal(await viewer.page.evaluate(() => document.documentElement.scrollWidth), 390, 'The phone page must not overflow horizontally');
    report.checks.push('phone viewer can read the fixed official baseline but has no baseline mutation controls');

    // A legacy board can have every PDF removed before an official baseline was designated.
    fixture.state.pdfOfficials.delete('series:qa');
    for (const row of registry().documents) row.removedAt = '2026-11-10T01:00:00.000Z';
    const recovery = await open(390);
    await panel(recovery.page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    const recoveryManager = panel(recovery.page).getByRole('group', { name: 'PDF 清單（依圖面日期）' });
    await recoveryManager.getByText('沒有其他 PDF', { exact: true }).waitFor();
    await recoveryManager.getByRole('button', { name: /已刪除的 PDF/ }).click();
    await managerFits(recovery.page, 'phone all-archived recovery');
    await recovery.page.screenshot({ path: path.join(evidence, 'manager-all-archived-390.png') });
    await recoveryManager.getByRole('button', { name: '還原 PDF：Working_20261108.pdf', exact: true }).click();
    await eventually(() => !registry().documents.find(row => row.name === 'Working_20261108.pdf')?.removedAt, 'All-archived PDFs remain reachable and restorable');
    assert.ok(!fixture.state.pdfOfficials.get('series:qa'), 'Recovery does not silently assign a new baseline');
    await recoveryManager.getByRole('button', { name: '改日期與備註：Working_20261108.pdf', exact: true }).click();
    await recoveryManager.getByLabel('Working_20261108.pdf 的備註', { exact: true }).fill('手機版本註記');
    await recovery.page.keyboard.press('Tab');
    await eventually(() => registry().documents.find(row => row.name === 'Working_20261108.pdf')?.label === '手機版本註記', 'Phone explicit metadata editing saves');
    await managerFits(recovery.page, 'phone editing working version');
    await recovery.page.screenshot({ path: path.join(evidence, 'manager-edit-390.png') });
    await recoveryManager.getByRole('button', { name: '關閉 PDF 清單', exact: true }).click();
    await recoveryManager.waitFor({ state: 'hidden' });
    assert.ok(await dialog(recovery.page).isVisible());
    const mobileFile = path.join(evidence, 'Mobile_Working_20261110.pdf'); fs.copyFileSync(files[2], mobileFile);
    const mobileChooser = recovery.page.waitForEvent('filechooser');
    // On a phone 上傳 PDF is at the top of the PDF list.
    await panel(recovery.page).getByRole('button', { name: '選擇 PDF', exact: true }).click();
    await recoveryManager.getByRole('button', { name: '上傳 PDF', exact: true }).click();
    await (await mobileChooser).setFiles(mobileFile);
    await recoveryManager.waitFor({ state: 'hidden' });
    await eventually(() => registry().documents.some(row => row.name === 'Mobile_Working_20261110.pdf'), 'Phone new-work button opens a file chooser and uploads its PDF');
    await rendered(recovery.page);
    report.checks.push('a board with no official baseline and every PDF archived can still open the manager and restore a working PDF');
    assert.deepEqual(desktop.errors, []); assert.deepEqual(viewer.errors, []); assert.deepEqual(recovery.errors, []);
    report.result = 'passed'; console.log(JSON.stringify(report));
  } catch (error) {
    report.result = 'failed'; report.failure = String(error.stack || error); console.error(error); process.exitCode = 1;
    for (const [index, context] of contexts.entries()) for (const page of context.pages()) await page.screenshot({ path: path.join(evidence, `failure-${index}.png`) }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2));
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
    if (server) await server.close();
    fixture.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
