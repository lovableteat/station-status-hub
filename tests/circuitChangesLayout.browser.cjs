// The real circuit workspace and Review controls, backed only by the local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { createCircuitChangesServer } = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_LAYOUT_EVIDENCE_DIR || '../circuit-layout-evidence');

async function geometry(page, dialog, width, height) {
  const values = await dialog.evaluate(node => {
    const rect = element => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const review = node.querySelector('.circuit-review-bar');
    return { frame: rect(node), overflow: node.scrollWidth - node.clientWidth, panel: rect(node.querySelector('.circuit-detail')), note: rect(review.querySelector('textarea')), actions: rect(review.lastElementChild), footer: rect(node.querySelector('.circuit-detail-footer')), buttons: [...review.querySelectorAll('button')].map(rect) };
  });
  assert.ok(values.frame.left >= -1 && values.frame.top >= -1 && values.frame.right <= width + 1 && values.frame.bottom <= height + 1, JSON.stringify(values));
  assert.ok(values.frame.width >= width - 18, 'The workspace must use the available display width');
  assert.ok(values.overflow <= 1, 'The dialog must not stretch horizontally');
  assert.ok(values.note.width >= Math.min(280, values.panel.width - 36), 'Review comments must retain a usable full line');
  assert.ok(values.note.bottom <= values.actions.top + 1, 'Review actions belong below the comment, not squeezed beside it');
  assert.ok(values.buttons.every(box => box.left >= values.panel.left - 1 && box.right <= values.panel.right + 1 && box.bottom <= height + 1));
  assert.ok(values.footer.bottom <= height + 1 && values.note.top >= 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  return values;
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const fixture = createCircuitChangesServer(), report = { checks: [] };
  const { createServer } = await import('vite');
  const materialMock = path.resolve('tests/support/materialWorkspaceMock.js');
  let server, browser;
  try {
    server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, 'vite-cache'), resolve: { alias: [
      { find: /^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/, replacement: materialMock },
      { find: '@/integrations/supabase/client', replacement: path.resolve('tests/support/circuitChangesSupabaseMock.js') },
      { find: /^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement: materialMock },
      { find: '@', replacement: path.resolve('src') },
    ] }, worker: { format: 'es' }, optimizeDeps: { entries: ['tests/support/circuitChangesFixture.jsx'], include: ['react/jsx-dev-runtime', 'exceljs', 'pdfjs-dist'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), evidence, fs.realpathSync('node_modules')] } }, plugins: [
      { name: 'circuit-layout-storage', enforce: 'pre', resolveId(source, importer) { if (!importer?.replaceAll('\\', '/').includes('/circuit-changes/')) return; if (source === './storage') return path.resolve('tests/support/circuitChangesStorageMock.js'); if (source === './pdfStorage') return path.resolve('tests/support/circuitChangesPdfStorageMock.js'); if (source === './officialPdfStorage') return path.resolve('tests/support/circuitPdfOfficialMock.js'); } },
      { name: 'circuit-layout-http', configureServer(vite) { vite.middlewares.use(fixture.middleware); vite.middlewares.use((req, res, next) => { if (req.url?.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>'); }); } },
    ] });
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: 'chrome' });
    for (const width of [1920, 1543, 1173, 390]) {
      await fetch(origin + '/__circuit/control', { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
      const context = await browser.newContext({ viewport: { width, height: 884 }, hasTouch: true, isMobile: width < 1024, reducedMotion: 'reduce', locale: 'zh-TW' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      try {
        await page.goto(origin + '/?qaMainRows&qaPages&qaUser=A'); await page.getByTestId('material-table-card').waitFor();
        if (width < 1024) await page.getByRole('button', { name: '排序與工具', exact: true }).tap();
        await page.getByTestId('material-circuit-changes').filter({ visible: true }).tap();
        const dialog = page.getByTestId('circuit-changes-dialog'); await dialog.waitFor();
        await dialog.getByRole('textbox', { name: '修改標題', exact: true }).fill('QA 窄欄 Review ' + width);
        await dialog.getByRole('textbox', { name: '修改說明', exact: true }).fill('把 R2301 改為 4.7K，保留原本 Net 名稱。');
        await dialog.getByRole('button', { name: '送出 Review', exact: true }).tap();
        const note = dialog.getByRole('textbox', { name: 'Review 意見或退回原因', exact: true }); await note.waitFor();
        await note.fill('請補上修改後的接線位置，並核對訊號名稱。'.repeat(8));
        const normal = await geometry(page, dialog, width, 884);
        await page.screenshot({ path: path.join(evidence, `review-${width}.png`) });
        await page.setViewportSize({ width, height: 500 });
        await page.waitForFunction(() => document.querySelector('[data-testid="circuit-changes-dialog"]').getBoundingClientRect().bottom <= innerHeight + 1);
        const short = await geometry(page, dialog, width, 500);
        await page.screenshot({ path: path.join(evidence, `short-${width}.png`) });
        await dialog.getByRole('button', { name: '退回補充', exact: true }).tap();
        await dialog.locator('.circuit-returned').waitFor();
        assert.ok((await dialog.locator('.circuit-returned').innerText()).includes('請補上修改後的接線位置'));
        await dialog.getByRole('button', { name: '關閉線路修改', exact: true }).tap(); await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        report.checks.push({ width, result: 'passed', normal, short });
      } catch (error) { await page.screenshot({ path: path.join(evidence, `failure-${width}.png`) }); throw error; }
      finally { await context.close(); }
    }
    report.result = 'passed';
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); await server?.close(); fixture.close(); }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
