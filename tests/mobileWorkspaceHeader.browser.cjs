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
    // 375×667 is a short phone (iPhone SE size): the QR dialog must scroll, not cut off its buttons.
    for (const [width, height] of [[700, 884], [629, 884], [390, 884], [1543, 884], [375, 667]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: 'reduce' });
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
      // The website QR is in the top-right on every width, phones included (2026-11-22).
      const qr = page.locator('[data-platform-control="qr"]');
      const qrBox = await qr.boundingBox();
      assert.ok(qrBox && qrBox.height === 44 && qrBox.width >= 44 && qrBox.x + qrBox.width <= geometry.button.x, `QR button must sit beside the account button: ${JSON.stringify(qrBox)}`);
      await qr.click();
      const qrDialog = page.getByRole('dialog', { name: '用手機開啟平台' });
      await qrDialog.waitFor();
      await page.waitForFunction(() => { const img = document.querySelector('img[alt="工作平台網站二維碼"]'); return img && img.complete && img.naturalWidth > 0; });
      const qrDialogState = await qrDialog.evaluate(dialog => {
        dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
        const r = dialog.getBoundingClientRect();
        const img = dialog.querySelector('img').getBoundingClientRect();
        const share = [...dialog.querySelectorAll('button')].find(button => button.textContent.includes('分享'));
        share.scrollIntoView({ block: 'nearest' });
        const s = share.getBoundingClientRect();
        const atShare = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
        return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, qrSize: img.width, shareReachable: share.contains(atShare), text: dialog.textContent };
      });
      assert.ok(qrDialogState.x >= 0 && qrDialogState.right <= width && qrDialogState.top >= 0 && qrDialogState.bottom <= height, `QR dialog must fit the screen: ${JSON.stringify(qrDialogState)}`);
      assert.ok(qrDialogState.qrSize >= 220, `QR must be large enough to scan: ${qrDialogState.qrSize}`);
      assert.ok(qrDialogState.shareReachable, 'the share button must not be covered');
      assert.match(qrDialogState.text, /lovableteat\.github\.io\/station-status-hub\//);
      await page.screenshot({ path: path.join(out, `qr-${width}.png`) });
      await page.keyboard.press('Escape');
      await qrDialog.waitFor({ state: 'hidden' });
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
