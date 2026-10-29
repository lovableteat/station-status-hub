// BOM version control end to end on the isolated material workspace (QA data only, no production reads or writes):
// upload V3 → confirm as a new version → tracking carried by content → compare V2/V3 → export the diff workbook
// → set V2 current again; then the phone layout of the version center must not overflow horizontally.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const PORT = 8096;
const HEADERS = ['Level', 'Name', 'Qty', 'Ref Des', 'Manufacturer Part Number', 'Manufacturer', 'Sourcing Status', '虛擬料號', '實體料號', 'Part Name', 'Part Spec', 'Schematic_Part', 'PCB_Footprint', 'phase out', '零件狀態'];
const line = (name, qty, ref, mpn, maker, virtual, part, extra = {}) => [2, name, qty, ref, mpn, maker, 'Approved', virtual, part, 'QA 公司料名', '10K 1% 0402', 'C', 'c0402', extra.phaseOut ?? '', extra.usage ?? ''];
const heading = (level, name) => [level, name, ...Array(13).fill('')];
function writeV3(dir) {
  const rows = [
    heading(0, 'Sub-BOM Board Level Components'), heading(1, 'QA 原始模組'),
    line('RES 10K 1% 0402 R1', 1, 'R1', 'QA-MPN-0', 'QA Vendor A', '', ''),
    line('RES 10K 1% 0402 R1', 1, 'R1', 'QA-MPN-1', 'QA Vendor B', '', ''),
    line('RES 10K 1% 0402 PR1', 1, 'PR1', 'QA-MPN-2', 'QA Vendor A', '000-VIRTUAL', '000-PHYSICAL-2'),
    line('RES 10K 1% 0402 R10', 3, 'R10', 'QA-MPN-3', 'QA Vendor B', '000-VIRTUAL', '000-PHYSICAL-3', { phaseOut: 'PHASEOUT', usage: '新設計產品不建議使用－EOL' }),
    line('RES 10K 1% 0402 R1_C0P1', 1, 'R1_C0P1', 'QA-MPN-4', 'QA Vendor A', '000-VIRTUAL', '000-PHYSICAL-4'),
    line('IND 3.5uH 0402', 1, 'LB48', 'QA-MPN-5', 'QA Vendor B', '000-VIRTUAL', '000-PHYSICAL-5'),
    line('RES 10K 1% 0402 C1', 1, 'C1', 'QA-MPN-6', 'QA Vendor A', '000-VIRTUAL', '000-PHYSICAL-6'),
    line('RES 10K 1% 0402 J1', 1, 'J1', 'QA-MPN-7', 'QA Vendor B', '', ''),
    line('RES 10K 1% 0402 U1', 1, 'U1', 'QA-MPN-8', 'QA Vendor A', '000-VIRTUAL', '000-PHYSICAL-8'),
    line('RES 10K 1% 0402 J2', 1, 'J2', 'QA-MPN-9', 'QA Vendor B', '000-VIRTUAL', '000-PHYSICAL-9'),
    line('RES 10K 1% 0402 J2', 1, 'J2', 'QA-MPN-10', 'QA Vendor A', '', ''),
    line('LED GREEN 0603', 2, 'D5, D6', 'QA-MPN-11', 'QA Vendor A', '000-VIRTUAL-LED', '000-PHYSICAL-11'),
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), 'QA');
  const file = path.join(dir, 'QA_主板_v3.xlsx');
  XLSX.writeFile(book, file);
  return file;
}

function startHarness() {
  const child = spawn(process.execPath, ['tests/materialWorkspace.browser.cjs'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('harness did not start')), 120000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('Material QA ready')) { clearTimeout(timer); resolve(child); } });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`harness exited with ${code}`)); });
  });
}

(async () => {
  const harness = await startHarness();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bom-versions-'));
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => { throw error; });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole('button', { name: /BOM 管理/ }).waitFor();

    await page.locator('input[type="file"]').setInputFiles(writeV3(dir));
    const dialog = page.getByTestId('bom-upload-dialog');
    await dialog.waitFor();
    assert.match(await dialog.locator('#bom-upload-target-0').textContent(), /QA 主板.*V2 → V3/, 'the file stem preselects the series as the next version');
    assert.match(await dialog.textContent(), /12 筆/, 'parsed row count is shown before anything is written');
    await dialog.locator('#bom-upload-label').fill('EVT rev C');
    await dialog.getByRole('button', { name: '確認上傳' }).click();
    await dialog.waitFor({ state: 'detached' });
    const switcher = page.getByLabel('切換 BOM');
    await page.waitForFunction(() => document.querySelector('[aria-label="切換 BOM"]')?.textContent.includes('V3'));
    assert.equal(await page.getByTestId('material-historical-banner').count(), 0, 'the new version is current, not historical');

    await page.getByRole('button', { name: /BOM 管理/ }).click();
    const table = page.getByTestId('bom-version-table');
    await table.waitFor();
    const versionRows = await table.locator('tr[data-version-id]').allTextContents();
    assert.equal(versionRows.length, 3);
    assert.match(versionRows[0], /V3.*EVT rev C.*QA_主板_v3\.xlsx.*帶入 11.*目前版本/s, 'V3 carried all eleven tracked lines by content and is current');
    assert.match(versionRows[1], /V2.*歷史/s);

    await page.getByTestId('bom-series-detail').getByRole('button', { name: '比對版本' }).click();
    const summary = page.getByTestId('bom-diff-summary');
    await summary.waitFor({ timeout: 15000 });
    const summaryText = await summary.textContent();
    for (const expected of ['新增 1', '移除 0', '變更 1', '未變更 8', '追蹤未帶入 0']) assert.ok(summaryText.includes(expected), `${expected} in ${summaryText}`);
    const diffRows = await page.getByTestId('bom-diff-view').locator('tbody tr').allTextContents();
    assert.ok(diffRows.some((row) => row.includes('D5, D6') && row.includes('新增')), 'added LED position listed');
    assert.ok(diffRows.some((row) => row.includes('R10') && row.includes('Qty：1 → 3')), 'R10 qty change listed');
    assert.equal(await page.getByTestId('bom-diff-view').locator('tbody tr').count(), 2, 'unchanged positions hidden by default');
    await page.getByRole('button', { name: /移除篩選：隱藏未變更/ }).click();
    assert.equal(await page.getByTestId('bom-diff-view').locator('tbody tr').count(), 10, 'removing the chip shows every position');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出差異 Excel' }).click()]);
    const exported = path.join(dir, download.suggestedFilename());
    await download.saveAs(exported);
    assert.match(download.suggestedFilename(), /^BOM差異_.*_V2.*_vs_V3.*\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exported);
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['摘要', '差異明細', '新增料件', '移除料件']);
    const detail = [];
    workbook.getWorksheet('差異明細').eachRow((row, index) => { if (index > 1) detail.push(row.values.slice(1).map((value) => String(value ?? ''))); });
    assert.ok(detail.some((row) => row[0] === 'D5, D6' && row[4] === '整列'));
    assert.ok(detail.some((row) => row[0] === 'R10' && row[4] === 'Qty' && row[5] === '1' && row[6] === '3'));
    assert.ok(detail.some((row) => row[0] === 'R10' && row[4] === 'phase out' && row[6] === 'PHASEOUT'));
    assert.equal(workbook.getWorksheet('新增料件').rowCount, 2);
    await page.getByTestId('bom-version-feedback').waitFor();
    assert.match(await page.getByTestId('bom-version-feedback').textContent(), /已下載 BOM差異_/);

    await page.getByRole('button', { name: '← 返回系列' }).click();
    await table.waitFor();
    await table.locator('tr[data-version-id]').filter({ hasText: 'V2' }).getByRole('button', { name: '設為目前版本' }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor();
    assert.match(await confirm.textContent(), /帶到 V2/, 'switching offers to carry tracking');
    await confirm.getByRole('button', { name: '設為目前版本' }).click();
    await page.waitForFunction(() => { const text = document.querySelector('[aria-label="切換 BOM"]')?.textContent ?? ''; return text.includes('V2') && !text.includes('歷史'); }, null, { timeout: 15000 });
    assert.match(await switcher.textContent(), /V2/);
    await context.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const small = await phone.newPage();
    await small.goto(`http://127.0.0.1:${PORT}/`);
    await small.getByRole('button', { name: /BOM$/ }).click();
    await small.getByTestId('bom-series-list').waitFor();
    await small.getByTestId('bom-series-list').getByRole('button', { name: /QA 主板/ }).first().click();
    await small.getByTestId('bom-series-detail').waitFor();
    await small.getByRole('button', { name: '返回清單' }).waitFor();
    const widths = await small.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth, center: document.querySelector('[data-testid="bom-version-center"]').scrollWidth, centerClient: document.querySelector('[data-testid="bom-version-center"]').clientWidth }));
    assert.ok(widths.document <= widths.viewport, `no page overflow on a phone (${JSON.stringify(widths)})`);
    assert.ok(widths.center <= widths.centerClient, `the version center scrolls only inside its table (${JSON.stringify(widths)})`);
    for (const label of ['上傳新版本', '比對版本', '封存系列', '刪除系列']) assert.ok(await small.getByRole('button', { name: label }).isVisible(), `${label} reachable on a phone`);
    await phone.close();
    console.log('BOM version flow: upload, carry-over, compare, export, switch and phone layout verified on QA data only');
  } finally {
    await browser.close();
    harness.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
