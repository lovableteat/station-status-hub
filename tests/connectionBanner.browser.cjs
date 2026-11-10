const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const evidence = path.resolve(process.env.BANNER_EVIDENCE_DIR || '../compact-ai-banner');
const stage = process.env.BANNER_STAGE || 'after';
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const { createServer, transformWithEsbuild } = await import('vite');
  const source = fs.readFileSync('src/components/api-management/ApiChatConsole.tsx', 'utf8');
  const banner = source.slice(source.indexOf('function ConnectionBanner('), source.indexOf('\nfunction MetricTile('));
  assert.ok(banner.startsWith('function ConnectionBanner('));
  const moduleSource = `import React from 'react';import {CheckCircle2,AlertTriangle,Trash2,X} from 'lucide-react';import {Button} from '@/components/ui/button';import {cn} from '@/lib/utils';\n${banner}\nexport {ConnectionBanner};`;
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: path.join(evidence, '.vite'), resolve: { alias: { '@': path.resolve('src') } }, optimizeDeps: { entries: ['tests/support/connectionBannerFixture.jsx'], include: ['react/jsx-dev-runtime'] }, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-connection-banner', resolveId(id) { if (id === 'virtual:qa-connection-banner') return '\0qa-connection-banner'; }, async load(id) { if (id === '\0qa-connection-banner') return (await transformWithEsbuild(moduleSource, 'ConnectionBanner.tsx', { loader: 'tsx', jsx: 'automatic' })).code; }, configureServer(vite) { vite.middlewares.use((req, res, next) => { if (req.url?.split('?')[0] !== '/') return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/connectionBannerFixture.jsx"></script></html>'); }); } }] });
  let browser; const results = [];
  try {
    await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port; browser = await chromium.launch({ channel: 'chrome' });
    for (const width of [1654, 1024, 390]) for (const long of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 884 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin + (long ? '/?long' : '/'), { timeout: 45000 });
      const notice = page.locator('[data-ai-connection-banner]'); await notice.waitFor();
      const size = await notice.evaluate(element => {
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const button = element.querySelector('button'), b = button.getBoundingClientRect();
        return { banner: rect(element), button: rect(button), pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, buttonHit: button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)), clippedText: [...element.querySelectorAll('p')].filter(p => p.scrollWidth > p.clientWidth + 1).map(p => ({ text: p.textContent, title: p.title })) };
      });
      await page.screenshot({ path: path.join(evidence, `${stage}-${width}${long ? '-long' : ''}.png`) });
      if (stage !== 'before') {
        assert.equal(size.pageWidth, width, 'banner cannot overflow the viewport'); assert.equal(size.buttonHit, true, 'close button must be clickable');
        assert.ok(size.button.x >= size.banner.x && size.button.right <= size.banner.right + 1 && size.button.bottom <= size.banner.bottom + 1, 'close button must stay inside the banner');
        assert.ok(size.button.width >= (width < 1024 ? 44 : 32) && size.button.height >= (width < 1024 ? 44 : 32));
        for (const text of size.clippedText) assert.ok(text.title && text.text.endsWith(text.title), 'truncated diagnostics must retain their full value in title');
        if (!long && width >= 1024) {
          const beforeFile = path.join(evidence, 'before.json');
          const beforeHeight = fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, 'utf8')).results.find(result => result.width === width && !result.long).banner.height : 158;
          assert.ok(size.banner.height <= beforeHeight * 0.55, `desktop status should occupy about half the previous height (${size.banner.height}/${beforeHeight})`);
        }
        assert.deepEqual(errors, []);
      }
      await notice.getByRole('button').click(); await notice.waitFor({ state: 'hidden' });
      results.push({ width, long, ...size, closeWorks: true, errors }); await page.close();
    }
    fs.writeFileSync(path.join(evidence, stage + '.json'), JSON.stringify({ results }, null, 2));
    console.log(JSON.stringify(results.map(r => ({ width: r.width, long: r.long, height: r.banner.height, pageWidth: r.pageWidth, closeWorks: r.closeWorks }))));
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
