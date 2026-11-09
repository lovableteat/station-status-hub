// Run materialWorkspace.browser.cjs first; the real table uses isolated QA data and preferences.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const ExcelJS = require('exceljs');
const origin = process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096';
const evidence = path.resolve(process.env.MATERIAL_COLUMN_CONTEXT_EVIDENCE_DIR || '../material-column-context-evidence');
const prefKey = 'station-status-hub:material-hidden-columns:v1';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const header = (page, label) => page.locator('table.material-table-crosshair > thead > tr').first().locator('th').filter({ hasText: new RegExp(`^${escapeRegex(label)}$`) });
const menu = (page, label) => page.getByRole('menu', { name: `${label} 欄位操作`, exact: true });
const settings = page => page.getByTestId('material-table-settings');
const openSettings = async page => { await page.getByTestId('material-column-visibility').filter({ visible: true }).first().click(); await settings(page).waitFor(); };
const hidden = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), prefKey);

async function hideFromHeader(page, label, keyboard = false) {
  const target = header(page, label);
  await target.scrollIntoViewIfNeeded();
  if (keyboard) { await target.focus(); await target.press('Shift+F10'); }
  else await target.click({ button: 'right' });
  await menu(page, label).waitFor();
  await menu(page, label).getByRole('menuitem', { name: '隱藏此欄位', exact: true }).click();
  await target.waitFor({ state: 'detached' });
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1543, height: 884 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei', reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const report = { result: 'running', checks: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(origin + '/?qaMainRows&qaPages');
    await page.locator('table.material-table-crosshair tbody tr').first().waitFor();
    const initialColumns = await page.locator('table.material-table-crosshair > thead > tr').first().locator('th').count();
    assert.ok(await page.locator('[data-material-cell="schematicPart"]').count() > 0);
    await header(page, 'Schematic_Part').scrollIntoViewIfNeeded();
    await header(page, 'Schematic_Part').click({ button: 'right' });
    await menu(page, 'Schematic_Part').waitFor();
    await page.screenshot({ path: path.join(evidence, 'header-menu.png') });
    await menu(page, 'Schematic_Part').getByRole('menuitem', { name: '隱藏此欄位', exact: true }).click();
    await header(page, 'Schematic_Part').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-material-cell="schematicPart"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: '篩選Schematic_Part', exact: true }).count(), 0);
    assert.equal(await page.locator('table.material-table-crosshair > thead > tr').first().locator('th').count(), initialColumns - 1);
    assert.equal(await page.locator('table.material-table-crosshair tbody tr').first().locator('td').count(), initialColumns - 1);
    assert.deepEqual(await hidden(page), ['schematicPart']);
    await openSettings(page);
    assert.equal(await settings(page).getByRole('checkbox', { name: 'Schematic_Part', exact: true }).isChecked(), false);
    await settings(page).getByRole('button', { name: '取消', exact: true }).click();
    report.checks.push('right-click hide updates header, filter row, body, existing preference and settings checkbox');

    await hideFromHeader(page, 'PCB_Footprint', true);
    assert.deepEqual(await hidden(page), ['schematicPart', 'footprint']);
    await page.reload();
    await page.locator('table.material-table-crosshair tbody tr').first().waitFor();
    assert.equal(await header(page, 'Schematic_Part').count(), 0);
    assert.equal(await header(page, 'PCB_Footprint').count(), 0);
    assert.equal(await page.locator('[data-material-cell="footprint"]').count(), 0);
    report.checks.push('Shift+F10 opens the same header menu, and hiding both CAD columns survives reload');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出顯示欄位', exact: true }).click();
    const download = await downloadPromise;
    const workbookPath = path.join(evidence, 'visible-columns.xlsx'); await download.saveAs(workbookPath);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(workbookPath);
    const sheet = workbook.getWorksheet('顯示欄位');
    const labels = sheet.getRow(1).values.slice(1);
    assert.ok(!labels.includes('Schematic_Part') && !labels.includes('PCB_Footprint'));
    assert.ok(labels.includes('Name') && labels.includes('Note') && labels.includes('狀態追蹤 / 編輯'));
    assert.equal(labels.length, 15); assert.ok(sheet.rowCount > 1);
    report.export = { labels, rows: sheet.rowCount - 1 };
    report.checks.push('visible-column Excel export follows the same hidden state and retains real result rows');

    await header(page, 'Name').click({ button: 'right' }); await menu(page, 'Name').waitFor();
    assert.equal(await menu(page, 'Name').getByRole('menuitem', { name: /^隱藏此欄位/ }).isEnabled(), false);
    await menu(page, 'Name').getByRole('menuitem', { name: '欄位設定', exact: true }).click();
    await settings(page).waitFor();
    for (const label of ['Name', '狀態追蹤 / 編輯', 'Note']) assert.equal(await settings(page).getByRole('checkbox', { name: new RegExp(`^${escapeRegex(label)}`) }).isEnabled(), false);
    for (const label of ['Schematic_Part', 'PCB_Footprint']) await settings(page).getByRole('checkbox', { name: label, exact: true }).check();
    await settings(page).getByRole('button', { name: '套用設定', exact: true }).click();
    await settings(page).waitFor({ state: 'hidden' });
    assert.equal(await header(page, 'Schematic_Part').count(), 1); assert.equal(await header(page, 'PCB_Footprint').count(), 1);
    assert.deepEqual(await hidden(page), []);
    report.checks.push('fixed columns cannot hide; context settings entry restores both columns through the existing apply flow');

    const item = header(page, 'Item'); await item.scrollIntoViewIfNeeded();
    const beforeWidth = (await item.boundingBox()).width;
    const grip = await item.getByRole('button', { name: '拖曳調整欄寬', exact: true }).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction(expected => parseFloat(document.querySelector('table.material-table-crosshair thead tr th:nth-child(2)').style.width) >= expected - 1, beforeWidth + 24);
    assert.ok((await item.boundingBox()).width > beforeWidth + 10, 'left-button resize remains operational');
    const afterResize = (await item.boundingBox()).width;
    await item.getByRole('button', { name: '拖曳調整欄寬', exact: true }).click({ button: 'right' });
    await menu(page, 'Item').waitFor(); await page.keyboard.press('Escape');
    assert.equal((await item.boundingBox()).width, afterResize, 'right-button context menu must not resize the column');
    report.checks.push('normal resize still works and right-clicking its handle does not resize');

    await page.getByRole('button', { name: '篩選Manufacturer', exact: true }).click();
    const filter = page.getByTestId('material-column-filter-panel'); await filter.waitFor();
    await filter.getByRole('textbox', { name: '搜尋Manufacturer篩選值', exact: true }).fill('QA MAIN CO');
    await filter.getByRole('button', { name: '確定', exact: true }).click();
    await filter.waitFor({ state: 'hidden' });
    const chip = page.getByTestId('material-active-filters').getByRole('button', { name: /移除篩選：Manufacturer/ }); await chip.waitFor();
    const filteredRows = await page.locator('table.material-table-crosshair tbody tr').count(); assert.ok(filteredRows > 0);
    await page.setViewportSize({ width: 1173, height: 600 });
    await hideFromHeader(page, 'Schematic_Part');
    assert.equal(await page.locator('table.material-table-crosshair tbody tr').count(), filteredRows);
    assert.equal(await chip.isVisible(), true);
    await page.screenshot({ path: path.join(evidence, 'hidden-filter-preserved-1173.png') });
    report.checks.push('existing Excel filter remains visible and keeps the same results after hiding a column at narrow desktop size');
    assert.deepEqual(report.errors, []); report.result = 'passed';
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.result = 'failed'; report.failure = error.message;
    await page.screenshot({ path: path.join(evidence, 'failure.png') }); throw error;
  } finally {
    fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2));
    await context.close(); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
