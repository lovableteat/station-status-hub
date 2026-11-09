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
      if (width < 1024) await dialog(page).getByRole('button', { name: 'PDF 圖面', exact: true }).click();
      return { page, errors };
    };
    const desktop = await open(1440), page = desktop.page;
    await panel(page).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(files[0]); await rendered(page);
    assert.ok(!fixture.state.pdfOfficials.get('series:qa'), 'Uploading a PDF must not silently designate an official baseline');
    const baselineId = registry().documents[0].id;
    await panel(page).getByRole('button', { name: '選擇 PDF 版本', exact: true }).click();
    await panel(page).getByRole('button', { name: '設為官方基準：Official_20261101.pdf', exact: true }).click();
    assert.ok(!fixture.state.pdfOfficials.get('series:qa'), 'The baseline confirmation must show before changing the shared pointer');
    await panel(page).getByRole('button', { name: '確認設為官方基準：Official_20261101.pdf', exact: true }).click();
    await eventually(() => fixture.state.pdfOfficials.get('series:qa')?.documentId === baselineId, 'The explicit pin must persist separately from the version registry');
    const baselineSnapshot = structuredClone(fixture.state.pdfOfficials.get('series:qa').document);
    assert.equal(baselineSnapshot.name, 'Official_20261101.pdf');
    const official = panel(page).getByTestId('circuit-pdf-official');
    assert.match(await official.innerText(), /Official_20261101\.pdf/);
    assert.equal(await panel(page).getByRole('button', { name: '刪除 PDF：Official_20261101.pdf', exact: true }).count(), 0, 'The official original cannot be deleted');
    await page.keyboard.press('Escape');
    report.checks.push('first upload is not silently official; explicit official baseline persists');

    for (const file of files.slice(1)) {
      await panel(page).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(file); await rendered(page);
      await eventually(() => registry().documents.some(row => row.name === path.basename(file)), 'Every working PDF must append to history');
      assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
      assert.match(await official.innerText(), /Official_20261101\.pdf/);
      await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').waitFor();
      assert.match(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), /Official_20261101\.pdf/);
    }
    assert.equal(registry().documents.length, 3); assert.equal(fixture.state.pdfs.size, 3, 'No older original file may be overwritten or deleted');
    report.checks.push('two newer working revisions retain the same official pointer and all three original PDFs');

    await panel(page).getByRole('button', { name: '選擇 PDF 版本', exact: true }).click();
    await panel(page).getByRole('button', { name: '刪除 PDF：Working_20261108.pdf', exact: true }).click();
    await panel(page).getByRole('button', { name: '確認刪除 11/08 版', exact: true }).click();
    await eventually(() => registry().documents.find(row => row.name === 'Working_20261108.pdf')?.removedAt, 'Archiving must persist without deleting the original');
    assert.equal(fixture.state.pdfs.size, 3);
    await panel(page).getByRole('button', { name: /已刪除的 PDF/ }).click();
    await panel(page).getByRole('button', { name: '還原 PDF：Working_20261108.pdf', exact: true }).click();
    await eventually(() => !registry().documents.find(row => row.name === 'Working_20261108.pdf')?.removedAt, 'An archived working PDF must be restorable');
    assert.equal(fixture.state.pdfs.size, 3); assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
    await page.keyboard.press('Escape');
    report.checks.push('official original cannot be archived; working version archive and restore preserve originals and baseline');

    await panel(page).getByLabel('目前頁碼', { exact: true }).fill('5'); await panel(page).getByLabel('目前頁碼', { exact: true }).press('Enter'); await rendered(page);
    await panel(page).getByRole('button', { name: '對照頁往後一頁', exact: true }).click(); await rendered(page);
    assert.equal(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), 'Official_20261101.pdf 第 6 頁');
    report.checks.push('official comparison supports an explicitly matched page offset');

    const strip = panel(page).locator('.circuit-pdf-strip'), before = await strip.evaluate(node => node.scrollLeft), box = await strip.boundingBox();
    const currentPage = await panel(page).getByLabel('目前頁碼', { exact: true }).inputValue();
    await page.mouse.move(box.x + box.width * .8, box.y + 10); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .2, box.y + 10, { steps: 10 }); await page.mouse.up();
    assert.ok(await strip.evaluate(node => node.scrollLeft) > before + 20, 'Mouse dragging must pan the overview strip');
    assert.equal(await panel(page).getByLabel('目前頁碼', { exact: true }).inputValue(), currentPage, 'A drag must not also navigate to a clicked page');
    await strip.locator('[data-strip-page="100"]').click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="目前頁碼"]').value === '100');
    await strip.locator('[data-strip-page="101"]').press('Enter');
    await page.waitForFunction(() => document.querySelector('input[aria-label="目前頁碼"]').value === '101');
    report.checks.push('mouse drag pans without page jumps; ordinary click and keyboard navigation still work');
    await strip.locator('[data-strip-page="500"]').click(); await rendered(page);
    assert.equal(await panel(page).getByLabel('目前頁碼', { exact: true }).inputValue(), '500');
    await panel(page).getByLabel('官方對應頁', { exact: true }).fill('500'); await rendered(page);
    assert.equal(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), 'Official_20261101.pdf 第 500 頁');
    assert.equal(await panel(page).getByRole('button', { name: 'AI 逐頁初審', exact: true }).isEnabled(), true, 'Matching the last official page must resolve the out-of-range offset and enable review');
    const compareBounds = await panel(page).locator('.circuit-pdf-page[data-pane="compare"]').boundingBox(), workingBounds = await panel(page).locator('.circuit-pdf-page[data-pane="active"]').boundingBox();
    assert.ok(compareBounds.x < workingBounds.x && Math.abs(compareBounds.y - workingBounds.y) < 2, 'The desktop official and working drawings must appear side by side');
    report.checks.push('500-page working and official PDFs can navigate and render the last matched page');

    await dialog(page).locator('.circuit-set select').selectOption('qa-group-b');
    assert.equal(fixture.state.pdfOfficials.get('series:qa').documentId, baselineId);
    assert.match(await official.innerText(), /Official_20261101\.pdf/);
    await page.screenshot({ path: path.join(evidence, 'official-compare-1440.png') });
    await dialog(page).getByRole('button', { name: '關閉線路修改', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' });
    // Legacy version metadata may change; it must never replace the protected official file snapshot.
    const legacyBaseline = registry().documents.find(row => row.id === baselineId);
    Object.assign(legacyBaseline, { name: 'Edited_legacy_metadata.pdf', path: registry().documents.find(row => row.name === 'Working_20261109.pdf').path });
    await page.getByTestId('material-circuit-changes').filter({ visible: true }).click(); await dialog(page).waitFor(); await rendered(page);
    assert.match(await panel(page).getByTestId('circuit-pdf-official').innerText(), /Official_20261101\.pdf/);
    assert.deepEqual(fixture.state.pdfOfficials.get('series:qa').document, baselineSnapshot, 'Legacy registry metadata cannot mutate the official file snapshot');
    assert.match(await panel(page).locator('.circuit-pdf-page[data-pane="compare"] canvas').getAttribute('aria-label'), /Official_20261101\.pdf/);
    report.checks.push('official baseline survives a modification-group switch and closing/reopening the workspace');
    report.checks.push('protected official file snapshot remains independent of later legacy registry edits');

    const viewer = await open(390, 'view'); await rendered(viewer.page);
    assert.match(await panel(viewer.page).getByTestId('circuit-pdf-official').innerText(), /Official_20261101\.pdf/);
    await panel(viewer.page).getByRole('button', { name: '選擇 PDF 版本', exact: true }).click();
    assert.equal(await panel(viewer.page).getByRole('button', { name: /設為官方基準：/ }).count(), 0, 'A viewer cannot designate a baseline');
    const versionBounds = await panel(viewer.page).locator('.circuit-pdf-version-list').boundingBox();
    assert.ok(versionBounds.x >= 0 && versionBounds.x + versionBounds.width <= 390 && versionBounds.y + versionBounds.height <= 884, 'The whole phone version popup must fit within the viewport');
    await viewer.page.screenshot({ path: path.join(evidence, 'official-versions-390.png') });
    await viewer.page.keyboard.press('Escape');
    await viewer.page.screenshot({ path: path.join(evidence, 'official-compare-390.png') });
    assert.equal(await viewer.page.evaluate(() => document.documentElement.scrollWidth), 390, 'The phone page must not overflow horizontally');
    report.checks.push('phone viewer can read the fixed official baseline but has no baseline mutation controls');
    assert.deepEqual(desktop.errors, []); assert.deepEqual(viewer.errors, []);
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
