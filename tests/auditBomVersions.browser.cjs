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

// Windows reserves port ranges for Hyper-V now and then: MATERIAL_QA_PORT moves the harness and this test together.
const PORT = Number(process.env.MATERIAL_QA_PORT || 8096);
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

    const file = writeV3(dir);
    await page.locator('input[type="file"]').setInputFiles(file);
    const dialog = page.getByTestId('bom-upload-dialog');
    await dialog.waitFor();
    assert.match(await dialog.locator('#bom-upload-target-0').textContent(), /QA 主板.*V2 → V3/, 'the file stem preselects the series as the next version');
    assert.match(await dialog.textContent(), /12 筆/, 'parsed row count is shown before anything is written');
    await dialog.locator('#bom-upload-label').fill('EVT rev C');
    await page.evaluate(() => {
      window.__qaBomUploadSourceGate = new Promise(resolve => { window.__qaFinishBomUploadSource = resolve; });
    });
    await dialog.getByRole('button', { name: '確認上傳' }).click();
    const saving = dialog.getByRole('button', { name: '正在建立 BOM 版本…' });
    await saving.waitFor();
    assert.ok(await saving.isDisabled());
    assert.equal(await dialog.locator('[data-ui="dialog-close"]').count(), 0, 'the writing dialog cannot be accidentally dismissed');
    assert.equal(await page.getByText('BOM 版本已建立', { exact: true }).count(), 0, 'completion waits for the original workbook save');
    if (process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH.replace(/\.png$/, '-upload-loading.png') });
    await page.evaluate(() => window.__qaFinishBomUploadSource());
    await dialog.waitFor({ state: 'detached' });
    const uploadFeedback = page.locator('[data-ui="toast"]').filter({ hasText: 'BOM 版本已建立' });
    await uploadFeedback.waitFor();
    assert.match(await uploadFeedback.textContent(), /V2 → V3：新增 1 · 移除 0 · 變更 1/, 'the upload result says what changed');
    assert.match(await uploadFeedback.textContent(), /已帶入舊版的追蹤、Note、負責人與 SPEC 附件 2 筆/, 'and what carried over');
    assert.ok(await uploadFeedback.evaluate(element => element.classList.contains('bom-upload-toast') && !element.classList.contains('bom-upload-toast--warning')));
    if (process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH.replace(/\.png$/, '-upload-success.png') });
    await uploadFeedback.locator('[toast-close]').click();
    const switcher = page.getByLabel('切換 BOM');
    await page.waitForFunction(() => document.querySelector('[aria-label="切換 BOM"]')?.textContent.includes('V3'));
    assert.equal(await page.getByTestId('material-historical-banner').count(), 0, 'the new version is current, not historical');

    await page.getByRole('button', { name: /BOM 管理/ }).click();
    // BOM 管理 opens on the board's project (2026-11-22 levels); the row marked 畫面中 opens its versions.
    await page.getByTestId('bom-series-list').locator('.bom-series-row[aria-current="true"]').click();
    const table = page.getByTestId('bom-version-table');
    await table.waitFor();
    const versionRows = await table.locator('tr[data-version-id]').allTextContents();
    assert.equal(versionRows.length, 3);
    // 狀態 sits right after 版本 (2026-11-10), so the sticky 操作 column never hides it.
    // Eleven lines matched V2; only the two with website data (R1 tracking, U1 SYMBOL申請中 + 負責人) count as carried.
    assert.match(versionRows[0], /V3.*目前版本.*EVT rev C.*QA_主板_v3\.xlsx.*帶入 2/s, 'V3 carried the two lines that had website data and is current');
    assert.match(await table.locator('tr[data-version-id]').first().locator('.bom-version-chip-row[title]').getAttribute('title'), /^11 筆料件對上前一版，其中 2 筆/);
    assert.match(versionRows[1], /V2.*歷史/s);

    await page.getByTestId('bom-series-detail').getByRole('button', { name: '比對版本' }).click();
    const summary = page.getByTestId('bom-diff-summary');
    await summary.waitFor({ timeout: 15000 });
    const summaryText = await summary.textContent();
    for (const expected of ['新增 1', '移除 0', '變更 1', '未變更 8', '未帶入 0']) assert.ok(summaryText.includes(expected), `${expected} in ${summaryText}`);
    // 2026-11-18: the comparison opens on 依料號 — one line per part that was added, removed or moved.
    const partRows = await page.getByTestId('bom-part-table').locator('tbody tr').allTextContents();
    assert.ok(partRows.some((row) => row.includes('新增') && row.includes('QA-MPN-11') && row.includes('V3 新增在 D5, D6')), partRows.join(' | '));
    assert.equal(partRows.length, 1, 'only the LED is a new part; R10 kept its part and positions');
    await page.getByRole('tab', { name: /依位號明細/ }).click();
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
    assert.match(await page.getByTestId('bom-version-feedback').textContent(), /已匯出 BOM差異_/);

    await page.getByRole('button', { name: '← 返回系列' }).click();
    await table.waitFor();
    await table.locator('tr[data-version-id]').filter({ hasText: 'V2' }).getByRole('button', { name: '設為目前版本' }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor();
    // Going back to an older version never carries the newer version's data (2026-11-18, the user).
    assert.match(await confirm.textContent(), /V2 會維持原本的樣子，不會帶入 V3 的資料/, 'going back carries nothing');
    assert.equal(await confirm.getByRole('checkbox').count(), 0);
    await confirm.getByRole('button', { name: '設為目前版本' }).click();
    await page.waitForFunction(() => { const text = document.querySelector('[aria-label="切換 BOM"]')?.textContent ?? ''; return text.includes('V2') && !text.includes('歷史'); }, null, { timeout: 15000 });
    assert.match(await switcher.textContent(), /V2/);
    await context.close();

    // 2026-11-17 Baseboard: an older upload left V1's applications behind although V2 has the same parts.
    // 未帶入 opens the comparison on 只看未帶入, positions that only lost data stay visible, and 帶入舊版資料 fills them once.
    const repair = await browser.newContext({ viewport: { width: 1480, height: 900 }, reducedMotion: 'reduce' });
    const fix = await repair.newPage();
    fix.on('pageerror', (error) => { throw error; });
    await fix.goto(`http://127.0.0.1:${PORT}/?qaRecarry`);
    await fix.getByRole('button', { name: /BOM 管理/ }).click();
    // BOM 管理 opens on the board's project (2026-11-22 levels); the row marked 畫面中 opens its versions.
    await fix.getByTestId('bom-series-list').locator('.bom-series-row[aria-current="true"]').click();
    await fix.getByTestId('bom-version-orphaned').first().click();
    await fix.getByTestId('bom-diff-summary').waitFor({ timeout: 15000 });
    const recarryBanner = fix.getByTestId('bom-diff-recarry');
    assert.match(await recarryBanner.textContent(), /2 筆舊版資料在新版找得到同一顆料/);
    assert.equal(await fix.getByTestId('bom-diff-view').locator('tbody tr[data-diff-entry]').count(), 3, 'PR1 and R1_C0P1 have no field change but lost data, and U9 is gone');
    await recarryBanner.getByRole('button', { name: '帶入舊版資料 2 筆' }).click();
    assert.match(await fix.getByTestId('bom-version-feedback').textContent(), /帶入 V2 2 筆；另有 1 筆在新版找不到同一顆料/);
    await recarryBanner.waitFor({ state: 'detached' });
    // The comparison runs again from the saved rows.
    await fix.getByTestId('bom-diff-summary').waitFor({ timeout: 15000 });
    assert.equal(await recarryBanner.count(), 0, 'nothing left to carry once it is filled');
    assert.match(await fix.getByRole('button', { name: /^未帶入/ }).first().textContent(), /未帶入\s*1/);
    await fix.getByRole('button', { name: '← 返回系列' }).click();
    // The QA V2 predates separate counts (「對上 6」): that number stays, only 未帶入 is recounted.
    assert.match(await fix.locator('tr[data-current="true"]').textContent(), /對上 6.*未帶入 1/);
    await repair.close();

    // The real Baseboard loss: V1's application sat on a vendor line the new BOM dropped (U9). It stays in V2's
    // 待處理料, 每週申請進度 and exports, read-only, under 舊版申請, and the comparison says where it went.
    const keep = await browser.newContext({ viewport: { width: 1480, height: 900 }, reducedMotion: 'reduce' });
    const kept = await keep.newPage();
    kept.on('pageerror', (error) => { throw error; });
    await kept.goto(`http://127.0.0.1:${PORT}/`);
    await kept.getByRole('button', { name: /BOM 管理/ }).click();
    // BOM 管理 opens on the board's project (2026-11-22 levels); the row marked 畫面中 opens its versions.
    await kept.getByTestId('bom-series-list').locator('.bom-series-row[aria-current="true"]').click();
    await kept.getByTestId('bom-version-orphaned').first().click();
    await kept.getByTestId('bom-diff-summary').waitFor({ timeout: 15000 });
    await kept.getByTestId('bom-diff-view').locator('tbody tr[data-diff-entry]').filter({ hasText: 'U9' }).getByRole('button', { name: '展開' }).click();
    assert.match(await kept.getByTestId('bom-diff-lost-data').textContent(), /新版已沒有這些位號。申請紀錄仍列在新版待處理料最下面、依版本分組/);
    await kept.keyboard.press('Escape');
    await kept.getByTestId('bom-version-center').waitFor({ state: 'detached' });
    // V1 loads after the page; the count then includes its retained application (3 on V2 + U9).
    await kept.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => /^待處理料\s*4$/.test(button.textContent.trim())), null, { timeout: 15000 });
    await kept.getByRole('button', { name: /^待處理料/ }).click();
    const pendingDialog = kept.getByTestId('pending-materials-dialog');
    await pendingDialog.getByRole('tab', { name: /V1 的料/ }).click();
    const retainedRow = pendingDialog.locator('[data-retained="gone"]');
    assert.equal(await retainedRow.count(), 1);
    assert.match(await retainedRow.textContent(), /U9.*V1 申請 · 這一版沒有這顆料.*處理中/);
    await retainedRow.getByRole('button', { name: /查看 U9 在 V1 的紀錄/ }).click();
    const recordDialog = kept.getByRole('dialog').filter({ hasText: '料件詳細資訊' });
    await recordDialog.waitFor();
    assert.match(await recordDialog.textContent(), /唯讀[\s\S]*QA 追蹤[:：]等待申請/);
    assert.equal(await kept.getByRole('button', { name: /^儲存資料與追蹤/ }).count(), 0, 'an earlier version\'s application is never saved into V2');
    await recordDialog.getByRole('button', { name: '關閉', exact: true }).click();
    await pendingDialog.waitFor();
    await pendingDialog.getByTestId('pending-weekly-button').click();
    await kept.getByTestId('weekly-retained-note').first().waitFor({ timeout: 15000 });
    assert.match(await kept.getByTestId('weekly-retained-note').first().textContent(), /V1 申請 · 這一版沒有這顆料/);
    await keep.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const small = await phone.newPage();
    await small.goto(`http://127.0.0.1:${PORT}/`);
    await small.getByRole('button', { name: '排序與工具', exact: true }).click();
    await small.getByTestId('material-mobile-tools').getByRole('button', { name: /^BOM 管理/ }).click();
    await small.getByTestId('bom-version-center').waitFor();
    await small.getByTestId('bom-series-list').waitFor();
    await small.getByTestId('bom-series-list').getByRole('button', { name: /QA 主板/ }).first().click();
    await small.getByTestId('bom-series-detail').waitFor();
    await small.locator('.bom-crumbs li[data-crumb="parent"] button').waitFor();
    const widths = await small.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth, center: document.querySelector('[data-testid="bom-version-center"]').scrollWidth, centerClient: document.querySelector('[data-testid="bom-version-center"]').clientWidth }));
    assert.ok(widths.document <= widths.viewport, `no page overflow on a phone (${JSON.stringify(widths)})`);
    assert.ok(widths.center <= widths.centerClient, `the version center scrolls only inside its table (${JSON.stringify(widths)})`);
    for (const label of ['上傳此系列新版', '比對版本', '封存系列', '刪除系列']) {
      const action = small.getByTestId('bom-series-detail').getByRole('button', { name: label, exact: true });
      await action.waitFor();
      assert.ok(await action.isVisible(), `${label} visible on a phone`);
      // Check scrolling, hit targets and enabled state without uploading, archiving or deleting data.
      await action.click({ trial: true });
    }
    if (process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH) await small.screenshot({ path: process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH, fullPage: true });
    const [picker] = await Promise.all([
      small.waitForEvent('filechooser'),
      small.getByTestId('bom-series-detail').getByRole('button', { name: '上傳此系列新版' }).tap(),
    ]);
    await picker.setFiles(file);
    const mobileUpload = small.getByTestId('bom-upload-dialog');
    await mobileUpload.waitFor();
    assert.ok(await mobileUpload.evaluate(element => element.scrollWidth <= element.clientWidth));
    await mobileUpload.getByRole('combobox').tap();
    await small.getByRole('option', { name: '建立新 BOM 系列', exact: true }).tap();
    await mobileUpload.getByLabel('新系列名稱', { exact: true }).waitFor();
    await mobileUpload.getByRole('combobox').tap();
    await small.getByRole('option', { name: /QA 主板.*V2 → V3/ }).tap();
    assert.ok(await mobileUpload.getByText('V2 → V3', { exact: true }).isVisible());
    if (process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH) await small.screenshot({ path: process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH.replace(/\.png$/, '-upload-phone.png') });
    await mobileUpload.getByRole('button', { name: '取消', exact: true }).tap();
    await mobileUpload.waitFor({ state: 'detached' });
    await phone.close();
    console.log('BOM version flow: upload, carry-over, compare, export, switch and phone layout verified on QA data only');
  } catch (error) {
    let index = 0;
    for (const context of browser.contexts()) for (const page of context.pages()) {
      console.error(JSON.stringify({ case: 'BOM version', url: page.url(), body: (await page.locator('body').innerText()).slice(0, 12000) }));
      if (process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_BOM_VERSION_SCREENSHOT_PATH.replace(/\.png$/, `-failure-${index++}.png`), fullPage: false });
    }
    throw error;
  } finally {
    await browser.close();
    harness.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
