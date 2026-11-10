// The real circuit workspace and Review controls, backed only by the local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { jsPDF } = require('jspdf');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { createCircuitChangesServer } = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_LAYOUT_EVIDENCE_DIR || '../circuit-layout-evidence');

async function panelControl(button, label, expanded) {
  assert.equal((await button.innerText()).trim(), label);
  assert.equal(await button.getAttribute('aria-expanded'), String(expanded));
  assert.ok(await button.locator('span').isVisible(), label + ' must be visible');
  const bounds = await button.boundingBox();
  assert.ok(bounds.width >= 60 && bounds.height >= 40, JSON.stringify({ label, bounds }));
  assert.ok(await button.evaluate(node => node.scrollWidth <= node.clientWidth + 1), label + ' must fit');
}

async function compareDrawings(page, dialog) {
  const panel = dialog.getByTestId('circuit-pdf-panel');
  const rendered = () => page.waitForFunction(() => { const pages = [...document.querySelectorAll('.circuit-pdf-surface')]; return pages.length > 0 && pages.every(node => node.dataset.rendering === 'false'); });
  for (const [name, net] of [['Official_20261101.pdf', 'P12V_EN'], ['Working_20261110.pdf', 'P12V_VR_EN']]) {
    const pdf = new jsPDF({ unit: 'pt', format: [1190, 842], orientation: 'landscape' });
    pdf.setFontSize(24); pdf.text(name, 50, 60); pdf.rect(100, 150, 90, 50); pdf.setFontSize(14); pdf.text('R2301', 110, 175); pdf.line(190, 175, 500, 175); pdf.text(net, 250, 165);
    const file = path.join(evidence, name); fs.writeFileSync(file, Buffer.from(pdf.output('arraybuffer')));
    await panel.locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(file); await rendered();
    if (name.startsWith('Official')) {
      await dialog.getByRole('tab', { name: /^官方版本/ }).click();
      await dialog.getByRole('button', { name: /^(設定|更換)官方版本$/ }).click();
      await dialog.getByRole('button', { name: `設為官方版本：${name}`, exact: true }).click();
      await dialog.getByRole('button', { name: '確定更換', exact: true }).click();
      await dialog.locator('.circuit-official-history tbody tr').first().waitFor();
      await dialog.getByRole('tab', { name: /^線路 Review/ }).click();
    }
  }
  // AI 比對 puts the official version beside the working one.
  await dialog.getByRole('tab', { name: /^AI 比對/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.circuit-pdf-surface').length === 2); await rendered();
}


async function geometry(page, dialog, width, height) {
  const values = await dialog.evaluate(node => {
    const rect = element => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const review = node.querySelector('.circuit-review-bar');
    return { frame: rect(node), overflow: node.scrollWidth - node.clientWidth, panel: rect(node.querySelector('.circuit-detail')), note: rect(review.querySelector('textarea')), actions: rect(review.lastElementChild), footer: rect(node.querySelector('.circuit-detail-footer')), buttons: [...review.querySelectorAll('button')].map(rect) };
  });
  assert.ok(values.frame.left >= -1 && values.frame.top >= -1 && values.frame.right <= width + 1 && values.frame.bottom <= height + 1, JSON.stringify(values));
  // Desktop leaves a 17px gutter; phones keep the full screen.
  if (width >= 1024) assert.ok(Math.abs(values.frame.width - (width - 34)) <= 2 && Math.abs(values.frame.height - (height - 34)) <= 2 && values.frame.top >= 15 && values.frame.bottom <= height - 15, 'The workspace leaves a small gutter: ' + JSON.stringify(values.frame));
  else assert.ok(values.frame.width >= width - 2, 'On a phone the workspace uses the whole width');
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
    for (const width of (process.env.CIRCUIT_LAYOUT_WIDTHS || '2400,1920,1543,1173,390').split(',').map(Number)) {
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
        const task = async name => { await dialog.getByRole('tab', { name: new RegExp('^' + name) }).tap(); await page.waitForFunction(label => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.includes(label), name); };
        if (width === 1920) { await compareDrawings(page, dialog); await task('線路 Review'); }
        await dialog.getByRole('textbox', { name: '標題', exact: true }).fill('QA 窄欄 Review ' + width);
        // Beside the drawing the form is 標記問題; its 問題說明 is what collapsing must keep.
        const note = dialog.getByRole('textbox', { name: '問題說明', exact: true });
        await note.fill('請補上修改後的接線位置，並核對訊號名稱。'.repeat(8));
        let collapse;
        if (width >= 1024) {
          const detail = dialog.getByTestId('circuit-change-detail');
          const pdf = dialog.getByTestId('circuit-pdf-panel');
          const beforeWidth = await pdf.evaluate(node => node.getBoundingClientRect().width);
          const noteText = await note.inputValue();
          const titleText = await detail.getByRole('textbox', { name: '標題', exact: true }).inputValue();
          const scroll = detail.locator('.circuit-detail-scroll');
          const scrollTop = await scroll.evaluate(node => { node.scrollTop = Math.min(140, node.scrollHeight - node.clientHeight); return node.scrollTop; });
          const originalListCollapsed = await dialog.locator('.circuit-workspace').getAttribute('data-list-collapsed') === 'true';
          for (let cycle = 0; cycle < 2; cycle++) {
            await panelControl(dialog.getByRole('button', { name: '收合修改內容', exact: true }), '收合', true);
            await dialog.getByRole('button', { name: '收合修改內容', exact: true }).click();
            await detail.waitFor({ state: 'hidden' });
            const expand = dialog.getByRole('button', { name: '展開修改內容', exact: true });
            await expand.waitFor();
            await panelControl(expand, '展開內容', false);
            await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '展開修改內容');
            assert.equal(await expand.getAttribute('aria-expanded'), 'false');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('circuit-changes-layout:v1')).detail), false);
            const wider = await pdf.evaluate(node => node.getBoundingClientRect().width);
            assert.ok(wider > beforeWidth + 250, `The PDF should gain the form width: ${beforeWidth} -> ${wider}`);
            assert.ok(Math.abs(await dialog.locator('.circuit-detail-rail').evaluate(node => node.getBoundingClientRect().width) - 72) <= 1);
            if (cycle === 0) {
              const switchList = async collapsed => {
                const control = dialog.getByRole('button', { name: collapsed ? '展開修改清單' : '收合修改清單', exact: true });
                await panelControl(control, collapsed ? '展開清單' : '收合清單', !collapsed);
                await control.click();
              };
              await switchList(originalListCollapsed);
              assert.equal(await dialog.locator('.circuit-workspace').getAttribute('data-detail-collapsed'), 'true');
              assert.ok((await pdf.evaluate(node => node.getBoundingClientRect().width)) > 300);
              assert.ok(await dialog.getByRole('button', { name: '展開修改內容', exact: true }).isVisible());
              await switchList(!originalListCollapsed);
              await page.screenshot({ path: path.join(evidence, `collapsed-${width}.png`) });
            }
            await expand.click();
            await detail.waitFor({ state: 'visible' });
            await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '收合修改內容');
            const restoredScrollTop = await scroll.evaluate(node => node.scrollTop);
            assert.ok(Math.abs(restoredScrollTop - scrollTop) <= 1, `Detail scroll position must be restored: ${scrollTop} -> ${restoredScrollTop} (cycle ${cycle})`);
            assert.equal(await note.inputValue(), noteText);
            assert.equal(await detail.getByRole('textbox', { name: '標題', exact: true }).inputValue(), titleText);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('circuit-changes-layout:v1')).detail), true);
          }
          if (width === 1920) {
            await dialog.getByRole('button', { name: '收合修改內容', exact: true }).click();
            await page.reload();
            await page.getByTestId('material-circuit-changes').filter({ visible: true }).click();
            await dialog.getByRole('button', { name: '展開修改內容', exact: true }).waitFor();
            assert.equal(await detail.isVisible(), false, 'The saved desktop collapse survives a full reload');
            await page.setViewportSize({ width: 390, height: 884 });
            await page.waitForFunction(() => !document.querySelector('[data-testid="circuit-change-detail"]').hidden);
            // The window remembers 線路 Review; on a phone it opens on the form, and the drawing only on request.
            if (await dialog.getByTestId('circuit-pdf-panel').isVisible()) await dialog.getByRole('button', { name: '返回修改內容', exact: true }).tap();
            if (!(await dialog.getByTestId('circuit-change-item').first().isVisible())) await dialog.getByRole('button', { name: '返回問題清單', exact: true }).tap();
            await dialog.getByTestId('circuit-change-item').first().tap();
            await detail.waitFor({ state: 'visible' });
            assert.equal(await dialog.getByRole('button', { name: '收合修改內容', exact: true }).count(), 0);
            await page.setViewportSize({ width, height: 884 });
            await dialog.getByRole('button', { name: '收合修改內容', exact: true }).waitFor();
            await note.fill(noteText);
          }
          collapse = { beforeWidth, preservedScrollTop: scrollTop, cycles: 2, bothListStates: true, reloadAndMobileTransition: width === 1920, actualPdfComparison: width === 1920 };
        } else {
          assert.equal(await dialog.getByRole('button', { name: '收合修改內容', exact: true }).count(), 0, 'Phone keeps its existing single-pane flow');
        }
        // 改善追蹤: the fix is written and sent, then the reviewer writes a long note beside 確認結案 / 退回重改.
        await task('改善追蹤');
        await dialog.getByRole('textbox', { name: '改善說明', exact: true }).fill('把 R2301 改為 4.7K，保留原本 Net 名稱。');
        await dialog.getByRole('button', { name: '回報改善', exact: true }).tap();
        const reviewNote = dialog.getByRole('textbox', { name: '主管意見或退回原因', exact: true }); await reviewNote.waitFor();
        await reviewNote.fill('請補上修改後的接線位置，並核對訊號名稱。'.repeat(8));
        const normal = await geometry(page, dialog, width, 884);
        await page.screenshot({ path: path.join(evidence, `review-${width}.png`) });
        await page.setViewportSize({ width, height: 500 });
        await page.waitForFunction(() => document.querySelector('[data-testid="circuit-changes-dialog"]').getBoundingClientRect().bottom <= innerHeight + 1);
        const short = await geometry(page, dialog, width, 500);
        await page.screenshot({ path: path.join(evidence, `short-${width}.png`) });
        await dialog.getByRole('button', { name: '退回重改', exact: true }).tap();
        await dialog.locator('.circuit-returned').waitFor();
        assert.ok((await dialog.locator('.circuit-returned').innerText()).includes('請補上修改後的接線位置'));
        if (width < 1024) {
          const back = dialog.getByRole('button', { name: '返回問題清單', exact: true });
          const bounds = await back.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44);
          await back.tap(); await dialog.getByTestId('circuit-change-item').first().tap();
          await dialog.locator('.circuit-returned').waitFor();
        }
        await dialog.getByRole('button', { name: '關閉線路修改', exact: true }).tap(); await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        report.checks.push({ width, result: 'passed', collapse, normal, short });
      } catch (error) { await page.screenshot({ path: path.join(evidence, `failure-${width}.png`) }); throw error; }
      finally { await context.close(); }
    }
    report.result = 'passed';
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser?.close(); await server?.close(); fixture.close(); }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
