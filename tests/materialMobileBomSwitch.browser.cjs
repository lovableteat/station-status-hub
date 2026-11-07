// Run materialWorkspace.browser.cjs first; this uses only its isolated QA BOMs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const origin = new URL(process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096').origin;
const evidence = path.resolve(process.env.MATERIAL_B_EVIDENCE_DIR || '../material-mobile-b-evidence');
const activeKey = 'station-status-hub:active-material-bom:v1';
const mainId = 'bom:qa-board:v2:qa0002';
const oldId = 'bom:qa-legacy';
const mainName = 'QA 主板（僅隔離資料）';
const oldName = 'QA 舊格式 BOM.xlsx';
const rows = page => page.getByTestId('material-mobile-list-row');
const ids = page => rows(page).evaluateAll(elements => elements.map(element => element.dataset.recordId));

async function settled(page, workspaceId) {
  await page.waitForFunction(([key, id]) => localStorage.getItem(key) === id
    && document.querySelector('[data-material-results]')?.getAttribute('aria-busy') !== 'true'
    && document.querySelectorAll('[data-testid="material-mobile-list-row"]').length > 0, [activeKey, workspaceId]);
}

async function geometry(page, selector) {
  return page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      hit: element === target || element.contains(target), viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
  });
}

async function run(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const tag = `${width}x${height}`;
  try {
    await page.goto(origin + '/?qaMainRows&qaPages');
    await rows(page).first().waitFor();
    await settled(page, mainId);
    await page.evaluate(() => document.fonts.ready);
    const contextButton = page.locator('.material-mobile-context');
    assert.ok((await contextButton.innerText()).includes(mainName));
    const initialIds = await ids(page);

    await contextButton.tap();
    const list = page.getByRole('listbox');
    await list.waitFor();
    assert.equal(await list.getByRole('option').count(), 2, 'direct picker must list both live BOM series');
    const buttonBox = await geometry(page, '.material-mobile-context');
    assert.ok(buttonBox.width >= 44 && buttonBox.height >= 44, JSON.stringify(buttonBox));
    // The open picker intercepts pointer events; hit testing the trigger is done after dismissal.
    const listBox = await list.boundingBox();
    assert.ok(listBox.x >= 0 && listBox.x + listBox.width <= width + 1, JSON.stringify(listBox));
    const optionBoxes = await list.getByRole('option').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    assert.ok(optionBoxes.every(rect => rect.width >= 44 && rect.height >= 44), JSON.stringify(optionBoxes));
    await page.screenshot({ path: path.join(evidence, `bom-picker-${tag}.png`) });
    await list.getByRole('option', { name: new RegExp(oldName.replaceAll('.', '\\.')) }).tap();
    await list.waitFor({ state: 'hidden' });
    await settled(page, oldId);
    await page.waitForFunction(name => document.querySelector('.material-mobile-context')?.textContent.includes(name), oldName);
    const oldIds = await ids(page);
    assert.ok(oldIds.length < initialIds.length && oldIds.every(id => /^qa-[012]$/.test(id)), JSON.stringify(oldIds));
    assert.notDeepEqual(oldIds, initialIds, 'switch must update records, not just the label');

    await contextButton.tap();
    await list.waitFor();
    await list.getByRole('option', { name: new RegExp(mainName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).tap();
    await list.waitFor({ state: 'hidden' });
    await settled(page, mainId);
    assert.ok((await contextButton.innerText()).includes(mainName));
    assert.deepEqual(await ids(page), initialIds, 'switching back restores the original BOM records');

    await contextButton.tap();
    await list.waitFor();
    await page.touchscreen.tap(width - 2, 2);
    await list.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), activeKey), mainId);
    assert.deepEqual(await ids(page), initialIds, 'dismissing the picker must not switch BOM');
    const closedButtonBox = await geometry(page, '.material-mobile-context');
    assert.ok(closedButtonBox.hit, JSON.stringify(closedButtonBox));
    assert.equal(closedButtonBox.pageWidth, width, 'page must not overflow after switching');

    await page.getByRole('button', { name: '排序與工具', exact: true }).tap();
    const tools = page.getByTestId('material-mobile-tools');
    await tools.waitFor();
    await tools.getByRole('button', { name: /^BOM\s*管理/ }).tap();
    const manager = page.getByTestId('bom-version-center');
    await manager.waitFor();
    await manager.getByRole('heading', { name: 'BOM 版本管理', exact: true }).waitFor();
    await manager.locator('[data-ui="dialog-close"]').tap();
    await manager.waitFor({ state: 'hidden' });
    await tools.waitFor({ state: 'hidden' });
    assert.deepEqual(await ids(page), initialIds, 'closing management must preserve the viewed BOM');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), activeKey), mainId);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, `bom-return-${tag}.png`) });
    return { width, height, button: closedButtonBox, picker: listBox, options: optionBoxes,
      mainRecords: initialIds, oldRecords: oldIds, errors, result: 'passed' };
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, `bom-failure-${tag}.png`) }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const results = [];
  try {
    for (const [width, height] of [[375, 844], [390, 844], [430, 844], [390, 500]]) results.push(await run(browser, width, height));
    console.log('Mobile BOM switching passed: select, update records, return, dismiss and management at four viewport sizes');
  } finally {
    fs.writeFileSync(path.join(evidence, 'bom-switch-results.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
