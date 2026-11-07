// Start tests/materialWorkspace.browser.cjs before running this isolated browser check.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const playwright = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const browserName = process.env.MATERIAL_QA_BROWSER || 'chromium';
const origin = process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096';

async function expectNote(input, value) {
  const element = await input.elementHandle();
  await input.page().waitForFunction(([field, expected]) => field.value === expected, [element, value]);
}

(async () => {
  const browser = await playwright[browserName].launch({
    ...(browserName === 'chromium' && process.platform === 'win32' ? { channel: 'chrome' } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const desktop = await context.newPage();
    const phone = await context.newPage();
    const errors = [];
    for (const page of [desktop, phone]) {
      page.setDefaultTimeout(10_000);
      page.on('pageerror', error => errors.push(error.message));
    }
    await desktop.setViewportSize({ width: 1440, height: 960 });
    await Promise.all([desktop, phone].map(page => page.goto(`${origin}/?qaLiveNotes`)));
    await phone.getByRole('button', { name: 'QA 帳號 B（檢視）', exact: true }).tap();
    const summary = phone.getByTestId('material-mobile-cards').locator('details.material-mobile-note')
      .filter({ has: phone.locator('input[aria-label="編輯 LB48 Note"]') }).locator('summary');
    await summary.tap();
    const note = page => page.getByRole('textbox', { name: '編輯 LB48 Note', exact: true });
    const desktopNote = note(desktop);
    const phoneNote = note(phone);
    const desktopCell = desktopNote.locator('../..');
    const phoneCell = phoneNote.locator('../..');
    const saving = cell => cell.locator('[aria-label="Note 儲存中"]').waitFor();

    await desktop.evaluate(() => { window.__qaNoteWriteDelay = 950; });
    await desktopNote.fill('第一版');
    await saving(desktopCell);
    assert.equal(await desktopNote.isEnabled(), true);
    assert.equal(await desktopNote.evaluate(input => document.activeElement === input), true);
    await desktopNote.fill('第二版，繼續輸入');
    await expectNote(phoneNote, '第二版，繼續輸入');
    assert.equal(await phone.getByRole('button', { name: '載入最新資料', exact: true }).count(), 0);

    await desktop.evaluate(() => { window.__qaNoteWriteDelay = 0; });
    await phone.evaluate(() => { window.__qaNoteWriteDelay = 1_400; });
    await phoneNote.fill('手機端草稿');
    await saving(phoneCell);
    await desktopNote.fill('桌面端先更新');
    await desktopNote.press('Enter');
    await phoneCell.getByText('最新備註', { exact: true }).locator('..').filter({ hasText: '桌面端先更新' }).waitFor();
    assert.equal(await phoneNote.inputValue(), '手機端草稿');
    await phoneCell.getByRole('button', { name: '採用最新', exact: true }).tap();
    await expectNote(phoneNote, '桌面端先更新');

    await phone.evaluate(() => { window.__qaMuteNoteUpdates = true; window.__qaFailNoteRead = true; });
    await phoneNote.fill('手機端保留草稿');
    await saving(phoneCell);
    await desktopNote.fill('桌面端先儲存');
    await desktopNote.press('Enter');
    const retryAfterConflict = phoneCell.getByRole('button', { name: '重試儲存', exact: true });
    await retryAfterConflict.waitFor();
    await phone.evaluate(() => { window.__qaNoteWriteDelay = 0; window.__qaFailNoteRead = false; });
    await retryAfterConflict.tap();
    await phoneCell.getByText('最新備註', { exact: true }).locator('..').filter({ hasText: '桌面端先儲存' }).waitFor();
    assert.equal(await phoneNote.inputValue(), '手機端保留草稿');
    const keepDraft = phoneCell.getByRole('button', { name: '儲存我的草稿', exact: true });
    assert.ok((await keepDraft.boundingBox()).height >= 44);
    await keepDraft.tap();
    await expectNote(desktopNote, '手機端保留草稿');

    await phone.evaluate(() => { window.__qaNoteWriteDelay = 0; window.__qaFailNoteSave = true; });
    await phoneNote.fill('暫時斷線後重試');
    const retry = phoneCell.getByRole('button', { name: '重試', exact: true });
    await retry.waitFor();
    assert.equal(await phoneNote.inputValue(), '暫時斷線後重試');
    await phone.evaluate(() => { window.__qaFailNoteSave = false; });
    await retry.tap();
    await expectNote(desktopNote, '暫時斷線後重試');
    assert.deepEqual(errors, []);
    console.log(`${browserName}: autosave while typing, cross-account sync, conflict choices, and retry at 1440px and 390px`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
