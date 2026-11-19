// 專案總料表 end to end on the isolated material workspace (QA data only, no production reads or writes):
// open it from BOM 版本管理, the shared parts of two boards merge, the archived board stays out, filters and chips,
// tick rows, download the PJE 備料表 and read it back; a board that fails to load blocks the export until 重試 or
// 仍要匯出; then the phone layout (cards, one scroll, the two actions at the bottom, 44px targets, no sideways scroll).
// Run by hand: AUDIT_QA_DIR=<folder with playwright> MATERIAL_QA_PORT=8300 node tests/materialProjectParts.browser.cjs
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');
const ExcelJS = require('exceljs');

const PORT = Number(process.env.MATERIAL_QA_PORT || 8096);

function startHarness() {
  const child = spawn(process.execPath, ['tests/materialWorkspace.browser.cjs'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MATERIAL_QA_PORT: String(PORT) } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('harness did not start')), 120000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('Material QA ready')) { clearTimeout(timer); resolve(child); } });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`harness exited with ${code}`)); });
  });
}

async function openParts(page, query, phone = false) {
  await page.goto(`http://127.0.0.1:${PORT}/?${query}`);
  if (phone) {
    await page.getByRole('button', { name: '排序與工具', exact: true }).click();
    await page.getByTestId('material-mobile-tools').getByRole('button', { name: /^BOM 管理/ }).click();
  } else await page.getByRole('button', { name: /BOM 管理/ }).click();
  const entry = page.getByTestId('bom-project-parts-entry');
  await entry.waitFor();
  assert.match(await entry.innerText(), /專案總料表\s*合併 2 個系列/, 'the archived board is not counted');
  await entry.click();
  const view = page.getByTestId('project-parts-view');
  await view.waitFor();
  return view;
}

async function readBook(download, dir) {
  const file = path.join(dir, download.suggestedFilename());
  await download.saveAs(file);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book;
}

(async () => {
  const harness = await startHarness();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-parts-'));
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => { throw error; });

    // Desktop: the merge, filters, selection and the PJE workbook.
    const view = await openParts(page, 'qaProjectParts');
    const count = view.getByTestId('project-parts-count');
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    const table = view.getByTestId('project-parts-table');
    const sharedConnector = table.locator('tbody tr', { hasText: 'QA-MPN-7' });
    assert.match(await sharedConnector.innerText(), /2 板/);
    assert.ok((await sharedConnector.innerText()).includes('QA 主板(僅隔離資料) ×1、QA 子板(僅隔離資料) ×2'));
    assert.equal(await table.locator('tbody tr', { hasText: 'QA-ARCHIVED-ONLY' }).count(), 0, 'nothing from the archived board');

    await view.getByRole('button', { name: /^IC/ }).click();
    await view.getByRole('button', { name: /^CONNECTOR/ }).click();
    assert.equal((await count.innerText()).trim(), '5 / 11 項');
    const chips = view.getByTestId('project-parts-active-filters');
    assert.match(await chips.innerText(), /分類：IC[\s\S]*分類：CONNECTOR/);

    await sharedConnector.locator('td').nth(4).click();
    await table.locator('tbody tr', { hasText: 'QA-MPN-8' }).locator('td').nth(4).click();
    const pje = view.getByRole('button', { name: /轉給 PJE 備料表/ });
    assert.match(await pje.innerText(), /已選 2 項/);
    const [pjeDownload] = await Promise.all([page.waitForEvent('download'), pje.click()]);
    assert.match(pjeDownload.suggestedFilename(), /^QA_專案_PJE備料表_\d{8}\.xlsx$/);
    const pjeBook = await readBook(pjeDownload, dir);
    assert.deepEqual(pjeBook.worksheets.map((sheet) => sheet.name), ['Material list(PCBA)']);
    const sheet = pjeBook.worksheets[0];
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['Items', 'Vendor', 'PN', '使用在哪個板子', 'Usage']);
    assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb, 'FFCAEDFB');
    assert.equal(sheet.rowCount, 3);
    assert.deepEqual(sheet.getRow(2).values.slice(1), ['RES 10K 1% 0402 J1', 'QA Vendor B', 'QA-MPN-7', 'QA 主板(僅隔離資料) ×1、QA 子板(僅隔離資料) ×2', 3]);
    assert.match(await view.getByTestId('project-parts-notice').innerText(), /已下載 PJE 備料表（2 項）/);

    // A search with no match keeps the header and offers 全部清除, which clears every filter.
    await view.getByRole('textbox', { name: '搜尋專案總料表' }).fill('zzz-no-match');
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-table] tbody')?.textContent.includes('目前篩選條件沒有符合的料件'));
    assert.ok(await table.locator('thead th', { hasText: '使用在哪個板子' }).count());
    await table.getByRole('button', { name: '全部清除' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    assert.equal(await view.getByTestId('project-parts-active-filters').count(), 0, 'no chip is left');
    await view.getByRole('button', { name: '← 返回系列' }).click();
    await page.getByTestId('bom-series-list').waitFor();

    // A board that fails: the export says what is missing, 重試 brings it in.
    const failing = await openParts(page, 'qaProjectParts&qaProjectPartsFail');
    await failing.locator('.project-parts-board[data-state="error"]').waitFor();
    await failing.getByRole('button', { name: /轉給 PJE 備料表/ }).click();
    const notice = failing.getByTestId('project-parts-notice');
    assert.ok((await notice.innerText()).includes('1 個系列沒有載入（QA 子板(僅隔離資料)）'));
    assert.ok(await notice.getByRole('button', { name: '仍要匯出' }).isVisible());
    await failing.getByRole('button', { name: '重試' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    assert.equal(await failing.getByTestId('project-parts-notice').count(), 0, 'the warning goes away once every board is in');

    // Phone: cards, one scroll, worded back on top, both actions at the bottom, thumb-sized targets.
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const phonePage = await phoneContext.newPage();
    phonePage.on('pageerror', (error) => { throw error; });
    const phone = await openParts(phonePage, 'qaProjectParts', true);
    await phone.getByTestId('project-parts-cards').waitFor();
    assert.ok(await phonePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
    const bar = phone.locator('.project-parts-mobile-actions');
    const barBox = await bar.boundingBox();
    assert.ok(barBox.y + barBox.height <= 844 + 1, 'the actions stay on screen');
    const heights = await phone.locator('.project-parts-back, .project-parts-category, .project-parts-select, .project-parts-mobile-actions button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.ok(heights.every((height) => height >= 44), `44px targets: ${JSON.stringify(heights)}`);
    await phone.locator('.project-parts-card-main').first().tap();
    assert.match(await bar.innerText(), /已選 1 項/);
    console.log('專案總料表 browser flow: passed');
  } finally {
    await browser.close();
    harness.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
