const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const evidence = path.resolve(process.env.SITE_KNOWLEDGE_EVIDENCE_DIR || '../site-knowledge-evidence');
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const { createServer } = await import('vite'), mock = path.resolve('tests/support/siteKnowledgeChatMock.tsx');
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, '.vite'), resolve: { alias: [{ find: '@/integrations/supabase/client', replacement: mock }, { find: '@/components/auth/UserContext', replacement: mock }, { find: './AiQuotaStatus', replacement: mock }, { find: './aiUsageTelemetry', replacement: mock }, { find: '@', replacement: path.resolve('src') }] }, optimizeDeps: { entries: ['tests/support/siteKnowledgeChatFixture.jsx'], include: ['react/jsx-dev-runtime'] }, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'site-chat-fixture', configureServer(vite) { vite.middlewares.use((req, res, next) => { if (req.url !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/siteKnowledgeChatFixture.jsx"></script></html>'); }); } }] });
  let browser; const results = [];
  try {
    await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`; browser = await chromium.launch({ channel: 'chrome' });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 884 }, hasTouch: true, isMobile: width < 768, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
      await page.goto(origin); const input = page.getByRole('textbox', { name: '輸入查詢內容', exact: true }); await input.waitFor();
      await input.fill('1+1=?'); await page.getByRole('button', { name: '送出查詢', exact: true }).tap();
      await page.waitForFunction(() => window.__siteQA.requests.length === 1);
      assert.equal(await page.evaluate(() => window.__siteQA.reads.length), 0, 'Arithmetic must not read site tables');
      await input.fill('全站查 Vera BOM、檔案與 Data Center 日報，還有績效紀錄'); await page.getByRole('button', { name: '送出查詢', exact: true }).tap();
      const sources = page.locator('[data-site-knowledge-sources]'); await sources.waitFor(); await sources.locator('summary').tap();
      assert.match(await sources.innerText(), /Vera.pdf/); assert.match(await sources.innerText(), /QA RLS denied/); assert.match(await sources.innerText(), /符合 31 筆/);
      const reads = await page.evaluate(() => window.__siteQA.reads); assert.ok(reads.some(row => row.table === 'material_bom_records')); assert.ok(reads.some(row => row.table === 'test_plan_files')); assert.ok(reads.some(row => row.table === 'data_center_work_reports'));
      assert.ok(reads.every(row => !/api_keys|system_users|personal_marks/.test(row.table) && !row.fields.includes('*')));
      assert.ok(await sources.getByRole('link').first().getAttribute('href').then(href => href.startsWith('?workspace=')));
      await page.screenshot({ path: path.join(evidence, `sources-${width}.png`) });
      await input.fill('1+1=?'); const before = reads.length; await page.getByRole('button', { name: '送出查詢', exact: true }).tap(); await page.waitForFunction(() => window.__siteQA.requests.length === 3);
      assert.equal(await page.evaluate(() => window.__siteQA.reads.length), before);
      if (width < 768) await page.getByRole('button', { name: '對話工具', exact: true }).tap(); else await page.getByRole('button', { name: '資料來源：全站資料、維修資料與料號 SPEC', exact: true }).tap();
      const toggle = page.getByRole('switch', { name: '全站資料', exact: true }); assert.equal(await toggle.getAttribute('aria-checked'), 'true'); await toggle.tap(); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await page.screenshot({ path: path.join(evidence, `control-${width}.png`) }); assert.deepEqual(errors, []);
      results.push({ width, result: 'passed', checks: ['general chat performs no website reads', 'actual send receives cross-module evidence', 'RLS error and count visible', 'source links stay in product', 'source toggle responds'] }); await context.close();
    }
    fs.writeFileSync(path.join(evidence, 'browser-report.json'), JSON.stringify({ result: 'passed', results, provider: 'synthetic, no paid calls', database: 'isolated current-contract fixture' }, null, 2)); console.log(JSON.stringify(results));
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
