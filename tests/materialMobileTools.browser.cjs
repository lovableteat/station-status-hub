// Run materialWorkspace.browser.cjs first; all data and writes stay in its QA fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const origin = process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096';
const evidence = path.resolve(process.env.MATERIAL_B_EVIDENCE_DIR || '../material-mobile-b-evidence');
fs.mkdirSync(evidence, { recursive: true });

async function openTools(page) {
  await page.getByRole('button', { name: '排序與工具', exact: true }).tap();
  const sheet = page.getByTestId('material-mobile-tools');
  await sheet.waitFor();
  await page.waitForFunction(() => {
    const rect = document.querySelector('[data-testid="material-mobile-tools"]')?.getBoundingClientRect();
    return rect && rect.top >= 0 && rect.bottom <= innerHeight + 1;
  });
  return sheet;
}

async function closeDialog(page, heading) {
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '排序與工具', exact: true }).waitFor();
}

async function run(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 884 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'zh-TW' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/?qaMainRows&qaPages');
    const rows = page.getByTestId('material-mobile-list-row');
    await rows.first().waitFor();
    const sheet = await openTools(page);
    const geometry = await sheet.evaluate(element => {
      const box = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
      return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, sheet:box(element),
        settings:[...element.querySelector('.material-mobile-tool-settings').children].map(box),
        actions:[...element.querySelectorAll('.material-mobile-tool-list > button')].map(button => {
          const text = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
          const range = text && document.createRange(); if (range) range.selectNodeContents(text);
          const textBox = range?.getBoundingClientRect(), counter = button.querySelector(':scope > span');
          return { name:button.innerText, box:box(button), fits:button.scrollWidth <= button.clientWidth,
            textHeight:textBox?.height ?? 0, counterGap:counter && textBox ? counter.getBoundingClientRect().left - textBox.right : null };
        }) };
    });
    assert.equal(geometry.pageWidth, width);
    assert.equal(new Set(geometry.settings.map(box => box.y)).size, 1, 'sort/search/view must share one row');
    assert.ok(geometry.actions.every(action => action.fits && action.textHeight <= 21), JSON.stringify(geometry.actions));
    assert.ok(geometry.actions.every(action => action.counterGap === null || action.counterGap >= 4), 'tool labels and counts overlap: ' + JSON.stringify(geometry.actions));
    assert.ok(geometry.sheet.y >= 0 && geometry.sheet.y + geometry.sheet.h <= 885);
    await page.screenshot({ path:path.join(evidence, `tools-${width}.png`) });
    await sheet.getByRole('button', { name:'關閉排序與工具', exact:true }).tap();
    await sheet.waitFor({ state:'hidden' });

    const scope = page.getByRole('group', { name:'料件範圍', exact:true });
    await scope.getByRole('button', { name:/料號待補/ }).tap();
    await scope.getByRole('button', { name:/我的標記/ }).tap();
    await page.locator('.material-mobile-empty').waitFor();
    assert.equal(await page.locator('.material-mobile-empty-fields > span').count(), 3);
    assert.equal(await page.locator('.material-mobile-empty > p').innerText(), '目前篩選條件沒有符合的料件');
    const chips = page.getByTestId('material-active-filters').filter({ visible:true });
    geometry.chipHeights = await chips.locator('button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(geometry.chipHeights.every(height => height === 32), JSON.stringify(geometry.chipHeights));
    if (width === 536) await page.screenshot({ path:path.join(evidence, 'empty-536.png') });
    await chips.getByRole('button', { name:/^移除篩選：狀態/ }).tap();
    assert.equal(await chips.getByRole('button', { name:/^移除篩選/ }).count(), 1);
    await chips.getByRole('button', { name:'全部清除', exact:true }).tap();
    await chips.waitFor({ state:'hidden' });
    await rows.first().waitFor();

    const pager = page.getByTestId('material-pagination');
    await pager.scrollIntoViewIfNeeded();
    geometry.pager = await pager.evaluate(element => ({ width:element.clientWidth, scrollWidth:element.scrollWidth,
      groups:[...element.children].map(node => ({ top:node.getBoundingClientRect().top, bottom:node.getBoundingClientRect().bottom })) }));
    assert.ok(geometry.pager.scrollWidth <= geometry.pager.width);
    assert.ok(Math.max(...geometry.pager.groups.map(group => group.top)) < Math.min(...geometry.pager.groups.map(group => group.bottom)));
    const firstId = await rows.first().getAttribute('data-record-id');
    await pager.getByRole('button', { name:'下一頁', exact:true }).tap();
    await page.waitForFunction(id => document.querySelector('[data-testid="material-mobile-list-row"]')?.dataset.recordId !== id, firstId);
    await pager.getByRole('button', { name:'上一頁', exact:true }).tap();
    await page.waitForFunction(id => document.querySelector('[data-testid="material-mobile-list-row"]')?.dataset.recordId === id, firstId);

    if (width === 536) {
      await page.evaluate(() => scrollTo(0, 0));
      const destinations = [
        [/^待處理料/, '待處理料'], [/^匯出報表/, '匯出主管報表'],
        [/^不建議料匯出/, '不建議料匯出'], [/^BOM 管理/, 'BOM 版本管理'],
        [/^頁數進度/, '頁數進度'], [/^RLC 優先順序/, 'RLC 選料優先順序'],
        [/^欄位/, '欄位與配色'], [/^使用說明/, '上傳說明・CE／RD 交付規格'],
      ];
      for (const [name, heading] of destinations) {
        const tools = await openTools(page);
        await tools.locator('.material-mobile-tool-list').getByRole('button', { name }).tap();
        await closeDialog(page, heading);
      }
      let tools = await openTools(page);
      const chooserPromise = page.waitForEvent('filechooser');
      await tools.getByRole('button', { name:'上傳 BOM', exact:true }).tap();
      await (await chooserPromise).setFiles([]);
      await tools.waitFor({ state:'hidden' });
      tools = await openTools(page);
      const downloadPromise = page.waitForEvent('download');
      await tools.getByRole('button', { name:'匯出顯示欄位', exact:true }).tap();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith('.xlsx'));
      await tools.waitFor({ state:'hidden' });
      tools = await openTools(page);
      await tools.getByRole('combobox', { name:'料號排序', exact:true }).tap();
      await page.getByRole('option', { name:'無替代料優先', exact:true }).tap();
      assert.equal(await tools.getByRole('combobox', { name:'料號排序', exact:true }).innerText(), '無替代料優先');
      await tools.getByRole('combobox', { name:'搜尋篩選工具', exact:true }).tap();
      await page.getByRole('option', { name:'Manufacturer', exact:true }).tap();
      assert.equal(await tools.getByRole('combobox', { name:'搜尋篩選工具', exact:true }).innerText(), 'Manufacturer');
      await tools.getByRole('group', { name:'料件檢視', exact:true }).getByRole('button', { name:'表格', exact:true }).tap();
      await tools.getByRole('button', { name:'關閉排序與工具', exact:true }).tap();
      await page.locator('table.material-table-crosshair').waitFor({ state:'visible' });
      tools = await openTools(page);
      await tools.getByRole('group', { name:'料件檢視', exact:true }).getByRole('button', { name:'清單', exact:true }).tap();
      await tools.getByRole('button', { name:'關閉排序與工具', exact:true }).tap();
      await rows.first().waitFor();
      geometry.destinations = destinations.map(([, heading]) => heading).concat('upload chooser cancelled', 'visible columns download', 'sort/search-field changed', 'table/list returned');
    }
    assert.deepEqual(errors, []);
    return geometry;
  } catch (error) {
    await page.screenshot({ path:path.join(evidence, `tools-failure-${width}.png`) });
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel:'chrome' });
  try {
    const report = [];
    for (const width of [375,390,536]) report.push(await run(browser, width));
    fs.writeFileSync(path.join(evidence, 'tools-checks.json'), JSON.stringify(report, null, 2));
    console.log('Mobile tools: 375/390/536 geometry, chips, empty state, pagination and all rearranged actions passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
