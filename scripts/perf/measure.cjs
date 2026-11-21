// Times a measurement build (scripts/perf/build.mjs) in Chrome with a throttled network. See docs/performance-startup.md.
// usage: node scripts/perf/measure.cjs [label=current] [profile=office|phone] [workspace,workspace…]
//        → a table on stdout and output/perf/result-<label>-<profile>.json (with every data call and its timing)
// Needs Playwright from the QA folder (AUDIT_QA_DIR, default ../qa-tools), like the browser tests.
//
// A page counts as settled when, for 1.2 s, no element was added to the page and no data call is pending; its time is
// the last of those, from the navigation (or from the navigation event for a switch). Background preloads are not
// part of what the user waits for, so downloads alone do not count.
//   cold      empty cache, a signed-in tab opens the workspace's URL
//   warm      the same tab reloads (files still fresh in the HTTP cache)
//   switch    from the home page to the workspace right after the home page settled
//   again     back home, then the same workspace once more
//   afterIdle from the home page after it sat idle (PERF_IDLE_WAIT ms, default 25000): the background preloads are in
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');

const label = process.argv[2] || 'current';
const RUNS = Math.max(1, Number(process.env.PERF_RUNS || 3));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const profileName = process.argv[3] || 'office';
const filter = process.argv[4] || '';
const PROFILES = {
  // Desktop on office Wi-Fi: about what curl measured from this machine to the hosting CDN.
  office: { latency: 60, down: 20e6 / 8, up: 5e6 / 8, cpu: 1, viewport: { width: 1440, height: 900 }, mobile: false },
  // Phone on 4G with a mid-range CPU.
  phone: { latency: 150, down: 5e6 / 8, up: 1.5e6 / 8, cpu: 4, viewport: { width: 390, height: 844 }, mobile: true },
};
const profile = PROFILES[profileName];
const out = path.resolve(__dirname, '../../output/perf');
const dist = path.join(out, `dist-${label}`);
if (!fs.existsSync(dist)) { console.error(`${dist} not found: run node scripts/perf/build.mjs ${label} first`); process.exit(1); }
const BASE_PATH = '/station-status-hub/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const gz = new Map();

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://x');
    if (!url.pathname.startsWith(BASE_PATH)) { response.writeHead(404).end(); return; }
    let rel = decodeURIComponent(url.pathname.slice(BASE_PATH.length)) || 'index.html';
    const file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end('nf'); return; }
    const stat = fs.statSync(file);
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    // GitHub Pages: everything max-age=600, gzip, ETag revalidation.
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: etag };
    if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers).end(); return; }
    const compress = /\.(html|js|mjs|css|json|svg)$/.test(file);
    if (compress) {
      if (!gz.has(file)) gz.set(file, zlib.gzipSync(fs.readFileSync(file)));
      response.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.get(file).length }).end(gz.get(file));
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': stat.size });
      fs.createReadStream(file).pipe(response);
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const INIT = () => {
  // A tab that is signed in: the Supabase client keeps its session under a per-tab key that this pointer names.
  try { window.sessionStorage.setItem('bringup-auth-active-storage-key', 'perf-session'); window.sessionStorage.setItem('perf-session', '{}'); } catch { /* storage blocked */ }
  window.__PERF_DOM__ = performance.now();
  const start = () => new MutationObserver((records) => {
    for (const record of records) {
      if (record.target === document.head || (record.target.nodeType === 1 && record.target.closest('head'))) continue;
      for (const node of record.addedNodes) if (node.nodeType === 1) { window.__PERF_DOM__ = performance.now(); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
};

async function settle(page, since = 0, quiet = 1200, limit = 45000) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(() => {
      const calls = window.__PERF_CALLS__ || [];
      const resources = performance.getEntriesByType('resource');
      return {
        now: performance.now(), dom: window.__PERF_DOM__ || 0,
        pending: calls.filter((call) => call.end === null).length,
        lastCall: calls.reduce((max, call) => Math.max(max, call.end ?? call.start), 0),
        lastResource: resources.reduce((max, entry) => Math.max(max, entry.responseEnd || entry.startTime), 0),
        boot: Boolean(document.getElementById('app-boot')),
      };
    }).catch(() => null);
    if (state) {
      const last = Math.max(state.dom, state.lastCall);
      if (!state.boot && state.pending === 0 && state.now - last > quiet) return Math.round(last - since);
    }
    if (Date.now() - started > limit) return -1;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function snapshot(page, since = 0) {
  return page.evaluate((from) => {
    const resources = performance.getEntriesByType('resource').filter((entry) => entry.startTime >= from);
    const scripts = resources.filter((entry) => /\.(js|mjs)(\?|$)/.test(entry.name));
    const calls = (window.__PERF_CALLS__ || []).filter((call) => call.start >= from).map((call) => ({ label: call.label, start: Math.round(call.start - from), end: call.end === null ? null : Math.round(call.end - from) }));
    return {
      requests: resources.length, scripts: scripts.length,
      bytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      lastScript: Math.round(scripts.reduce((max, entry) => Math.max(max, entry.responseEnd), from) - from),
      calls,
    };
  }, since);
}

// Sequential depth of the data calls: the longest chain of calls that each start after the previous one ended.
function callDepth(calls) {
  const done = calls.filter((call) => call.end !== null).sort((a, b) => a.start - b.start);
  let depth = 0; let end = -1;
  for (const call of done) if (call.start >= end - 2) { depth += 1; end = call.end; }
  return depth;
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.mobile, hasTouch: profile.mobile, deviceScaleFactor: profile.mobile ? 2 : 1 });
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up });
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  return { context, page, errors };
}

const WORKSPACES = [
  ['home', ''],
  ['station-status', 'workspace=station-status&module=issues'],
  ['file-uploads', 'workspace=file-uploads&module=test-plan'],
  ['comparison', 'workspace=comparison&module=comparison'],
  ['material-requests', 'workspace=material-requests'],
  ['data-center', 'workspace=data-center'],
  ['pcb-designer', 'workspace=pcb-designer'],
  ['ai-chat', 'workspace=ai-chat&module=ai-chat'],
  ['performance', 'workspace=performance'],
  ['user-management', 'workspace=user-management&module=users'],
].filter(([name]) => !filter || filter.split(',').includes(name));

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}${BASE_PATH}`;
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  const results = [];
  try {
    for (const [name, query] of WORKSPACES) {
      const url = `${origin}?${query}`;
      // Cold and warm are the median of PERF_RUNS loads (default 3): one load can be off by a few hundred ms.
      const colds = []; const warms = []; const errors = [];
      let coldInfo; let warmInfo; let text = 0;
      for (let run = 0; run < RUNS; run += 1) {
        // Cold: empty cache, straight to the workspace.
        const first = await newPage(browser);
        await first.page.goto(url, { waitUntil: 'commit' });
        colds.push(await settle(first.page));
        coldInfo = await snapshot(first.page);
        // Warm: same tab, reload (HTTP cache still fresh).
        await first.page.reload({ waitUntil: 'commit' });
        warms.push(await settle(first.page));
        warmInfo = await snapshot(first.page);
        text = (await first.page.evaluate(() => document.body.innerText.length));
        errors.push(...first.errors);
        await first.context.close();
      }
      const cold = median(colds); const warm = median(warms);

      // Switch: open home, wait, then go to the workspace the way a click does.
      let switchCold = null; let switchWarm = null; let switchInfo = null; let switchIdle = null;
      if (name !== 'home') {
        const second = await newPage(browser);
        await second.page.goto(origin, { waitUntil: 'commit' });
        await settle(second.page);
        const go = async (target) => {
          const since = await second.page.evaluate((detail) => { const at = performance.now(); window.__PERF_DOM__ = at; window.dispatchEvent(new CustomEvent('navigate', { detail })); return at; }, target);
          const time = await settle(second.page, since);
          return { time, info: await snapshot(second.page, since) };
        };
        const module = new URLSearchParams(query).get('module') || { 'material-requests': 'material-requests', 'data-center': 'data-center', 'pcb-designer': 'pcb-designer', performance: 'performance' }[name];
        const first = await go({ module });
        switchCold = first.time; switchInfo = first.info;
        // Back home (module "…" has no home target: use history), then the same workspace again with its code cached.
        const home = async () => {
          await second.page.evaluate(() => window.history.back());
          await second.page.waitForFunction(() => !new URLSearchParams(window.location.search).get('workspace'), null, { timeout: 8000 }).catch(() => {});
          await settle(second.page, 0, 800);
        };
        await home();
        const again = await go({ module });
        switchWarm = again.time;
        errors.push(...second.errors);
        await second.context.close();
        // The realistic switch: the user has been on the home page for a while (background preloads done), first visit to the workspace.
        const third = await newPage(browser);
        await third.page.goto(origin, { waitUntil: 'commit' });
        await settle(third.page);
        await third.page.waitForTimeout(Number(process.env.PERF_IDLE_WAIT || 25000));
        const since = await third.page.evaluate((detail) => { const at = performance.now(); window.__PERF_DOM__ = at; window.dispatchEvent(new CustomEvent('navigate', { detail })); return at; }, { module });
        switchIdle = await settle(third.page, since);
        errors.push(...third.errors);
        await third.context.close();
      }
      const row = {
        name, cold, warm, colds, warms, switchCold, switchWarm, switchIdle, text,
        coldRequests: coldInfo.requests, coldScripts: coldInfo.scripts, coldKB: Math.round(coldInfo.bytes / 1024), coldLastScript: coldInfo.lastScript,
        coldCalls: coldInfo.calls.length, coldCallDepth: callDepth(coldInfo.calls),
        warmRequests: warmInfo.requests, warmKB: Math.round(warmInfo.bytes / 1024),
        switchScripts: switchInfo?.scripts ?? null, switchKB: switchInfo ? Math.round(switchInfo.bytes / 1024) : null, switchCalls: switchInfo?.calls.length ?? null,
        calls: coldInfo.calls, errors: [...new Set(errors)].slice(0, 5),
      };
      results.push(row);
      console.log(`${name.padEnd(18)} cold ${String(cold).padStart(6)}ms  warm ${String(warm).padStart(6)}ms  switch ${String(switchCold ?? '-').padStart(6)}ms / again ${String(switchWarm ?? '-').padStart(6)}ms / afterIdle ${String(switchIdle ?? '-').padStart(6)}ms | ${row.coldScripts} js ${row.coldKB}KB lastJS ${row.coldLastScript}ms | calls ${row.coldCalls} depth ${row.coldCallDepth}${row.errors.length ? ' | ERR ' + row.errors[0] : ''}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(out, `result-${label}-${profileName}.json`), JSON.stringify(results, null, 1));
})().catch((error) => { console.error(error); process.exitCode = 1; });
