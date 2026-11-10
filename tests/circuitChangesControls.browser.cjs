// Real workspace controls, with all persistence and media isolated to the local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { createCircuitChangesServer } = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_CONTROLS_EVIDENCE_DIR || '../circuit-controls-evidence');

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const fixture = createCircuitChangesServer(), report = { result: 'running', checks: [] };
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
      { name: 'circuit-controls-storage', enforce: 'pre', resolveId(source, importer) { if (!importer?.replaceAll('\\', '/').includes('/circuit-changes/')) return; if (source === './storage') return path.resolve('tests/support/circuitChangesStorageMock.js'); if (source === './pdfStorage') return path.resolve('tests/support/circuitChangesPdfStorageMock.js'); if (source === './officialPdfStorage') return path.resolve('tests/support/circuitPdfOfficialMock.js'); } },
      { name: 'circuit-controls-http', configureServer(vite) { vite.middlewares.use(fixture.middleware); vite.middlewares.use((req, res, next) => { if (req.url?.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>'); }); } },
    ] });
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: 'chrome' });
    for (const width of [1440, 390, 536]) {
      await fetch(origin + '/__circuit/control', { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
      const context = await browser.newContext({ viewport: { width, height: 884 }, hasTouch: true, isMobile: width < 1024, reducedMotion: 'reduce', locale: 'zh-TW' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(25000);
      try {
        await page.goto(origin + '/?qaMainRows&qaPages&qaUser=A');
        await page.getByTestId('material-table-card').waitFor();
        const open = async () => { if (width < 1024) await page.getByRole('button', { name: '排序與工具', exact: true }).tap(); await page.getByTestId('material-circuit-changes').filter({ visible: true }).tap(); await page.getByTestId('circuit-changes-dialog').waitFor(); };
        await open();
        const dialog = page.getByTestId('circuit-changes-dialog');
        await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
        if (width >= 1024) { await page.mouse.click(2, 2); assert.equal(await dialog.isVisible(), true); }
        await dialog.getByRole('button',{name:'更多',exact:true}).tap();await dialog.page().getByRole('menuitem',{name:'使用說明',exact:true}).tap(); await page.getByTestId('circuit-usage-guide').waitFor();
        await page.keyboard.press('Escape'); await page.getByTestId('circuit-usage-guide').waitFor({ state: 'hidden' }); assert.equal(await dialog.isVisible(), true);
        if (width < 1024) await dialog.getByRole('button', { name: '返回問題清單', exact: true }).tap();
        await dialog.getByRole('button',{name:'更多',exact:true}).tap();await dialog.page().getByRole('menuitem',{name:'新增改版清單',exact:true}).tap();
        await page.getByRole('heading', { name: '新增改版清單', exact: true }).waitFor(); await page.keyboard.press('Escape');
        await page.getByRole('heading', { name: '新增改版清單', exact: true }).waitFor({ state: 'hidden' }); assert.equal(await dialog.isVisible(), true);
        if (width < 1024) await dialog.getByRole('button', { name: '新增問題', exact: true }).tap();
        await dialog.getByRole('textbox', { name: '標題', exact: true }).fill('QA 控制色彩 ' + width);
        await page.waitForFunction(() => document.querySelector('.circuit-detail-footer [role="status"]')?.textContent === '已儲存');
        if (width < 1024) await dialog.getByRole('button', { name: '返回問題清單', exact: true }).tap();
        else { const expand = dialog.getByRole('button', { name: '展開修改清單', exact: true }); if (await expand.isVisible()) await expand.tap(); }
        await dialog.getByRole('textbox', { name: '搜尋線路修改', exact: true }).fill('QA 控制');
        await dialog.getByRole('combobox', { name: '篩選修改狀態', exact: true }).selectOption('draft');
        const owner = dialog.getByRole('combobox', { name: '篩選修改負責人', exact: true });
        const ownerValue = await owner.locator('option').nth(1).getAttribute('value'); await owner.selectOption(ownerValue);
        assert.equal(await dialog.getByTestId('circuit-change-item').count(), 1);
        assert.equal(await dialog.getByTestId('circuit-active-filters').getByRole('button').count(), 4);
        const colors = await dialog.locator('.circuit-filter-select').evaluateAll(nodes => nodes.map(node => ({ status: node.dataset.status, active: node.dataset.active, text: getComputedStyle(node.querySelector('select')).color, background: getComputedStyle(node.querySelector('select')).backgroundColor, icon: getComputedStyle(node.querySelector('svg')).color })));
        // Colour pass (2026-11-10): a filter that filters something is tinted with the one accent and its icon turns teal.
        assert.ok(colors.every(color => color.background !== 'rgba(0, 0, 0, 0)' && color.icon !== color.text), JSON.stringify(colors));
        assert.equal(colors[0].icon, colors[1].icon, 'both active filters use the same accent');
        await page.screenshot({ path: path.join(evidence, 'filters-' + width + '.png') });
        if (width >= 1024) { await dialog.getByRole('button', { name: '收合修改清單', exact: true }).tap(); await dialog.getByRole('button', { name: '展開修改清單', exact: true }).tap(); assert.equal(await owner.inputValue(), ownerValue); }
        await dialog.getByRole('button', { name: '移除篩選：狀態：待改善', exact: true }).tap(); assert.equal(await dialog.getByRole('combobox', { name: '篩選修改狀態', exact: true }).inputValue(), 'all');
        await dialog.getByRole('button', { name: '全部清除', exact: true }).tap(); await dialog.getByTestId('circuit-active-filters').waitFor({ state: 'hidden' });
        await dialog.getByRole('button', { name: '新增問題', exact: true }).tap();
        const title = 'QA 明確關閉保存 ' + width;
        await dialog.getByRole('textbox', { name: '標題', exact: true }).fill(title);
        await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
        await dialog.getByRole('button', { name: '關閉線路修改', exact: true }).tap(); await dialog.waitFor({ state: 'hidden' });
        const state = await (await fetch(origin + '/__circuit/state')).json(); assert.ok(state.items.some(item => item.content.title === title), 'explicit close flushes the latest input');
        await open();
        await dialog.getByTestId('circuit-change-item').filter({ hasText: title }).tap();
        await dialog.getByRole('button', { name: '移除問題', exact: true }).tap();
        const remove = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '移除這個問題？', exact: true }) });
        assert.ok((await remove.innerText()).includes('已儲存的追蹤紀錄與原圖保留'));
        await page.screenshot({ path: path.join(evidence, 'remove-' + width + '.png') });
        await remove.getByRole('button', { name: '確認移除', exact: true }).tap(); await remove.waitFor({ state: 'hidden' });
        await dialog.getByRole('button', { name: /^已移除的問題/ }).tap();
        const archive = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '已移除的問題', exact: true }) });
        await page.screenshot({ path: path.join(evidence, 'restore-' + width + '.png') });
        await archive.getByRole('button', { name: /^還原問題 #/ }).tap();
        await archive.getByText('沒有已移除的問題', { exact: true }).waitFor();
        await archive.getByRole('button', { name: '關閉', exact: true }).tap();
        if (width < 1024 && !(await dialog.getByTestId('circuit-change-item').first().isVisible())) await dialog.getByRole('button', { name: '返回問題清單', exact: true }).tap();
        assert.equal(await dialog.getByTestId('circuit-change-item').filter({ hasText: title }).count(), 1);
        assert.deepEqual(errors, []);
        report.checks.push({ width, result: 'passed', colors, interactions: ['ESC and outside keep workspace', 'nested ESC closes only nested dialog', 'search/status/owner and visible chips', 'collapse/expand keeps filters', 'new item and X flush latest draft', 'explicit removal and restore'] });
      } catch (error) { await page.screenshot({ path: path.join(evidence, 'failure-' + width + '.png') }); throw error; }
      finally { await context.close(); }
    }
    report.result = 'passed';
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); await server?.close(); fixture.close(); }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
