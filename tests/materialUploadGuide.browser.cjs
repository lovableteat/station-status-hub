// The real guide and native workbook downloads; no account, database or AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const evidence = path.resolve(process.env.UPLOAD_GUIDE_EVIDENCE_DIR || '../material-upload-guide-evidence');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function assertFrame(page, guide, height) {
  await page.waitForFunction(height => {
    const node = document.querySelector('[data-testid="material-upload-guide"]');
    if (!node) return false;
    const box = node.getBoundingClientRect(); return box.y >= -1 && box.bottom <= height + 1;
  }, height);
  assert.ok(await guide.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Guide content must not stretch the dialog horizontally');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
async function download(page, guide, name, expectedName, source, width) {
  const link = guide.getByRole('link', { name, exact: true }).filter({ visible: true }).first();
  await link.scrollIntoViewIfNeeded();
  const waiting = page.waitForEvent('download'); await link.tap(); const item = await waiting;
  assert.equal(item.suggestedFilename(), expectedName);
  const destination = path.join(evidence, `${width}-${expectedName}`); await item.saveAs(destination);
  const hash = digest(fs.readFileSync(destination)); assert.equal(hash, digest(fs.readFileSync(source)), 'Download must preserve the original workbook bytes');
  return { name: expectedName, hash, bytes: fs.statSync(destination).size };
}
async function run(browser, origin, width) {
  const context = await browser.newContext({ viewport: { width, height: 884 }, deviceScaleFactor: 1, hasTouch: true, isMobile: width < 1024, reducedMotion: 'reduce', locale: 'zh-TW', acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
  try {
    await page.goto(origin); await page.getByRole('button', { name: '開啟上傳說明', exact: true }).tap();
    const guide = page.getByTestId('material-upload-guide'); await guide.waitFor(); await assertFrame(page, guide, 884);
    const nav = guide.locator('nav[aria-label="使用說明章節"]'), picker = guide.getByRole('combobox', { name: '選擇說明章節', exact: true });
    const buttons = nav.getByRole('button'), compact = await picker.isVisible();
    const options = compact ? await picker.locator('option').evaluateAll(nodes => nodes.filter(node => node.value).map(node => ({ label: node.textContent.trim(), value: node.value }))) : [];
    const count = compact ? options.length : await buttons.count(); assert.equal(count, 9, 'Guide must expose all nine current workflows');
    const selectChapter = async index => { if (compact) await picker.selectOption(options[index].value); else { await buttons.nth(index).scrollIntoViewIfNeeded(); await buttons.nth(index).tap(); assert.equal(await buttons.nth(index).getAttribute('aria-current'), 'page'); } };
    const { MATERIAL_CE_FIELDS } = await import('../src/components/material-requests/materialUploadContract.mjs');
    const chapters = [], downloads = []; let gotFiles = false, gotFields = false;
    for (let index = 0; index < count; index++) {
      const label = compact ? options[index].label : (await buttons.nth(index).innerText()).trim();
      await selectChapter(index);
      const content = guide.getByTestId('material-guide-content'); await content.waitFor();
      const body = await content.innerText(); assert.ok(body.length > 30, `${label} must contain usable instructions`);
      const textGeometry = await content.locator('p, li').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.closest('.material-guide-statuses')).map(node => {
        const style = getComputedStyle(node); return { size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
      }));
      assert.ok(textGeometry.every(item => item.size >= 14), `${label} contains tiny body text: ${JSON.stringify(textGeometry)}`);
      assert.ok(textGeometry.every(item => !Number.isFinite(item.lineHeight) || item.lineHeight >= item.size * 1.4), `${label} needs readable line spacing`);
      const last = content.locator('p, li').last(); if (await last.count()) await last.scrollIntoViewIfNeeded();
      await assertFrame(page, guide, 884);
      const fields = content.getByRole('table');
      if (await fields.count()) {
        const table = fields.first();
        if (await table.getByRole('rowheader').count() === 15) {
          gotFields = true;
          const region = table.locator('..'); assert.ok(await region.evaluate(node => node.scrollWidth <= node.clientWidth + 1 || ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)), 'A wide field table must scroll locally');
          if (width < 1024) { await region.evaluate(node => { node.scrollLeft = node.scrollWidth; }); assert.ok(await region.evaluate(node => node.scrollLeft > 0)); }
          await table.getByRole('rowheader').last().scrollIntoViewIfNeeded();
        }
      }
      if (label.includes('CE 交付格式') && compact) {
        const details = content.locator('details').filter({ visible: true }); assert.equal(await details.count(), 15);
        for (let fieldIndex = 0; fieldIndex < MATERIAL_CE_FIELDS.length; fieldIndex++) {
          const detail = details.nth(fieldIndex), field = MATERIAL_CE_FIELDS[fieldIndex];
          assert.ok((await detail.locator('summary').innerText()).includes(field.header));
          await detail.locator('summary').scrollIntoViewIfNeeded(); if (!await detail.evaluate(node => node.open)) await detail.locator('summary').tap();
          assert.ok((await detail.innerText()).includes(field.meaning), field.header + ' meaning must remain available');
          assert.ok((await detail.innerText()).includes(field.requirement), field.header + ' expanded rules must remain available');
        }
        gotFields = true;
      }
      if (!gotFiles && await guide.getByRole('link', { name: '下載 CE 交付格式', exact: true }).filter({ visible: true }).count()) {
        downloads.push(await download(page, guide, '下載 CE 交付格式', 'CE_BOM_交付格式.xlsx', 'public/material-upload-template.xlsx', width));
        downloads.push(await download(page, guide, '下載內部欄位參考', 'CE_BOM_填寫參考與範例.xlsx', 'public/material-ce-reference.xlsx', width)); gotFiles = true;
      }
      chapters.push({ label, text: body });
      if (index === 0 || gotFields && !fs.existsSync(path.join(evidence, `fields-${width}.png`))) await page.screenshot({ path: path.join(evidence, `${index === 0 ? 'overview' : 'fields'}-${width}.png`) });
    }
    assert.ok(gotFields, 'All fifteen CE fields must remain available'); assert.ok(gotFiles, 'Both CE workbook downloads must be discoverable');
    const complete = chapters.map(chapter => chapter.text).join('\n');
    for (const feature of ['我的標記', 'PDF AI', '線路修改', 'Review', 'SPEC', '自動儲存']) assert.ok(complete.includes(feature), `Updated guide must explain ${feature}`);
    await page.setViewportSize({ width, height: 500 }); await assertFrame(page, guide, 500);
    await selectChapter(0);
    const content = guide.getByTestId('material-guide-content'); await content.locator('p, li').last().scrollIntoViewIfNeeded();
    const initialHeading = await content.locator('h2,h3').first().innerText();
    await guide.getByRole('button', { name: '下一節', exact: true }).tap();
    assert.notEqual(await content.locator('h2,h3').first().innerText(), initialHeading);
    await guide.getByRole('button', { name: '上一節', exact: true }).tap();
    assert.equal(await content.locator('h2,h3').first().innerText(), initialHeading);
    await page.screenshot({ path: path.join(evidence, `short-${width}.png`) });
    const close = guide.getByRole('button', { name: '關閉說明', exact: true }); await close.tap(); await guide.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__guideFixture.closes), 1);
    await page.getByRole('button', { name: '開啟上傳說明', exact: true }).tap(); await guide.waitFor();
    await guide.getByRole('button', { name: '關閉上傳說明', exact: true }).tap(); await guide.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__guideFixture.closes), 2);
    assert.deepEqual(errors, []);
    return { width, result: 'passed', chapters: chapters.map(chapter => chapter.label), downloads, checks: ['all chapters reachable', 'readable body text and spacing', 'fifteen fields preserved', 'native workbook downloads preserve bytes', 'short viewport frame and close', 'no dialog horizontal overflow'] };
  } catch (error) { await page.screenshot({ path: path.join(evidence, `failure-${width}.png`) }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true }); const { createServer } = await import('vite'); const report = { result: 'running', checks: [] }; let server, browser;
  try {
    server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, '.vite'), resolve: { alias: { '@': path.resolve('src') } }, optimizeDeps: { entries: ['tests/support/materialUploadGuideFixture.jsx'], include: ['react/jsx-dev-runtime'] }, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'guide-local-fixture', configureServer(vite) { vite.middlewares.use((req, res, next) => { if (req.url?.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/materialUploadGuideFixture.jsx"></script></html>'); }); } }] });
    await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port; browser = await chromium.launch({ channel: 'chrome' });
    for (const width of [1440, 1180, 390, 536]) report.checks.push(await run(browser, origin, width));
    report.result = 'passed'; console.log('Upload guide chapters, readability and native downloads passed at1440/1180/390/536');
  } catch (error) { report.result = 'failed'; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2)); if (browser) await browser.close(); if (server) await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
