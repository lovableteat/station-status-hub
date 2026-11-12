// Run materialWorkspace.browser.cjs on MATERIAL_QA_URL first. All data is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const origin = new URL(process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096').origin;
const evidence = path.resolve(process.env.MATERIAL_SEED_EVIDENCE_DIR || '../material-seed-removal-evidence');
const template = JSON.parse(fs.readFileSync('tests/fixtures/materialWorkbook.synthetic.json', 'utf8')).records[0];
const storageKey = 'station-status-hub:material-changes:v1';

async function verifyMobileDetail(page, recordId, expectedText) {
  const row = page.locator(`[data-testid="material-mobile-list-row"][data-record-id="${recordId}"]`);
  await row.getByTestId('material-mobile-row-open').click();
  const detail = page.getByTestId('material-mobile-detail');
  await detail.waitFor();
  for (const text of expectedText) await detail.getByText(text, { exact: false }).first().waitFor();
  await detail.getByRole('button', { name: '關閉料件詳情', exact: true }).click();
  await detail.waitFor({ state: 'hidden' });
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) for (const scenario of ['existing', 'empty', 'local-recovery', 'read-error']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 500, hasTouch: width < 500, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const failures = [], requests = [];
      page.on('pageerror', error => failures.push(error.message));
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        return url.origin === origin ? route.continue() : route.abort();
      });
      const saved = { added: [{ ...template, id: 'local-added', refDes: 'R-LOCAL', refGroup: 'R-LOCAL' }], updated: { edited: { ...template, id: 'local-edited', refDes: 'R-EDITED', refGroup: 'R-EDITED', note: 'Unsynced note must survive' } } };
      if (scenario === 'local-recovery') await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify(saved) });
      if (scenario === 'read-error') await context.addInitScript(() => localStorage.setItem('station-status-hub:active-material-bom:v1', 'bom:qa-board:v2:qa0002'));
      const mode = scenario === 'local-recovery' ? 'empty' : scenario;
      try {
        await page.goto(`${origin}/?qaBomSafety=${mode}`);
        await page.getByTestId('material-table-card').waitFor({ timeout: 120000 });
        await page.waitForFunction(() => window.__qaBomSafety?.reads > 0);
        const rows = width < 500 ? page.getByTestId('material-mobile-list-row') : page.locator('table.material-table-crosshair tbody tr[data-record-id]');
        if (scenario === 'empty') {
          // The selected label also contains its version badge on desktop and BOM count on mobile.
          await page.getByLabel('切換 BOM', { exact: true }).filter({ hasText: '尚未匯入 BOM' }).waitFor();
          assert.equal(await rows.count(), 0);
        } else if (scenario === 'local-recovery') {
          await page.getByLabel('切換 BOM', { exact: true }).filter({ hasText: '本機保留的 BOM 修改' }).waitFor();
          if (width < 500) {
            // The merged main follows location sorting, not the order of saved additions/edits.
            const mergedRow = rows.filter({ hasText: template.name }).filter({ hasText: template.partNumber });
            await mergedRow.waitFor();
            assert.equal(await mergedRow.count(), 1, 'both local locations share one displayed main part');
            await mergedRow.getByTestId('material-mobile-row-open').click();
            const detail = page.getByTestId('material-mobile-detail');
            await detail.waitFor();
            const locations = detail.getByTestId('material-mobile-location');
            for (const ref of ['R-LOCAL', 'R-EDITED']) {
              await locations.getByRole('button', { name: new RegExp(`^位置：${ref} · 用量`) }).waitFor();
            }
            assert.equal(await locations.count(), 2, 'both recovered locations remain available in details');
            await detail.getByRole('button', { name: '關閉料件詳情', exact: true }).click();
            await detail.waitFor({ state: 'hidden' });
          } else {
            // Identical main parts merge; the collapsed REF DES preview shows only one location.
            await rows.getByRole('button', { name: '展開 2 個使用位置', exact: true }).click();
            for (const [id, ref] of [['local-added', 'R-LOCAL'], ['local-edited', 'R-EDITED']]) {
              const recoveredRow = rows.filter({ hasText: `位置：${ref}` });
              await recoveredRow.waitFor();
              assert.equal(await recoveredRow.getAttribute('data-record-id'), id);
            }
          }
          assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), JSON.stringify(saved));
        } else {
          if (width < 500) await verifyMobileDetail(page, 'qa-0', ['QA-MPN-0']);
          else await page.waitForFunction(() => document.body.textContent.includes('QA-MPN-0'));
          await page.getByRole('button', { name: 'QA 帳號 B（檢視）', exact: true }).click();
          if (width < 500) await verifyMobileDetail(page, 'qa-0', ['QA-MPN-0']);
          else await page.waitForFunction(() => document.body.textContent.includes('QA-MPN-0'));
        }
        assert.deepEqual(await page.evaluate(() => window.__qaBomSafety.writes), []);
        assert.equal(requests.some(url => /materialRequestSeed/.test(url)), false);
        assert.deepEqual(failures, []);
        await page.screenshot({ path: path.join(evidence, `${scenario}-${width}.png`), fullPage: false });
        results.push({ scenario, width, result: 'passed', automaticWrites: 0, seedRequests: 0 });
      } catch (error) {
        console.error(JSON.stringify({ scenario, width, error: error.message, body: (await page.locator('body').innerText()).slice(0, 12000) }));
        await page.screenshot({ path: path.join(evidence, `${scenario}-${width}-failure.png`), fullPage: false });
        throw error;
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
