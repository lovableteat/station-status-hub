// Phone shell contract across the non-material workspaces, driven on the Vite dev server in demo mode
// (no real session, no production writes): no page-level horizontal overflow, the shared command bar
// and tools sheet open and close, toasts sit above the dock, and every dock item stays reachable.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');

const PORT = Number(process.env.MOBILE_AUDIT_PORT || 8099);
const BASE = `http://127.0.0.1:${PORT}/station-status-hub/`;
const page = (workspace) => `${BASE}?demo=admin&workspace=${workspace}`;

function startVite() {
  // Own the Vite process directly so stopping it cannot leave an npx grandchild
  // holding stdout/stderr pipes open after the browser assertions have ended.
  const child = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'isolated-test-key' },
  });
  child.stdout.on('data', () => {}); child.stderr.on('data', (chunk) => { const text = String(chunk); if (/error/i.test(text)) process.stderr.write(text); });
  // Readiness is the served page, not a log line: Vite's banner differs between shells and TTYs.
  return new Promise((resolve, reject) => {
    const started = Date.now();
    child.on('exit', (code) => reject(new Error(`vite exited with ${code}`)));
    const probe = () => fetch(BASE, { signal: AbortSignal.timeout(2000) }).then(async (response) => {
      await response.body?.cancel();
      if (response.ok) { console.log(`vite ready in ${Date.now() - started}ms`); resolve(child); }
      else throw new Error(String(response.status));
    }).catch(() => { if (Date.now() - started > 120000) reject(new Error('vite did not start')); else setTimeout(probe, 500); });
    setTimeout(probe, 1500);
  });
}
function stop(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
}

const overflow = (tab) => tab.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));

async function checkWorkspace(context, workspace, { bar, tools, sheet }) {
  const tab = await context.newPage();
  tab.setDefaultTimeout(20000);
  console.log(`checking ${workspace}`);
  await tab.goto(page(workspace), { waitUntil: 'domcontentloaded' });
  await tab.locator('[data-mobile-workspace-dock]').waitFor({ timeout: 30000 });
  await tab.waitForTimeout(1500);
  const widths = await overflow(tab);
  assert.ok(widths.document <= widths.viewport, `${workspace}: no horizontal overflow (${JSON.stringify(widths)})`);
  if (bar) await tab.locator(bar).first().waitFor({ timeout: 15000 });
  if (tools) {
    const trigger = tab.locator(tools).first();
    await trigger.waitFor({ timeout: 15000 });
    const box = await trigger.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${workspace}: tools trigger is a 44px target (${JSON.stringify(box)})`);
    await trigger.click();
    const panel = tab.locator(sheet);
    await panel.waitFor({ timeout: 10000 });
    const close = panel.locator('[data-ui="dialog-close"]');
    const closeBox = await close.boundingBox();
    assert.ok(closeBox && closeBox.width >= 44 && closeBox.height >= 44, `${workspace}: sheet close button is a 44px target`);
    await tab.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 10000 });
  }
  const dock = await tab.locator('[data-mobile-dock-item]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).every((rect) => rect.height >= 44 && rect.bottom <= window.innerHeight));
  assert.ok(dock, `${workspace}: dock items are reachable and 44px tall`);
  return tab;
}

// Raises one real toast through each of the app's two toast systems (sonner and the Radix hook) and checks that it sits
// above the dock (or whatever `floor` names) inside a list no taller than itself: a taller list is an invisible layer
// that swallows taps.
async function checkRealToasts(tab, viewport, floor = '[data-mobile-workspace-dock]') {
  const result = await tab.evaluate(async (floorSelector) => {
    const loaded = performance.getEntriesByType('resource').map((entry) => entry.name).reverse();
    const sonnerUrl = loaded.find((name) => /\/sonner\.js(\?|$)/.test(name));
    const radixUrl = loaded.find((name) => /\/src\/hooks\/use-toast\.ts(\?|$)/.test(name));
    if (!sonnerUrl || !radixUrl) return { error: `toast modules not found (sonner ${Boolean(sonnerUrl)}, radix ${Boolean(radixUrl)})` };
    (await import(sonnerUrl)).toast.success('稽核用提示');
    (await import(radixUrl)).toast({ title: '稽核用提示' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const floorTop = document.querySelector(floorSelector).getBoundingClientRect().top;
    const measure = (list, item) => {
      if (!list || !item) return { error: 'the toast did not render' };
      const box = item.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom), floorTop: Math.round(floorTop), listHeight: Math.round(list.getBoundingClientRect().height), toastHeight: Math.round(box.height) };
    };
    const sonnerList = document.querySelector('[data-sonner-toaster]');
    const radixList = document.querySelector('[data-ui="toast-viewport"]');
    return { sonner: measure(sonnerList, sonnerList?.querySelector('[data-sonner-toast]')), radix: measure(radixList, radixList?.querySelector('li')) };
  }, floor);
  assert.ok(!result.error, `${viewport.width}px: ${result.error}`);
  for (const [name, toast] of Object.entries(result)) {
    assert.ok(!toast.error && toast.bottom <= toast.floorTop + 1 && toast.top > viewport.height / 2 && toast.listHeight <= toast.toastHeight + 2,
      `${viewport.width}px: ${name} toasts sit above ${floor} without covering the page (${JSON.stringify(toast)})`);
  }
}

(async () => {
  const vite = await startVite();
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      // The dev server loads hundreds of modules; keep every resource timing so the page's own toast module can be found below.
      await context.addInitScript(() => performance.setResourceTimingBufferSize(5000));
      await checkWorkspace(context, 'file-uploads', { bar: '[data-testid="file-explorer-mobile-bar"]', tools: '[data-mobile-command-tools="true"]', sheet: '[data-testid="file-explorer-mobile-tools"]' });
      await checkWorkspace(context, 'comparison', { tools: '[data-testid="comparison-mobile-tools-trigger"]', sheet: '[data-testid="comparison-mobile-tools"]' });
      await checkWorkspace(context, 'user-management', { bar: '[data-testid="admin-mobile-bar"]', tools: '[data-testid="admin-mobile-bar"] [data-mobile-command-tools="true"]', sheet: '[data-testid="admin-mobile-tools"]' });
      await checkWorkspace(context, 'performance', { bar: '[data-testid="performance-mobile-bar"]', tools: '[data-testid="performance-mobile-bar"] [data-mobile-command-tools="true"]', sheet: '[data-testid="performance-mobile-tools"]' });
      const issues = await checkWorkspace(context, 'station-status&module=issues', {});
      const toast = await issues.evaluate(() => {
        const viewportNode = document.querySelector('[data-ui="toast-viewport"]');
        if (!viewportNode) return null;
        const style = getComputedStyle(viewportNode);
        const dock = document.querySelector('[data-mobile-workspace-dock]').getBoundingClientRect();
        const rect = viewportNode.getBoundingClientRect();
        return { top: style.top, bottom: style.bottom, aboveDock: rect.bottom <= dock.top + 1 };
      });
      assert.ok(!toast || (toast.aboveDock && parseFloat(toast.bottom) >= 60), `${viewport.width}px: toasts stack above the dock (${JSON.stringify(toast)})`);
      await checkRealToasts(issues, viewport);
      await context.close();
    }
    // Tablets share the dock, so a toast must land above it there too instead of hanging from the top of the page.
    const tablet = { width: 820, height: 1100 };
    const tabletContext = await browser.newContext({ viewport: tablet, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await tabletContext.addInitScript(() => performance.setResourceTimingBufferSize(5000));
    const tabletTab = await tabletContext.newPage();
    await tabletTab.goto(page('comparison'), { waitUntil: 'domcontentloaded' });
    await tabletTab.locator('[data-mobile-workspace-dock]').waitFor({ timeout: 30000 });
    await tabletTab.waitForTimeout(1500);
    await checkRealToasts(tabletTab, tablet);
    // In the AI chat the composer sits above the dock, so a toast has to clear the composer instead.
    await tabletTab.goto(page('ai-chat'), { waitUntil: 'domcontentloaded' });
    await tabletTab.locator('[data-mobile-ai-composer]').waitFor({ timeout: 30000 });
    await tabletTab.waitForTimeout(1500);
    await checkRealToasts(tabletTab, tablet, '[data-mobile-ai-composer]');
    await tabletContext.close();
    console.log('Phone shell verified at 390 and 320px: command bars, tools sheets, dock and toast placement (toasts also at 820px)');
  } finally {
    await browser.close();
    stop(vite);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
