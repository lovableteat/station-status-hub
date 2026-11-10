const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const out = path.resolve(process.env.MATERIAL_HEADER_EVIDENCE_DIR || '../material-mobile-header-evidence');

(async () => {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react-swc');
  let server, browser;
  try {
    fs.mkdirSync(out, { recursive: true });
    const productionHeader = { name: 'production-header-controls', enforce: 'pre', transform(code, id) {
      if (!id.endsWith('/src/pages/Index.tsx')) return;
      // Demo mode hides collaboration; exercise the same control layout as signed-in accounts.
      return code.replace('showOnlineUsers={!isDemoMode}', 'showOnlineUsers={true}').replace('showNotifications={!isDemoMode}', 'showNotifications={true}');
    } };
    server = await createServer({ configFile: false, envFile: false, root: process.cwd(), base: '/station-status-hub/', plugins: [productionHeader, react()], server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }, resolve: { alias: [{ find: '@/integrations/supabase/client', replacement: path.resolve('tests/support/mobileAppMock.mjs') }, { find: '@', replacement: path.resolve('src') }] }, optimizeDeps: { exclude: ['occt-wasm'] }, worker: { format: 'es' } });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'chrome' });
    const results = [];
    for (const width of [700, 629, 390, 1543]) {
      const context = await browser.newContext({ viewport: { width, height: 884 }, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/station-status-hub/?demo=admin`);
      const account = page.getByRole('button', { name: '開啟帳號選單', exact: true });
      await account.waitFor();
      await page.getByRole('button', { name: '通知與線上人員', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await account.evaluate(button => {
        const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return { button: box(button), avatar: box(button.querySelector('[data-radix-avatar-root]') || button.querySelector('[role="img"]') || button.querySelector('span > span')), brand: box(document.querySelector('[data-platform-brand]')), controls: box(document.querySelector('[data-platform-controls]')), pageWidth: document.documentElement.scrollWidth };
      });
      await page.screenshot({ path: path.join(out, `header-${width}.png`) });
      assert.equal(geometry.pageWidth, width);
      assert.equal(geometry.button.height, 44);
      assert.equal(geometry.button.width, width < 1024 ? 44 : 140);
      assert.ok(geometry.avatar.x >= geometry.button.x && geometry.avatar.right <= geometry.button.right, `avatar must fit account button: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.controls.right <= width && geometry.brand.right <= geometry.controls.x, 'brand and controls must remain inside the viewport without overlap');
      await account.click();
      await page.locator('[data-platform-account-menu]').waitFor();
      const menu = await page.locator('[data-platform-account-menu]').boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width);
      await page.keyboard.press('Escape');
      await page.locator('[data-platform-account-menu]').waitFor({ state: 'hidden' });
      await account.click();
      await page.locator('[data-platform-account-menu]').waitFor();
      await page.mouse.click(10, 400);
      await page.locator('[data-platform-account-menu]').waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      results.push({ width, geometry, menu, menuOpenedTwiceAndClosed: true });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'header-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { if (browser) await browser.close(); if (server) await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
