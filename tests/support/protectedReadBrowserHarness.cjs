// Real Chromium execution is PR-CI-only. Builders may run locally without a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');

function assertCompletedBrowserCases(results, expectedCount) {
  assert.equal(results.length, expectedCount, 'Every configured browser case must finish');
  const failures = results.filter(result => result.status !== 'passed');
  assert.equal(failures.length, 0, `Browser cases did not pass: ${failures.map(result => `${result.viewport.width}:${result.name}:${result.status}`).join(', ')}`);
}

async function runProtectedReadBrowser({ build, buildOnly, evidenceEnv, name, scenarios, inspect, limits = [] }) {
  const bundle = await build();
  if (process.env[buildOnly] === '1') {
    console.log(JSON.stringify({ status: 'build-only-passed', browserExecuted: false, actualSources: bundle.inputs, bytes: bundle.javascript.length }));
    return;
  }
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Only the authorized GitHub PR CI may launch Chromium');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request', 'No push/deploy/local browser execution');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR, 'package.json'));
  const evidence = path.resolve(process.env[evidenceEnv] || path.join(process.env.RUNNER_TEMP, name));
  fs.mkdirSync(evidence, { recursive: true });
  const summary = { status: 'running', syntheticOnly: true, actualSources: bundle.inputs, results: [], limits: [
    'New frontend bundle with synthetic service responses, not hosted Auth/PostgREST/Realtime proof.',
    'An already-running old bundle is not retroactively repaired and may fail closed after raw-column revocation.',
    'Chromium mobile viewport emulation, not physical mobile hardware.', ...limits,
  ] };
  const report = () => fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(summary, null, 2));
  report();
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://synthetic.invalid').pathname;
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (pathname === '/fixture.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(bundle.javascript); return; }
    if (pathname === '/fixture.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(bundle.css); return; }
    if (pathname !== '/fixture/') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'" });
    res.end(`<!doctype html><html lang="zh-Hant" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic protected reads</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{margin:0;width:100%;min-height:100%;height:100%}.pcb-synthetic-host{height:100%;display:flex;flex-direction:column;min-width:0}.pcb-synthetic-notice{font:12px system-ui;padding:4px 8px;margin:0;flex:none;overflow-wrap:anywhere}.pcb-synthetic-host>.pcb-designer-workspace{flex:1;min-height:0}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await qa('playwright').chromium.launch();
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      for (const scenario of scenarios) {
        const result = { name: scenario.name, viewport, status: 'running' };
        summary.results.push(result); report();
        const context = await browser.newContext({ viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390,
          reducedMotion: 'reduce', serviceWorkers: 'block' });
        const requests = [], forbidden = [], errors = [], consoleErrors = [];
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin === origin && req.method() === 'GET' && ['/fixture/', '/fixture.js', '/fixture.css'].includes(url.pathname)) {
            requests.push(url.pathname); return route.continue();
          }
          forbidden.push(`${req.method()} ${req.url()}`); return route.abort();
        });
        await context.addInitScript(() => {
          window.protectedReadViolations = [];
          window.protectedReadDocumentIdentity = crypto.randomUUID();
          const deny = name => (...args) => { protectedReadViolations.push({ name, args: args.map(String) }); throw new Error(`Forbidden real side effect: ${name}`); };
          window.fetch = deny('fetch');
          for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) window[name] = deny(name);
          navigator.sendBeacon = deny('sendBeacon');
          indexedDB.open = deny('indexedDB.open'); indexedDB.deleteDatabase = deny('indexedDB.deleteDatabase');
          for (const method of ['setItem', 'removeItem', 'clear']) Storage.prototype[method] = deny(`Storage.${method}`);
        });
        const page = await context.newPage(); page.setDefaultTimeout(8000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', event => { if (event.type() === 'error') consoleErrors.push(event.text()); });
        let documentLoads = 0;
        page.on('domcontentloaded', () => { documentLoads++; });
        await page.clock.install();
        const screenshot = suffix => page.screenshot({ path: path.join(evidence, `${viewport.width}-${scenario.name}-${suffix}.png`), fullPage: false });
        try {
          await page.goto(`${origin}/fixture/?${new URLSearchParams(scenario.query || {})}`, { waitUntil: 'load' });
          const originalDocument = await page.evaluateHandle(() => document);
          const identity = await page.evaluate(() => protectedReadDocumentIdentity);
          await scenario.run({ page, viewport, screenshot });
          result.safety = await page.evaluate(() => ({ violations: protectedReadViolations, documentIdentity: protectedReadDocumentIdentity,
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
          result.safety.documentLoads = documentLoads;
          result.safety.documentRequests = requests.filter(value => value === '/fixture/').length;
          result.safety.originalDocumentRetained = await page.evaluate(original => document === original, originalDocument);
          await originalDocument.dispose();
          assert.deepEqual(result.safety.violations, []);
          assert.equal(result.safety.width, viewport.width); assert.ok(result.safety.scrollWidth <= viewport.width, 'No document overflow');
          assert.equal(result.safety.documentLoads, 1); assert.equal(result.safety.documentRequests, 1);
          assert.equal(result.safety.originalDocumentRetained, true); assert.equal(result.safety.documentIdentity, identity);
          assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
          result.contract = await inspect(page);
          // Expected injected denial errors remain recorded; all others fail.
          result.expectedConsoleErrors = consoleErrors;
          for (const error of consoleErrors) assert.ok((scenario.expectedConsoleErrors || []).some(pattern => pattern.test(error)), `Unexpected browser console error: ${error}`);
          await screenshot('passed'); result.status = 'passed';
        } catch (error) {
          result.status = 'failed'; result.error = error.stack;
          result.debug = await page.evaluate(() => ({ body: document.body.innerText,
            pcb: window.pcbRecoveryFixture && { state: pcbRecoveryFixture.state, calls: pcbRecoveryFixture.calls },
            profile: window.sanitizedProfilesFixture && { state: sanitizedProfilesFixture.state, calls: sanitizedProfilesFixture.calls, toasts: sanitizedProfilesFixture.toasts },
            violations: protectedReadViolations })).catch(() => null);
          result.browserErrors = errors; result.consoleErrors = consoleErrors; result.forbiddenRequests = forbidden;
          // Collect independent case failures in fresh contexts, then fail the
          // entire suite. One bad case must not hide later desktop/mobile evidence.
          await screenshot('failure').catch(() => {});
        } finally { report(); await context.close(); }
      }
    }
    assertCompletedBrowserCases(summary.results, scenarios.length * 2);
    summary.status = 'passed';
    console.log(JSON.stringify({ status: 'passed', scenarios: summary.results.length, evidence, syntheticOnly: true }));
  } catch (error) { summary.status = 'failed'; throw error; }
  finally { report(); if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { runProtectedReadBrowser, assertCompletedBrowserCases };
