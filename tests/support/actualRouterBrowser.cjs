// Real Chromium and actual AuthenticatedApplication/PreparedRoutes. Only page
// import destinations and service providers are aliases; routing code is never
// rewritten. All imported page bytes are synthetic, served only on loopback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const draftBytes = '未儲存的合成草稿\nDo not reload, clear, or claim this was saved.\n{"partial":\tα 🧪';
const providers = new Map([
  ['@/components/test-projects/TestProjectProvider', 'TestProjectProvider'],
  ['@/hooks/useUnifiedData', 'UnifiedDataProvider'],
  ['@/hooks/useUserPresence', 'UserPresenceProvider'],
  ['@/hooks/usePermissions', 'PermissionsProvider'],
]);
const pages = new Map([
  ['@/pages/Index', 'Index'], ['@/pages/NotFound', 'NotFound'],
  ['@/pages/TestTrackerPage', 'TestTrackerPage'],
  ['@/components/api-management/ApiManagementPage', 'ApiManagementPage'],
]);

async function buildActualRouterFixture() {
  const source = fs.readFileSync(path.join(root, 'src/components/auth/AuthenticatedApplication.tsx'), 'utf8');
  assert.match(source, /<HashRouter\s+useTransitions=\{false\}>/, 'The actual application explicitly preserves pre-migration update timing');
  const result = await require('esbuild').build({
    absWorkingDir: root, entryPoints: ['tests/support/actualRouterBrowser.fixture.jsx'],
    bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'isolated-router-boundaries', setup(build) {
      build.onResolve({ filter: /^@\// }, args => {
        if (pages.has(args.path)) return { path: '/router-pages/' + pages.get(args.path) + '.js', external: true };
        if (providers.has(args.path)) return { path: args.path, namespace: 'inert-provider' };
        return build.resolve(path.join(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind });
      });
      build.onLoad({ filter: /.*/, namespace: 'inert-provider' }, args => ({ loader: 'js', contents: `
        export function ${providers.get(args.path)}({children}) { return children; }
        export function usePermissions() { return { loading: false,
          canViewModule: name => { window.actualRouterFixture.permissions.push(name); return true; },
          canEditModule: () => true }; }
      ` }));
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs);
  for (const file of [
    'src/components/auth/AuthenticatedApplication.tsx', 'src/components/layout/PermissionGuard.tsx',
    'src/components/common/recoverableLazy.tsx', 'src/components/common/ModuleLoadRecovery.tsx',
    'src/hooks/useModuleNavigation.ts', 'src/lib/workspaceHistory.ts',
  ]) assert.ok(inputs.includes(file), 'The real runtime source is bundled: ' + file);
  assert.ok(inputs.some(file => /node_modules\/react-router\//.test(file)), 'The installed React Router is bundled');
  assert.ok(!inputs.some(file => /supabase|src\/pages\//.test(file)), 'No real page data or service client is bundled');
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  assert.deepEqual(imports.map(item => [item.path, item.kind, item.external]).sort(),
    [...pages.values()].map(name => ['/router-pages/' + name + '.js', 'dynamic-import', true]).sort(),
    'All four actual lazy boundaries remain genuine browser dynamic imports');
  const { default: postcssConfig } = await import(pathToFileURL(path.join(root, 'postcss.config.js')).href);
  const css = await require('postcss')(postcssConfig.plugins).process(fs.readFileSync(path.join(root, 'src/index.css'), 'utf8'), { from: path.join(root, 'src/index.css') });
  assert.ok(css.css.includes('--background'), 'The actual app stylesheet is compiled with its normal PostCSS plugins');
  return { javascript: result.outputFiles[0].text, css: css.css };
}

async function runActualRouterBrowser(browser, bundle, evidenceDirectory) {
  const reports = [];
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    async function scenario(name, body, options = {}) {
      const requests = [], forbiddenRequests = [], errors = [], held = new Map();
      const modes = options.modes || {};
      const moduleBody = name => 'const Page = window.actualRouterFixture.makePage(' + JSON.stringify(name) + '); export default Page; export { Page as ApiManagementPage };';
      const respond = (response, name, fail = false) => {
        response.writeHead(fail ? 404 : 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        response.end(fail ? 'Synthetic page is unavailable in this release' : moduleBody(name));
      };
      const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://fixture.invalid').pathname;
        requests.push({ pathname, method: request.method });
        if (request.method !== 'GET') { forbiddenRequests.push(request.method + ' ' + pathname); response.writeHead(405).end(); return; }
        if (pathname === '/actual-router.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bundle.javascript); return; }
        if (pathname === '/actual-index.css') { response.writeHead(200, { 'Content-Type': 'text/css' }); response.end(bundle.css); return; }
        const match = pathname.match(/^\/router-pages\/(Index|NotFound|TestTrackerPage|ApiManagementPage)\.js$/);
        if (match) {
          const pageName = match[1];
          if (modes[pageName] === 'defer') { held.set(pageName, response); return; }
          respond(response, pageName, modes[pageName] === 'fail'); return;
        }
        if (pathname !== '/station-status-hub/') { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        // The app gives body/root width:100%; outside margins enlarge the mobile
        // viewport. Keep fixture spacing inside the body's border box instead.
        response.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated actual Router</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/actual-index.css"><style>body{font:16px system-ui;margin:0;padding:16px;box-sizing:border-box}button{min-height:44px;margin:4px}textarea{display:block;min-height:120px;width:95%}output{display:block;overflow-wrap:anywhere}svg{width:20px}</style><div id="root"></div><script src="/actual-router.js"></script>');
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const origin = 'http://127.0.0.1:' + server.address().port;
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        const allowedPath = url.pathname === '/station-status-hub/' || url.pathname === '/actual-router.js' || url.pathname === '/actual-index.css' || /^\/router-pages\/(Index|NotFound|TestTrackerPage|ApiManagementPage)\.js$/.test(url.pathname);
        if (url.origin === origin && request.method() === 'GET' && allowedPath) return route.continue();
        forbiddenRequests.push(request.method() + ' ' + request.url());
        return route.abort();
      });
      await context.addInitScript(({ watchWorkspace }) => {
        window.fixtureWatchWorkspace = watchWorkspace;
        window.fixtureDocumentIdentity = 'single synthetic document';
        localStorage.setItem('synthetic-partial', '{"partial":');
        localStorage.setItem('synthetic-plain', '未儲存\t\u0000🧪');
        sessionStorage.setItem('synthetic-session', 'fixture-only');
        window.fixtureStorageSnapshot = { local: { ...localStorage }, session: { ...sessionStorage } };
        window.fixtureStorageWrites = [];
        for (const method of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) {
            window.fixtureStorageWrites.push({ method, args });
            return original.apply(this, args);
          };
        }
        window.fixtureNetworkCalls = [];
        const deny = (name, args) => { window.fixtureNetworkCalls.push({ name, args: Array.from(args, String) }); throw new Error('No service or persistence access in the router fixture: ' + name); };
        window.fetch = function (...args) { return deny('fetch', args); };
        for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) window[name] = function (...args) { return deny(name, args); };
        navigator.sendBeacon = function (...args) { return deny('sendBeacon', args); };
        indexedDB.open = function (...args) { return deny('indexedDB.open', args); };
        indexedDB.deleteDatabase = function (...args) { return deny('indexedDB.deleteDatabase', args); };
      }, { watchWorkspace: !!options.watchWorkspace });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.on('pageerror', error => errors.push(error.message));
      const draft = page.getByLabel('Actual route synthetic draft');
      const recovery = page.locator('[data-module-load-recovery="true"]');
      const current = async (pageName, route) => {
        await page.locator('main[data-page="' + pageName + '"]').waitFor();
        await page.waitForFunction(expected => window.actualRouterFixture?.current?.name === expected, pageName);
        if (route) await page.waitForFunction(expected => document.querySelector('[data-testid="actual-route"]')?.textContent === expected, route);
      };
      const waitHeld = async pageName => {
        for (let count = 0; count < 300 && !held.has(pageName); count++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(held.has(pageName), 'A genuine delayed import request was received: ' + pageName);
      };
      const release = (pageName, fail = false) => { assert.ok(held.has(pageName)); respond(held.get(pageName), pageName, fail); held.delete(pageName); };
      const rememberDraft = async () => {
        await draft.fill(draftBytes);
        await page.waitForFunction(expected => actualRouterFixture.current.draft === expected, draftBytes);
        await page.evaluate(() => { window.originalDraftNode = document.querySelector('textarea'); });
      };
      const preservedDraft = async (expected = draftBytes) => {
        assert.equal(await draft.inputValue(), expected);
        assert.deepEqual(await draft.evaluate(element => Array.from(new TextEncoder().encode(element.value))), Array.from(Buffer.from(expected)), 'Exact original UTF-8 draft bytes survive');
        assert.equal(await page.evaluate(() => document.querySelector('textarea') === window.originalDraftNode), true, 'The original editor DOM node was never replaced');
        assert.equal(await page.evaluate(() => actualRouterFixture.unmounts.Index || 0), 0);
      };
      try {
        await page.goto(origin + '/station-status-hub/' + (options.suffix || '?workspace=pcb-designer&project=A#/?filter=initial'));
        await current(options.initialPage || 'Index');
        assert.equal(await page.evaluate(() => innerWidth), viewport.width);
        const initialUrl = page.url();
        await body({ page, draft, recovery, current, waitHeld, release, rememberDraft, preservedDraft, initialUrl, requests });
        const actualWidths = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }));
        assert.equal(actualWidths.innerWidth, viewport.width, 'The completed interaction still has the requested CSS viewport');
        assert.ok(actualWidths.documentScrollWidth <= viewport.width, `Document content width ${actualWidths.documentScrollWidth} exceeds viewport ${viewport.width}`);
        assert.ok(actualWidths.bodyScrollWidth <= viewport.width, `Body content width ${actualWidths.bodyScrollWidth} exceeds viewport ${viewport.width}`);
        const safety = await page.evaluate(() => ({
          writes: fixtureStorageWrites, network: fixtureNetworkCalls,
          before: fixtureStorageSnapshot, after: { local: { ...localStorage }, session: { ...sessionStorage } },
          navigations: performance.getEntriesByType('navigation').length, identity: fixtureDocumentIdentity,
        }));
        assert.deepEqual(safety.writes, [], 'No persisted storage was written, cleared or removed');
        assert.deepEqual(safety.network, [], 'No service, telemetry, database or websocket API was called');
        assert.deepEqual(safety.after, safety.before, 'Original partial and non-JSON storage bytes remain unchanged');
        assert.equal(safety.navigations, 1);
        assert.equal(requests.filter(request => request.pathname === '/station-status-hub/').length, 1, 'Exactly one document request: hash history never reloads the page');
        assert.equal(safety.identity, 'single synthetic document');
        assert.deepEqual(forbiddenRequests, [], 'Only allowlisted loopback GET requests are permitted');
        assert.deepEqual(errors, [], 'No unhandled browser or React errors');
        if (evidenceDirectory) {
          fs.mkdirSync(evidenceDirectory, { recursive: true });
          await page.screenshot({ path: path.join(evidenceDirectory, `${viewport.width}-actual-router-${name}.png`), fullPage: true });
        }
        reports.push({ width: viewport.width, actualWidths, scenario: name, actualPreparedRoutes: true, realDynamicImports: true, noReload: true, noStorageWrites: true, noServiceAccess: true });
      } catch (error) {
        console.error(JSON.stringify({ actualRouterScenario: name, width: viewport.width, error: error.message, requests, forbiddenRequests, errors,
          state: await page.evaluate(() => ({ url: location.href, fixture: window.actualRouterFixture, body: document.body.innerText })).catch(() => null) }));
        if (evidenceDirectory) {
          fs.mkdirSync(evidenceDirectory, { recursive: true });
          await page.screenshot({ path: path.join(evidenceDirectory, `${viewport.width}-actual-router-${name}-failure.png`), fullPage: true }).catch(() => {});
        }
        throw error;
      } finally {
        for (const response of held.values()) response.destroy();
        await context.close();
        await new Promise(resolve => server.close(resolve));
      }
    }

    for (const [initialPage, route] of [['Index', '/'], ['TestTrackerPage', '/test-tracker'], ['ApiManagementPage', '/api-management']]) {
      await scenario('deep-link-' + initialPage, async ({ page, current, draft }) => {
        await current(initialPage, route + '?filter=initial#section');
        const outerQuery = await page.evaluate(() => location.search), length = await page.evaluate(() => history.length);
        await draft.fill(draftBytes);
        await page.getByRole('button', { name: 'Change query filter', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="query-filter"]')?.textContent === '中文 & /\\ value');
        assert.equal(await page.evaluate(() => location.search), outerQuery);
        assert.equal(await page.evaluate(() => location.pathname), '/station-status-hub/');
        assert.equal(await page.evaluate(() => history.length), length + 1);
        assert.equal(await draft.inputValue(), draftBytes);
        assert.equal(await page.evaluate(name => actualRouterFixture.mounts[name], initialPage), 1);
        assert.equal(await page.evaluate(() => actualRouterFixture.guards.length), 0, 'Same-route query updates do not prompt or remount');
        if (initialPage !== 'Index') assert.ok(await page.evaluate(() => actualRouterFixture.permissions.length > 0), 'Actual PermissionGuard ran');
      }, { initialPage, suffix: '?workspace=pcb-designer&project=A#' + route + '?filter=initial#section' });
    }

    await scenario('slow-latest-dirty-veto', async ({ page, current, waitHeld, release, rememberDraft, preservedDraft, initialUrl }) => {
      await page.evaluate(() => { actualRouterFixture.allowLeave = false; });
      await page.getByRole('button', { name: 'Tracker route', exact: true }).click();
      await waitHeld('TestTrackerPage');
      await page.getByRole('status').filter({ hasText: '目前畫面仍可操作' }).waitFor();
      await current('Index', '/?filter=initial');
      assert.equal(await page.evaluate(() => actualRouterFixture.guards.length), 0, 'No stale pre-import dirty approval');
      await rememberDraft(); // Real typing while the real HTTP import remains pending.
      release('TestTrackerPage');
      await page.waitForURL(initialUrl);
      await page.waitForFunction(() => actualRouterFixture.guards.length === 1);
      await preservedDraft();
      assert.deepEqual(await page.evaluate(() => actualRouterFixture.guards), [{ name: 'Index', draft: draftBytes }]);
      assert.equal(await page.evaluate(() => actualRouterFixture.mounts.TestTrackerPage || 0), 0);
    }, { modes: { TestTrackerPage: 'defer' } });

    await scenario('missing-retry-cancel-restores-route', async ({ page, recovery, rememberDraft, preservedDraft, initialUrl, requests }) => {
      await rememberDraft();
      await page.getByRole('button', { name: 'API route', exact: true }).click();
      await recovery.waitFor(); await preservedDraft();
      for (let attempt = 0; attempt < 2; attempt++) {
        await recovery.getByRole('button', { name: '重試載入此功能', exact: true }).click();
        // Let React commit the retry before checking its result, rather than
        // accidentally matching the previous alert before it is replaced.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))));
        await recovery.waitFor(); await preservedDraft();
      }
      assert.ok(requests.some(request => request.pathname === '/router-pages/ApiManagementPage.js'), 'Failure comes from a genuine missing module response');
      assert.equal(await page.evaluate(() => actualRouterFixture.guards.length), 0, 'Failed imports never attempt to leave the editor');
      await recovery.getByRole('button', { name: '留在目前畫面', exact: true }).click();
      await recovery.waitFor({ state: 'hidden' }); await page.waitForURL(initialUrl);
      await preservedDraft();
    }, { modes: { ApiManagementPage: 'fail' }, suffix: '?workspace=pcb-designer&project=A#/?filter=initial#section' });

    for (const staleFails of [false, true]) await scenario('stale-import-' + (staleFails ? 'failure' : 'success'), async ({ page, draft, current, waitHeld, release, recovery }) => {
      await page.getByRole('button', { name: 'Tracker route', exact: true }).click();
      await waitHeld('TestTrackerPage');
      await page.getByRole('button', { name: 'API route', exact: true }).click();
      await current('ApiManagementPage', '/api-management?filter=newest');
      await draft.fill(draftBytes);
      const response = page.waitForResponse(response => response.url().endsWith('/router-pages/TestTrackerPage.js'));
      release('TestTrackerPage', staleFails); await response;
      if (!staleFails) await page.waitForFunction(() => actualRouterFixture.loadedModules.includes('TestTrackerPage'));
      // Drain browser tasks after network completion, including rejected import jobs.
      await page.waitForTimeout(100);
      await current('ApiManagementPage', '/api-management?filter=newest');
      assert.equal(await draft.inputValue(), draftBytes);
      assert.equal(await recovery.count(), 0, 'An obsolete import cannot open a retry panel over the newer route');
      assert.equal(await page.evaluate(() => actualRouterFixture.mounts.TestTrackerPage || 0), 0);
      assert.equal(await page.evaluate(() => actualRouterFixture.unmounts.Index), 1);
    }, { modes: { TestTrackerPage: 'defer' } });

    await scenario('back-cancels-pending-import', async ({ page, current, waitHeld, release, rememberDraft, preservedDraft, initialUrl }) => {
      await rememberDraft();
      await page.getByRole('button', { name: 'Tracker route', exact: true }).click();
      await waitHeld('TestTrackerPage');
      await page.evaluate(() => history.back()); await page.waitForURL(initialUrl);
      await page.getByRole('status').filter({ hasText: '目前畫面仍可操作' }).waitFor({ state: 'hidden' });
      release('TestTrackerPage');
      await page.waitForFunction(() => actualRouterFixture.loadedModules.includes('TestTrackerPage'));
      await page.waitForTimeout(100);
      await current('Index', '/?filter=initial'); await preservedDraft();
      assert.equal(await page.evaluate(() => actualRouterFixture.mounts.TestTrackerPage || 0), 0);
    }, { modes: { TestTrackerPage: 'defer' } });

    await scenario('push-replace-back-forward-native', async ({ page, current, rememberDraft }) => {
      const length = await page.evaluate(() => history.length);
      await page.getByRole('button', { name: 'Tracker route', exact: true }).click(); await current('TestTrackerPage', '/test-tracker?filter=one');
      await page.getByRole('button', { name: 'Replace tracker filter', exact: true }).click(); await current('TestTrackerPage', '/test-tracker?filter=two');
      assert.equal(await page.evaluate(() => history.length), length + 1);
      assert.equal(await page.evaluate(() => actualRouterFixture.mounts.TestTrackerPage), 1);
      await page.getByRole('button', { name: 'API route', exact: true }).click(); await current('ApiManagementPage', '/api-management?filter=newest');
      assert.equal(await page.evaluate(() => history.length), length + 2);
      for (const [direction, name, route] of [
        ['back', 'TestTrackerPage', '/test-tracker?filter=two'], ['back', 'Index', '/?filter=initial'],
        ['forward', 'TestTrackerPage', '/test-tracker?filter=two'], ['forward', 'ApiManagementPage', '/api-management?filter=newest'],
      ]) { await page.evaluate(direction => history[direction](), direction); await current(name, route); }
      await page.evaluate(() => { location.hash = '#/native-unmatched?filter=native'; }); await current('NotFound', '/native-unmatched?filter=native');
      await page.evaluate(() => history.back()); await current('ApiManagementPage', '/api-management?filter=newest');
      await page.evaluate(() => history.back()); await current('TestTrackerPage', '/test-tracker?filter=two');
      await page.evaluate(() => history.back()); await current('Index', '/?filter=initial');
      // The accepted remount is now the editor whose identity must survive a veto.
      const unmountsBefore = await page.evaluate(() => actualRouterFixture.unmounts.Index || 0);
      await rememberDraft();
      const previous = page.url(), guardCount = await page.evaluate(() => actualRouterFixture.guards.length);
      await page.evaluate(() => { actualRouterFixture.allowLeave = false; location.hash = '#/api-management?filter=rejected'; });
      await page.waitForFunction(before => actualRouterFixture.guards.length === before + 1, guardCount);
      await page.waitForURL(previous); await current('Index', '/?filter=initial');
      assert.equal(await page.evaluate(() => actualRouterFixture.unmounts.Index || 0), unmountsBefore);
      assert.equal(await page.evaluate(() => document.querySelector('textarea') === originalDraftNode), true);
      assert.equal(await page.getByLabel('Actual route synthetic draft').inputValue(), draftBytes);
      assert.equal(await page.evaluate(() => location.search), '?workspace=pcb-designer&project=A');
    });

    await scenario('workspace-popstate-final-guard', async ({ page, recovery, current, rememberDraft, preservedDraft }) => {
      await page.evaluate(() => {
        actualRouterFixture.workspacePush('?workspace=first&project=B#/?filter=initial');
        actualRouterFixture.workspacePush('?workspace=current&project=A#/?filter=initial');
        actualRouterFixture.historyMode = 'defer'; actualRouterFixture.allowLeave = false;
        history.back();
      });
      await page.waitForFunction(() => actualRouterFixture.historyWaits.length === 1 && location.search === '?workspace=current&project=A');
      assert.equal(await page.evaluate(() => actualRouterFixture.observedPopstate.length), 0);
      assert.equal(await page.evaluate(() => actualRouterFixture.guards.length), 0);
      await rememberDraft();
      await page.evaluate(() => actualRouterFixture.historyWaits[0].reject(new Error('Synthetic historical import missing')));
      await recovery.waitFor(); await preservedDraft();
      await recovery.getByRole('button', { name: '重試載入此功能', exact: true }).click();
      await page.waitForFunction(() => actualRouterFixture.historyWaits.length === 2 && location.search === '?workspace=current&project=A');
      await page.evaluate(() => actualRouterFixture.historyWaits[1].resolve());
      await page.waitForFunction(() => actualRouterFixture.guards.length === 1 && location.search === '?workspace=current&project=A');
      await preservedDraft();
      assert.deepEqual(await page.evaluate(() => actualRouterFixture.observedPopstate), []);
      assert.deepEqual(await page.evaluate(() => actualRouterFixture.acceptedWorkspace), []);
      assert.deepEqual(await page.evaluate(() => actualRouterFixture.guards), [{ name: 'Index', draft: draftBytes }]);
      await page.evaluate(() => { actualRouterFixture.allowLeave = true; actualRouterFixture.historyMode = 'resolve'; });
      await recovery.getByRole('button', { name: '重試載入此功能', exact: true }).click();
      await page.waitForFunction(() => actualRouterFixture.acceptedWorkspace.length === 1 && actualRouterFixture.current.outerSearch === '?workspace=first&project=B');
      await current('Index', '/?filter=initial'); await preservedDraft();
      assert.equal(await page.evaluate(() => actualRouterFixture.observedPopstate.length), 1, 'The real Router sees only the accepted replay');
      assert.equal(await page.evaluate(() => actualRouterFixture.guards.length), 2, 'Exactly one latest-state guard per commit attempt');
      await page.evaluate(() => history.forward());
      await page.waitForFunction(() => actualRouterFixture.current.outerSearch === '?workspace=current&project=A');
      await preservedDraft();
    }, { watchWorkspace: true });
  }
  return reports;
}
module.exports = { buildActualRouterFixture, runActualRouterBrowser };
