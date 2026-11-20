// 專案總料表 end to end on the isolated material workspace (QA data only, no production reads or writes):
// open it from BOM 版本管理, the shared parts of two boards merge, the archived board stays out, filters and chips,
// a position without a quantity stays out of the total and is named, the material table's column filters and sort,
// a hand-picked category written back to both boards (one on screen, one not) that is still there after reopening,
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
    assert.ok((await sharedConnector.innerText()).includes('QA 子板(僅隔離資料) ×2、QA 主板(僅隔離資料) ×1'));
    // Ref Des: each board names its own positions.
    assert.equal(await sharedConnector.locator('td.project-parts-refs').innerText(), 'QA 子板(僅隔離資料)：J4；QA 主板(僅隔離資料)：J1');
    assert.equal(await table.locator('tbody tr', { hasText: 'QA-ARCHIVED-ONLY' }).count(), 0, 'nothing from the archived board');
    // The row whose quantity is "-": the total stays a number and says one position wrote none.
    const qtyCell = table.locator('tbody tr', { hasText: 'QA-CONN-88' }).locator('td.project-parts-num');
    assert.equal((await qtyCell.innerText()).replace(/\s+/g, ''), '4+1未填');
    assert.ok((await qtyCell.locator('.project-parts-qty').getAttribute('title')).includes('沒有算進總用量的位號：\nQA 子板(僅隔離資料)：沒有位號（TEMP-QA-0001）'));
    assert.equal(await table.locator('tbody tr', { hasText: 'QA-CONN-88' }).locator('td.project-parts-refs').innerText(), 'J30', 'a TEMP number in the 位號 column is no Ref Des');

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
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['虛擬料號', '實體料號', 'Items', 'Vendor', 'PN', '使用在哪個板子', 'Usage', 'Ref Des', '備註']);
    assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb, 'FFCAEDFB');
    // One row per board: both ticked parts sit on both boards, so each is two rows next to each other, each with that
    // board's own quantity (子板 ×2, 主板 ×1). The part numbers come first; QA-MPN-7 has none on either board.
    assert.equal(sheet.rowCount, 5);
    assert.deepEqual(sheet.getRow(2).values.slice(3, 9), ['RES 10K 1% 0402 J4', 'QA Vendor B', 'QA-MPN-7', 'QA 子板(僅隔離資料)', 2, 'J4']);
    assert.deepEqual(sheet.getRow(3).values.slice(3, 9), ['RES 10K 1% 0402 J4', 'QA Vendor B', 'QA-MPN-7', 'QA 主板(僅隔離資料)', 1, 'J1']);
    assert.ok([2, 3].every((line) => !sheet.getRow(line).getCell(1).value && !sheet.getRow(line).getCell(2).value), 'no number is made up for a part without one');
    for (const [line, board, qty, ref] of [[4, 'QA 子板(僅隔離資料)', 2, 'U3'], [5, 'QA 主板(僅隔離資料)', 1, 'U1']]) {
      assert.deepEqual(sheet.getRow(line).values.slice(1, 3), ['000-VIRTUAL', '000-PHYSICAL-8'], `row ${line}: the board's own part numbers in A and B`);
      assert.deepEqual(sheet.getRow(line).values.slice(4, 9), ['QA Vendor A', 'QA-MPN-8', board, qty, ref]);
    }
    assert.ok([2, 3, 4, 5].every((line) => !sheet.getRow(line).getCell(9).value), 'no 備註 when every position wrote its quantity');
    assert.match(await view.getByTestId('project-parts-notice').innerText(), /已下載 PJE 備料表（2 項料件、每塊板子一列共 4 列）/);
    if (process.env.PROJECT_PARTS_SHOTS) await page.screenshot({ path: path.join(process.env.PROJECT_PARTS_SHOTS, 'desktop-refdes.png') });

    // A search with no match keeps the header and offers 全部清除, which clears every filter.
    await view.getByRole('textbox', { name: '搜尋專案總料表' }).fill('zzz-no-match');
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-table] tbody')?.textContent.includes('目前篩選條件沒有符合的料件'));
    assert.ok(await table.locator('thead th', { hasText: '使用在哪個板子' }).count());
    await table.getByRole('button', { name: '全部清除' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    assert.equal(await view.getByTestId('project-parts-active-filters').count(), 0, 'no chip is left');

    // A third ticked part, used on 主板 only: the board filter below leaves it without a PJE row.
    await table.locator('tbody tr').filter({ hasNotText: '子板' }).first().locator('td').nth(4).click();
    assert.match(await pje.innerText(), /已選 3 項/);
    // The material table's column filters: tick one board in 使用在哪個板子, see its chip, sort 總用量 Z to A.
    await table.getByRole('button', { name: '篩選使用在哪個板子', exact: true }).click();
    const panel = page.getByTestId('material-column-filter-panel');
    await panel.waitFor();
    assert.ok(await panel.getByRole('checkbox', { name: 'QA 主板(僅隔離資料)' }).isVisible());
    await panel.getByRole('button', { name: '全不選' }).click();
    await panel.getByRole('checkbox', { name: 'QA 子板(僅隔離資料)' }).click();
    await panel.getByRole('button', { name: '確定' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '4 / 11 項');
    assert.match(await view.getByTestId('project-parts-active-filters').innerText(), /使用在哪個板子：QA 子板\(僅隔離資料\)/);
    // PJE with that board filter: only 子板's rows (「篩哪塊板子就只出哪塊板子的列」); two ticked parts are on it, the
    // third is not and the button says so before it is pressed.
    assert.match(await pje.innerText(), /已選 3 項（1 項不在篩選的板子，不轉出）/);
    assert.match(await pje.getAttribute('title'), /只轉出 QA 子板\(僅隔離資料\) 的列；勾選的料件中 1 項沒有用在篩選的板子，不會轉出/);
    if (process.env.PROJECT_PARTS_SHOTS) await page.screenshot({ path: path.join(process.env.PROJECT_PARTS_SHOTS, 'desktop-pje-off-board.png') });
    const [boardDownload] = await Promise.all([page.waitForEvent('download'), pje.click()]);
    const boardSheet = (await readBook(boardDownload, dir)).worksheets[0];
    assert.equal(boardSheet.rowCount, 3, 'header + one row for each ticked part, on 子板 only');
    assert.deepEqual([2, 3].map((line) => [boardSheet.getRow(line).getCell(5).value, boardSheet.getRow(line).getCell(6).value]), [['QA-MPN-7', 'QA 子板(僅隔離資料)'], ['QA-MPN-8', 'QA 子板(僅隔離資料)']]);
    assert.match(await view.getByTestId('project-parts-notice').innerText(), /已下載 PJE 備料表（2 項料件、只含篩選的板子（QA 子板\(僅隔離資料\)）共 2 列；1 項勾選的料件沒有用在這些板子，沒有轉出）/);
    await table.getByRole('button', { name: '篩選總用量', exact: true }).click();
    await panel.waitFor();
    await panel.getByRole('button', { name: '從 Z 到 A 排序' }).click();
    const totals = await table.locator('tbody td.project-parts-num').evaluateAll((cells) => cells.map((cell) => Number.parseFloat(cell.textContent)));
    const written = totals.filter(Number.isFinite); // 未填 rows stay last and have no number
    assert.deepEqual(written, [...written].sort((a, b) => b - a), `sorted by quantity: ${JSON.stringify(totals)}`);
    await view.getByRole('button', { name: /^移除篩選：使用在哪個板子/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    // Ref Des has the same column filter: one position finds its part.
    await table.getByRole('button', { name: '篩選Ref Des', exact: true }).click();
    await panel.waitFor();
    await panel.getByRole('button', { name: '全不選' }).click();
    await panel.getByRole('checkbox', { name: 'J30' }).click();
    await panel.getByRole('button', { name: '確定' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '1 / 11 項');
    assert.match(await table.locator('tbody tr').first().innerText(), /QA-CONN-88/);
    assert.match(await view.getByTestId('project-parts-active-filters').innerText(), /Ref Des：J30/);
    await view.getByRole('button', { name: /^移除篩選：Ref Des/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    // The dialog's scroll lock must not swallow the wheel over the value list (it once scrolled on the material page only).
    await table.getByRole('button', { name: '篩選MPN', exact: true }).click();
    await panel.waitFor();
    // The pointer rests on the first value, which is on screen (the lower part of the list can sit behind 取消／確定).
    await panel.locator('.overflow-y-auto[style] label').first().hover();
    for (let notch = 0; notch < 3; notch += 1) await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => document.querySelector('[data-testid=material-column-filter-panel] .overflow-y-auto[style]')?.scrollTop > 0);
    await panel.getByRole('button', { name: '取消' }).click();
    await panel.waitFor({ state: 'hidden' });

    // A hand-picked category: the IC used on both boards becomes 其他, is written to both BOMs, survives reopening,
    // and 依位號自動 brings the IC back.
    const sharedIc = () => view.getByTestId('project-parts-table').locator('tbody tr', { hasText: 'QA-MPN-8' });
    const picker = () => sharedIc().getByRole('combobox', { name: /的分類，目前/ });
    assert.match(await picker().innerText(), /^IC$/);
    const tickedBefore = await sharedIc().getAttribute('data-selected');
    await picker().click();
    await page.getByRole('option', { name: '其他', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-notice]')?.textContent.includes('已寫回 2 塊板子'));
    assert.match(await picker().innerText(), /其他 · 手動/);
    assert.equal(await sharedIc().getAttribute('data-selected'), tickedBefore, 'choosing a category does not tick or untick the row');
    await view.getByRole('button', { name: '← 返回系列' }).click();
    await page.getByTestId('bom-project-parts-entry').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '11 / 11 項');
    assert.match(await picker().innerText(), /其他 · 手動/, 'saved, not only shown');
    await picker().click();
    await page.getByRole('option', { name: '依位號自動（IC）' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=project-parts-notice]')?.textContent.includes('依位號自動（IC）'));
    assert.match(await picker().innerText(), /^IC$/);

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
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true });
    const phonePage = await phoneContext.newPage();
    phonePage.on('pageerror', (error) => { throw error; });
    const phone = await openParts(phonePage, 'qaProjectParts', true);
    await phone.getByTestId('project-parts-cards').waitFor();
    await phone.locator('.project-parts-card', { hasText: 'QA-MPN-7' }).filter({ hasText: '子板' }).waitFor(); // both boards loaded
    assert.match(await phone.locator('.project-parts-card', { hasText: 'QA-MPN-7' }).innerText(), /Ref Des\s*QA 子板\(僅隔離資料\)：J4；QA 主板\(僅隔離資料\)：J1/, 'the card shows Ref Des too');
    assert.ok(await phonePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
    const bar = phone.locator('.project-parts-mobile-actions');
    const barBox = await bar.boundingBox();
    assert.ok(barBox.y + barBox.height <= 844 + 1, 'the actions stay on screen');
    assert.ok(await phone.getByRole('combobox', { name: '篩選欄位' }).isVisible(), 'the column filters are on the phone too');
    const heights = await phone.locator('.project-parts-back, .project-parts-category, .project-parts-select, .project-parts-mobile-column > button, .project-parts-category-picker, .project-parts-mobile-actions button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.ok(heights.every((height) => height >= 44), `44px targets: ${JSON.stringify(heights)}`);
    await phone.locator('.project-parts-card-main').first().tap();
    await phonePage.waitForFunction(() => document.querySelector('.project-parts-mobile-actions')?.textContent.includes('已選 1 項'), null, { timeout: 5000 });
    // The category on a card opens its own list and does not tick the card.
    await phone.locator('.project-parts-card').nth(1).getByRole('combobox', { name: /的分類，目前/ }).tap();
    await phonePage.getByRole('listbox').waitFor();
    await phonePage.keyboard.press('Escape');
    assert.match(await bar.innerText(), /已選 1 項/);
    // PJE from the phone's bottom bar with the list scrolled to the end: the same one-row-per-board sheet, and the
    // notice is in the bottom bar right above the buttons (above the filter bar it was off-screen by then).
    await phonePage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await phone.locator('.project-parts-card').last().evaluate((node) => node.scrollIntoView({ block: 'end' }));
    const [phoneDownload] = await Promise.all([phonePage.waitForEvent('download'), bar.getByRole('button', { name: /轉給 PJE 備料表/ }).tap()]);
    // The notice first: a success hides itself after 8 seconds on the phone.
    const phoneNotice = bar.getByTestId('project-parts-notice');
    await phoneNotice.waitFor();
    assert.match(await phoneNotice.innerText(), /已下載 PJE 備料表/);
    const noticeBox = await phoneNotice.boundingBox();
    const pjeBox = await bar.getByRole('button', { name: /轉給 PJE 備料表/ }).boundingBox();
    assert.ok(noticeBox.y >= 0 && noticeBox.y + noticeBox.height <= pjeBox.y + 1 && pjeBox.y - (noticeBox.y + noticeBox.height) <= 16 && pjeBox.y + pjeBox.height <= 844 + 1, `the notice is on screen, right above the bottom buttons: ${JSON.stringify([noticeBox, pjeBox])}`);
    if (process.env.PROJECT_PARTS_SHOTS) await phonePage.screenshot({ path: path.join(process.env.PROJECT_PARTS_SHOTS, 'phone-pje-notice.png') });
    const phoneSheet = (await readBook(phoneDownload, dir)).worksheets[0];
    const phoneRows = Array.from({ length: phoneSheet.rowCount - 1 }, (_, index) => phoneSheet.getRow(index + 2).values.slice(1));
    assert.deepEqual(phoneSheet.getRow(1).values.slice(1, 3), ['虛擬料號', '實體料號'], 'the part numbers come first on the phone too');
    assert.ok(phoneRows.length >= 1 && phoneRows.every((line) => !String(line[5]).includes('×') && (typeof line[6] === 'number' || line[6] === undefined || line[6] === '')), `one board per row with its Ref Des: ${JSON.stringify(phoneRows)}`);
    assert.equal(new Set(phoneRows.map((line) => line[4])).size, 1, 'one ticked part');
    // Phone, 使用在哪個板子 = 子板 with a 主板-only card ticked: the button says it will not go out, and the longer
    // label stays inside the button. Then nothing ticked: PJE has the four parts on 子板, one row each, no 主板 row.
    await bar.getByRole('button', { name: '清除勾選' }).tap();
    await phone.locator('.project-parts-card').filter({ hasNotText: '子板' }).first().locator('.project-parts-card-main').tap();
    await phonePage.waitForFunction(() => document.querySelector('.project-parts-mobile-actions')?.textContent.includes('已選 1 項'));
    await phone.getByRole('combobox', { name: '篩選欄位' }).tap();
    await phonePage.getByRole('option', { name: '使用在哪個板子' }).tap();
    await phone.getByRole('button', { name: /^篩選使用在哪個板子/ }).tap();
    const phonePanel = phonePage.getByTestId('material-column-filter-panel');
    await phonePanel.waitFor();
    await phonePanel.getByRole('button', { name: '全不選' }).tap();
    await phonePanel.getByRole('checkbox', { name: 'QA 子板(僅隔離資料)' }).tap();
    await phonePanel.getByRole('button', { name: '確定' }).tap();
    await phonePage.waitForFunction(() => document.querySelector('[data-testid=project-parts-count]')?.textContent.trim() === '4 / 11 項');
    const phoneBoardPje = bar.getByRole('button', { name: /轉給 PJE 備料表/ });
    assert.match(await phoneBoardPje.innerText(), /已選 1 項（1 項不在篩選的板子，不轉出）/);
    const labelFit = await phoneBoardPje.evaluate((button) => {
      const label = button.querySelector('.project-parts-pje-count').getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return { label: [label.left, label.right], box: [box.left, box.right], fits: label.left >= box.left - 1 && label.right <= box.right + 1 && box.right <= innerWidth + 1 };
    });
    assert.ok(labelFit.fits, `the longer label stays inside the button: ${JSON.stringify(labelFit)}`);
    if (process.env.PROJECT_PARTS_SHOTS) await phonePage.screenshot({ path: path.join(process.env.PROJECT_PARTS_SHOTS, 'phone-pje-off-board.png') });
    await bar.getByRole('button', { name: '清除勾選' }).tap();
    assert.match(await phoneBoardPje.innerText(), /目前 4 項/);
    const [phoneBoardDownload] = await Promise.all([phonePage.waitForEvent('download'), phoneBoardPje.tap()]);
    await phonePage.waitForFunction(() => document.querySelector('.project-parts-mobile-actions [data-testid=project-parts-notice]')?.textContent.includes('只含篩選的板子'));
    assert.match(await bar.getByTestId('project-parts-notice').innerText(), /4 項料件、只含篩選的板子（QA 子板\(僅隔離資料\)）共 4 列/);
    const phoneBoardSheet = (await readBook(phoneBoardDownload, dir)).worksheets[0];
    const phoneBoards = Array.from({ length: phoneBoardSheet.rowCount - 1 }, (_, index) => phoneBoardSheet.getRow(index + 2).getCell(6).value);
    assert.deepEqual(phoneBoards, Array(4).fill('QA 子板(僅隔離資料)'), 'only 子板 rows on the phone too');
    if (process.env.PROJECT_PARTS_SHOTS) await phonePage.screenshot({ path: path.join(process.env.PROJECT_PARTS_SHOTS, 'phone-pje-board-filter.png') });
    console.log('專案總料表 browser flow: passed');
  } finally {
    await browser.close();
    harness.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
