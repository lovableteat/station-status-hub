// Run materialWorkspace.browser.cjs first. Logical viewport sizes reproduce browser zoom reflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const origin = process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8196';
const output = path.resolve(process.env.MATERIAL_ZOOM_EVIDENCE_DIR || '../material-table-zoom-evidence');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?qaMainRows&qaPages');
    await page.locator('table.material-table-crosshair tbody tr').first().waitFor();
    await page.getByRole('combobox', { name: '每頁筆數', exact: true }).click();
    await page.getByRole('option', { name: '25 列', exact: true }).click();
    for (const zoom of [0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 1, 0.8]) {
      const width = Math.round(1920 / zoom), height = Math.round(900 / zoom);
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (width < 1024) await page.getByTestId('material-pagination').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const footer = document.querySelector('[data-testid="material-pagination"]').getBoundingClientRect();
        return footer.bottom <= innerHeight + 1 && (innerWidth < 1024 || footer.bottom >= innerHeight - 20);
      }, null, { timeout: 3500 }).catch(async error => { await page.screenshot({ path: path.join(output, 'footer-clipped.png') }); throw error; });
      const geometry = await page.getByTestId('material-pagination').boundingBox();
      assert.ok(geometry.y >= 0 && geometry.y + geometry.height <= height + 1, JSON.stringify({ zoom, geometry }));
      const table = page.getByTestId('material-table-scroll');
      if (await table.count()) await table.evaluate(node => { node.scrollTop = node.scrollHeight; node.scrollLeft = node.scrollWidth; });
      const top = page.getByRole('region', { name: 'BOM 表格左右捲動', exact: true });
      if (await top.count()) await page.waitForFunction(() => document.querySelector('.material-table-top-scroll').scrollLeft === document.querySelector('[data-testid="material-table-scroll"]').scrollLeft);
      await page.getByTestId('material-pagination').getByRole('button', { name: '下一頁', exact: true }).click();
      await page.getByTestId('material-pagination').getByText('第 2 /', { exact: false }).waitFor();
      await page.getByTestId('material-pagination').getByRole('button', { name: '上一頁', exact: true }).click();
      await page.getByTestId('material-pagination').getByText('第 1 /', { exact: false }).waitFor();
      await page.screenshot({ path: path.join(output, `zoom-${Math.round(zoom * 100)}.png`) });
      results.push({ zoom, width, height, footer: geometry });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ result: 'passed', method: 'browser zoom layout viewport emulation', results }, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
