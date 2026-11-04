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
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
    env: { ...process.env, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'isolated-test-key' },
  });
  child.stdout.on('data', () => {}); child.stderr.on('data', (chunk) => { const text = String(chunk); if (/error/i.test(text)) process.stderr.write(text); });
  // Readiness is the served page, not a log line: Vite's banner differs between shells and TTYs.
  return new Promise((resolve, reject) => {
    const started = Date.now();
    child.on('exit', (code) => reject(new Error(`vite exited with ${code}`)));
    const probe = () => fetch(BASE).then((response) => {
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

(async () => {
  const vite = await startVite();
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
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
      await context.close();
    }
    console.log('Phone shell verified at 390 and 320px: command bars, tools sheets, dock and toast placement');
  } finally {
    await browser.close();
    stop(vite);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
