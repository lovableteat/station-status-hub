// Full-app regression: real components, browser-local synthetic data, no external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');

const viewports = [[568, 320], [320, 568], [844, 390], [1440, 900]];
const modules = [
  { id: 'issues', label: '故障清單' },
  { id: 'dashboard', label: '問題儀表板' },
  { id: 'tools', label: '工具與資產' },
  { id: 'test-tracker', label: '舊測試紀錄' },
];
const out = path.resolve(process.env.AUDIT_SCREENSHOT_DIR || '../evidence-20261002/short-integrated');
fs.mkdirSync(out, { recursive: true });
let server, baseURL;
const touchReports = new WeakMap();

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 10000 });
}

async function geometry(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    let top = 0, bottom = innerHeight, left = 0, right = innerWidth;
    if (!element.closest('[role="dialog"]')) {
      for (const selector of ['[data-mobile-app-header]', '[data-mobile-maintenance-nav]']) {
        const overlay = document.querySelector(selector);
        if (overlay && !overlay.contains(element) && ['sticky', 'fixed'].includes(getComputedStyle(overlay).position)) {
          const bounds = overlay.getBoundingClientRect();
          if (bounds.height && bounds.top < innerHeight) top = Math.max(top, bounds.bottom);
        }
      }
      const dock = document.querySelector('[data-mobile-workspace-dock]')?.getBoundingClientRect();
      if (dock?.height) bottom = Math.min(bottom, dock.top);
    }
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
    }
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      x: rect.x, y: rect.y, w: rect.width, h: rect.height, top, bottom,
      full: rect.width > 0 && rect.height > 0 && rect.top >= top - 1 && rect.bottom <= bottom + 1 && rect.left >= left - 1 && rect.right <= right + 1,
      hit: !!hit && (hit === element || element.contains(hit)),
    };
  });
}

async function reachable(locator, label) {
  const bounds = await geometry(locator);
  assert.ok(bounds.full && bounds.hit, `${label} must be fully visible and receive taps: ${JSON.stringify(bounds)}`);
  assert.equal(await locator.isEnabled(), true, `${label} must be enabled`);
  return bounds;
}

async function noHorizontalOverflow(page, phase) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(widths.document <= widths.viewport, `${phase}: page-level horizontal overflow: ${JSON.stringify(widths)}`);
}

async function compactDocumentScroller(page, phase) {
  const state = await page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    return { overflowX: bodyStyle.overflowX, overflowY: bodyStyle.overflowY, documentIsScroller: document.scrollingElement === document.documentElement, scrollLock: document.body.getAttribute('data-scroll-locked') };
  });
  assert.deepEqual(state, { overflowX: 'clip', overflowY: 'visible', documentIsScroller: true, scrollLock: null }, `${phase}: compact maintenance must not create a hidden body scroller`);
  return state;
}

async function scrollDiagnostics(page, point) {
  return page.evaluate(point => {
    const describe = element => {
      if (!element) return null;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return {
        tag: element.tagName, id: element.id, className: String(element.className), role: element.getAttribute('role'),
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        overflowX: style.overflowX, overflowY: style.overflowY, overscrollY: style.overscrollBehaviorY,
        touchAction: style.touchAction, pointerEvents: style.pointerEvents,
      };
    };
    const hit = point ? document.elementFromPoint(point.x, point.y) : null;
    const ancestors = [];
    for (let element = hit; element; element = element.parentElement) ancestors.push(describe(element));
    return {
      scrollY, activeElement: describe(document.activeElement), scrollLock: document.body.getAttribute('data-scroll-locked'),
      documentScroller: describe(document.scrollingElement), body: describe(document.body), hitAncestors: ancestors,
      hosts: Object.fromEntries(['.maintenance-shell-content', '.mf-layout', '.mf-list-panel', '.mf-result-list'].map(selector => [selector, describe(document.querySelector(selector))])),
    };
  }, point);
}

// Real touch input. No scrollTop assignments, force clicks, or test-only layout changes.
async function swipe(page, distance = 120, container) {
  let area = await page.evaluate(() => {
    const header = document.querySelector('[data-mobile-app-header]')?.getBoundingClientRect();
    const dock = document.querySelector('[data-mobile-workspace-dock]')?.getBoundingClientRect();
    const top = Math.max(0, header?.bottom || 0), bottom = dock?.height ? dock.top : innerHeight;
    return { x: 0, y: top, width: innerWidth, height: bottom - top };
  });
  if (container) {
    const bounds = await container.boundingBox();
    assert.ok(bounds, 'The requested touch-scroll container must be visible');
    const x = Math.max(area.x, bounds.x), y = Math.max(area.y, bounds.y);
    area = { x, y, width: Math.min(area.x + area.width, bounds.x + bounds.width) - x, height: Math.min(area.y + area.height, bounds.y + bounds.height) - y };
  }
  assert.ok(area && area.height > 30, 'A usable touch-scroll region must exist');
  const x = area.x + area.width / 2;
  const length = Math.min(Math.abs(distance), area.height - 24);
  const start = distance > 0 ? area.y + area.height - 12 : area.y + 12;
  const point = { x, y: start };
  const report = { distance, area, point, before: await scrollDiagnostics(page, point) };
  touchReports.get(page)?.push(report);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start, id: 0 }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - Math.sign(distance) * length * step / 10, id: 0 }] });
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
  } finally {
    report.after = await scrollDiagnostics(page, point);
    await cdp.detach();
  }
}

async function revealByTouch(page, locator, label) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const bounds = await geometry(locator);
    if (bounds.full && bounds.hit) return bounds;
    const delta = bounds.y < bounds.top ? bounds.y - bounds.top - 12 : bounds.y + bounds.h - bounds.bottom + 12;
    await swipe(page, Math.sign(delta || 1) * Math.max(45, Math.min(130, Math.abs(delta))));
  }
  return reachable(locator, label);
}

async function waitForFaults(page) {
  await page.locator('.mf-result-list[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.mf-fault-row').count(), 12, 'The current maintenance RPC must render all twelve synthetic faults');
  await page.getByRole('heading', { name: /^故障清單/ }).waitFor();
}

async function checkDialog(page, trigger, result, dismissal) {
  await reachable(trigger, '快速報修');
  await trigger.tap();
  const dialog = page.getByRole('dialog', { name: '快速報修', exact: true });
  await dialog.waitFor();
  await page.waitForTimeout(250); // Let the production opening animation finish before hit testing.
  assert.equal(await dialog.getByLabel('機台序號／資產編號', { exact: false }).count(), 1);
  assert.equal(await dialog.getByLabel('遇到什麼問題？', { exact: false }).count(), 1);
  await reachable(dialog.getByRole('button', { name: '建立報修', exact: true }), '建立報修 footer');
  await reachable(dialog.getByRole('button', { name: '取消', exact: true }), '取消 footer');
  await reachable(dialog.getByRole('button', { name: 'Close', exact: true }), '報修關閉');
  await noHorizontalOverflow(page, 'report dialog');
  await shot(page, `${result.id}-dialog-${dismissal}`);
  if (dismissal === 'escape') await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: dismissal === 'close' ? 'Close' : '取消', exact: true }).tap();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForTimeout(150);
  // Record immediately, assert after navigation too so a focus regression does not hide
  // evidence for the remaining actual interactions. Never focus the trigger in the test.
  result.focusReturns.push({ dismissal, returned: await trigger.evaluate(element => document.activeElement === element), active: await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100) })) });
  assert.equal(await page.locator('[data-ui="scrim"]').count(), 0, 'Closing must remove the blocking overlay');
  await reachable(trigger, 'Returned report trigger');
  await shot(page, `${result.id}-returned-${dismissal}`);
  result.checks.push(`tap-report-${dismissal}-and-return`);
}

async function checkViewport(width, height) {
  const result = { id: `${width}x${height}`, checks: [], pageErrors: [], errors: [], blockedRequests: [], focusReturns: [], touchScrolls: [] };
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 1024, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === baseURL) return route.continue();
      result.blockedRequests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    // Only the fixture's own Vite socket is allowed; never connect to a backend WebSocket.
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      if (url.protocol === 'ws:' && url.host === new URL(baseURL).host) return socket.connectToServer();
      result.blockedRequests.push(socket.url());
      socket.close();
    });
    page = await context.newPage();
    touchReports.set(page, result.touchScrolls);
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => {
      const stack = error.stack || String(error);
      result.pageErrors.push(stack);
      console.error(`[${result.id}] pageerror: ${stack}`);
    });
    await page.goto(`${baseURL}/station-status-hub/?demo=admin&workspace=station-status&module=issues`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-mobile-app-header]').waitFor({ timeout: 45000 });
    // Wait for the expected responsive tree, not a union whose first match may be hidden.
    const nav = page.getByRole('navigation', { name: '維修中心功能', exact: true });
    await nav.waitFor({ timeout: 45000 });
    await waitForFaults(page);
    const originalData = await page.evaluate(() => structuredClone(window.__AUDIT_DB__));
    assert.deepEqual(await nav.getByRole('button').allTextContents().then(texts => texts.map(text => text.trim())), modules.map(module => module.label));
    assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
    if (width < 1024) {
      result.bodyBeforeReport = await compactDocumentScroller(page, 'Before report');
      assert.equal(await page.locator('[data-mobile-maintenance-nav]').count(), 1);
      assert.equal(await page.locator('.maintenance-sidebar').count(), 0);
      result.position = await nav.evaluate(element => getComputedStyle(element).position);
      assert.equal(result.position, height <= 500 ? 'static' : 'sticky');
      result.checks.push('four-mobile-modules-and-short-landscape-position');
    } else {
      assert.equal(await page.locator('[data-mobile-maintenance-nav]').count(), 0);
      assert.equal(await page.locator('.maintenance-sidebar').count(), 1);
      result.checks.push('four-desktop-sidebar-modules');
    }
    await noHorizontalOverflow(page, 'initial faults');
    await shot(page, `${result.id}-initial`);
    const trigger = page.getByRole('button', { name: '快速報修', exact: true });
    if (height < 500) {
      const before = await page.evaluate(() => scrollY);
      await swipe(page, 100);
      result.scrollY = await page.evaluate(() => scrollY);
      assert.ok(result.scrollY > before, 'A real upward touch swipe must scroll the short landscape page');
      result.checks.push('short-landscape-touch-scroll');
    }
    await revealByTouch(page, trigger, '快速報修');
    result.trigger = await reachable(trigger, '快速報修');
    await shot(page, `${result.id}-scrolled`);
    for (const dismissal of ['close', 'cancel', 'escape']) await checkDialog(page, trigger, result, dismissal);

    if (width < 1024) {
      result.bodyAfterReport = await compactDocumentScroller(page, 'After all report dismissals');
      result.checks.push('compact-body-keeps-document-scroller');
      const before = await page.evaluate(() => scrollY);
      await swipe(page, 120);
      assert.ok(await page.evaluate(() => scrollY) > before, 'Closing the report must restore page touch scrolling');
      // Also start on actual result rows. A working page gutter must not conceal
      // a list/filter ancestor that traps gestures with overscroll containment.
      const firstRow = page.locator('.mf-row-open').first();
      await revealByTouch(page, firstRow, 'First fault row');
      await reachable(firstRow, 'First fault row');
      const beforeRows = await page.evaluate(() => scrollY);
      await swipe(page, 100, page.locator('.mf-result-list'));
      const lastTouch = result.touchScrolls.at(-1);
      assert.ok(lastTouch.before.hitAncestors.some(element => element.className.split(/\s+/).includes('mf-result-list')), 'The result-scroll gesture must actually start within the fault results');
      assert.ok(await page.evaluate(() => scrollY) > beforeRows, 'Touch scrolling over fault rows must scroll the mobile document');
      result.checks.push('touch-scroll-from-fault-result-rows');
    } else {
      const list = page.locator('.mf-result-list');
      const before = await list.evaluate(element => element.scrollTop);
      await swipe(page, 120, list);
      assert.ok(await list.evaluate(element => element.scrollTop) > before, 'Desktop fault results must remain touch-scrollable');
      const collapse = page.getByRole('button', { name: '收合側欄', exact: true });
      await reachable(collapse, 'Collapse sidebar'); await collapse.tap();
      await page.locator('.maintenance-sidebar[data-collapsed="true"]').waitFor();
      const expand = page.getByRole('button', { name: '展開側欄', exact: true });
      await reachable(expand, 'Expand sidebar'); await expand.tap();
      await page.locator('.maintenance-sidebar[data-collapsed="false"]').waitFor();
      await page.waitForTimeout(250);
      result.checks.push('desktop-sidebar-collapse-and-expand');
    }
    await shot(page, `${result.id}-results-scroll`);
    result.checks.push('scroll-after-dialog-dismissal');

    for (const module of [...modules.slice(1), modules[0]]) {
      const button = nav.getByRole('button', { name: module.label, exact: true });
      await revealByTouch(page, button, module.label);
      await reachable(button, module.label);
      await button.tap();
      await page.locator(`.maintenance-shell-module[data-module="${module.id}"]`).waitFor();
      await page.getByRole('heading', { name: module.id === 'issues' ? /^故障清單/ : module.label, exact: module.id !== 'issues' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('module'), module.id);
      assert.equal(await button.getAttribute('aria-current'), 'page');
      if (module.id === 'issues') await waitForFaults(page);
      if (module.id === 'dashboard') {
        await page.locator('[aria-label="專案故障統計"][aria-busy="false"]').waitFor();
        assert.equal(await page.getByRole('button', { name: 'AUDIT-SERIAL-1', exact: true }).count(), 1);
      }
      await noHorizontalOverflow(page, module.id);
      await shot(page, `${result.id}-${module.id}`);
      result.checks.push(`tap-navigation-${module.id}`);
    }
    assert.deepEqual(result.pageErrors, [], 'The full app must not raise page errors');
    assert.deepEqual(result.blockedRequests, [], 'The full-app fixture must not attempt external requests or WebSockets');
    assert.deepEqual(await page.evaluate(() => window.__AUDIT_DB__), originalData, 'Opening, dismissing and navigating must not change any original fixture data');
    result.checks.push('all-original-fixture-data-unchanged');
    assert.ok(result.focusReturns.every(item => item.returned), `Every report dismissal must restore focus to its opener: ${JSON.stringify(result.focusReturns)}`);
    result.checks.push('all-report-dismissals-restore-focus');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    result.errors.push(error.stack || String(error));
    // Startup/navigation failures also keep their screenshot and pageerror stacks.
    if (page) {
      await shot(page, `${result.id}-failure`).catch(failure => result.errors.push(`Failure screenshot: ${failure.stack || failure}`));
      result.failureURL = page.url();
      result.failureScrollState = await scrollDiagnostics(page).catch(() => null);
      result.calls = await page.evaluate(() => window.__AUDIT_CALLS__ || []).catch(() => []);
    }
  } finally {
    await browser?.close();
  }
  console.log(JSON.stringify(result));
  return result;
}

(async () => {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react-swc');
  const results = [];
  try {
    server = await createServer({
      configFile: false, envFile: false, root: process.cwd(), base: '/station-status-hub/', plugins: [react()],
      server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [process.cwd(), fs.realpathSync('node_modules')] } },
      resolve: { alias: [{ find: '@/integrations/supabase/client', replacement: path.resolve('tests/support/mobileAppMock.mjs') }, { find: '@', replacement: path.resolve('src') }] },
      optimizeDeps: { exclude: ['occt-wasm'] }, worker: { format: 'es' },
    });
    await server.listen();
    baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const [width, height] of viewports) {
      results.push(await checkViewport(width, height));
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    }
    assert.ok(results.every(result => result.status === 'passed'), `Landscape regression failed; evidence retained in ${out}`);
  } finally { await server?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
