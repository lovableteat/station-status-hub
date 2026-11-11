// Real Chromium, local synthetic releases only. Never serves production artifacts.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));

(async () => {
  const { assembleSafeAssetRetention, inventoryDigest, sha256 } = await import('../scripts/plan-safe-asset-retention.mjs');
  const safePath = 'assets/safe-feature-aaaaaaaa.js';
  const seedPath = 'assets/materialRequestSeed-bbbbbbbb.js';
  const oldImporter = 'assets/MaterialRequestPage-cccccccc.js';
  const bytes = new Map([
    [safePath, Buffer.from('export default function SafeFeature(){return "Retained synthetic feature v1"}')],
    [seedPath, Buffer.from('export default {records:[{id:"SYNTHETIC-DO-NOT-RETAIN"}]}')],
    [oldImporter, Buffer.from('export default function LegacyImporter(){return "Excluded synthetic importer"}')],
  ]);
  const release = 'a'.repeat(40);
  const manifest = { schemaVersion: 1, release, artifactSha256: sha256(Buffer.from('Synthetic artifact envelope, not a production ZIP')), base: '/station-status-hub/', builtAt: '2026-11-11T12:00:00Z', files: [...bytes].map(([file, data]) => ({ path: file, sha256: sha256(data), bytes: data.length, kind: 'js', modules: [file === seedPath ? 'src/data/materialRequestSeed.json' : file === oldImporter ? 'src/components/material-requests/MaterialRequestPage.tsx' : 'tests/fixtures/SafeFeature.tsx'], required: [], optional: [], externalModules: [] })) };
  const safeFile = manifest.files.find(file => file.path === safePath);
  const review = { schemaVersion: 1, release, inventorySha256: inventoryDigest(manifest), provenance: 'verified-build-output', evidence: 'Synthetic bytes created in this test, no production review claimed', reviewedAt: '2026-11-11T12:01:00Z', expiresAt: '2026-11-12T12:00:00Z', approvedFiles: [{ path: safePath, sha256: safeFile.sha256, publicContent: true, currentSecurityContract: true, completeDependencies: true, evidence: 'Single pure synthetic component, no dependencies or data' }], routes: [{ label: 'synthetic safe feature', roots: [safePath] }], allowedMissingOptional: [] };
  const retained = assembleSafeAssetRetention({ base: manifest.base, now: '2026-11-11T13:00:00Z', currentFiles: new Map(), snapshots: [{ manifest, review, files: bytes }], revokedSha256: [] });
  assert.equal(retained.files.has(seedPath), false);
  assert.equal(retained.files.has(oldImporter), false);
  assert.deepEqual([...retained.files.keys()], [safePath]);

  const bundle = await require('esbuild').build({
    stdin: { contents: `
      import React, { useEffect, useState, Suspense } from 'react';
      import { createRoot } from 'react-dom/client';
      import { recoverableLazy } from './src/components/common/recoverableLazy';
      import { ModuleLoadRecovery } from './src/components/common/ModuleLoadRecovery';
      import { useModuleNavigation } from './src/hooks/useModuleNavigation';
      import { AppRuntimeBoundary } from './src/components/common/AppRuntimeBoundary';
      import { HashRouter, useLocation } from 'react-router-dom';
      import { pushWorkspaceHistory, watchWorkspaceHistory } from './src/lib/workspaceHistory';
      const MissingFeature = recoverableLazy(() => import('/assets/missing-feature-dddddddd.js'));
      const SafeFeature = recoverableLazy(() => import('/${safePath}'));
      window.fixtureEffects = { mounts: 0, unmounts: 0, commits: [], writes: [] };
      window.allowFixtureLeave = true;
      window.fixtureHistory = { mode: 'resolve', raw: [], accepted: [], failures: 0 };
      window.addEventListener('popstate', () => window.fixtureHistory.raw.push(location.href));
      window.addEventListener('workspace-before-navigate', event => { if (!window.allowFixtureLeave) event.preventDefault(); });
      function Fixture() {
        const [draft, setDraft] = useState('');
        const [showMissing, setShowMissing] = useState(false);
        const [view, setView] = useState('editor');
        const navigation = useModuleNavigation();
        const routerLocation = useLocation();
        const commit = value => { window.fixtureEffects.commits.push(value); setView(value); };
        useEffect(() => { window.fixtureEffects.mounts++; window.__STATION_APP_READY__ = true; window.dispatchEvent(new Event('station-app-ready')); return () => window.fixtureEffects.unmounts++; }, []);
        useEffect(() => {
          window.fixtureHistory.push = pushWorkspaceHistory;
          return watchWorkspaceHistory(() => window.fixtureHistory.accepted.push(location.href), () => window.fixtureHistory.mode === 'resolve' ? Promise.resolve() : new Promise((resolve, reject) => { window.fixtureHistory.resolve = resolve; window.fixtureHistory.reject = reject; }), () => { window.fixtureHistory.failures++; });
        }, []);
        return <main>
          <h1>Isolated deployment recovery</h1>
          <label>Unsaved synthetic draft<textarea aria-label="Unsaved synthetic draft" value={draft} onChange={event => setDraft(event.target.value)} /></label>
          <p data-testid="fixture-view">{view}</p>
          <output data-testid="router-path">{routerLocation.pathname}</output>
          <button onClick={() => setShowMissing(true)}>Open unavailable nested feature</button>
          <button onClick={() => setShowMissing(false)}>Close nested feature</button>
          <button onClick={() => navigation.navigate(MissingFeature.preload, () => commit('missing'))}>Navigate unavailable feature</button>
          <button onClick={() => navigation.navigate(SafeFeature.preload, () => commit('safe'))}>Navigate retained feature</button>
          <button onClick={() => navigation.navigate(() => new Promise(resolve => setTimeout(resolve, 350)), () => commit('slow'))}>Start slow navigation</button>
          <button onClick={() => navigation.navigate(() => Promise.resolve(), () => commit('latest'))}>Navigate latest choice</button>
          <button onClick={navigation.cancel}>Cancel navigation</button>
          {navigation.pending && <p role="status">Loading destination</p>}
          {navigation.retry && <ModuleLoadRecovery onRetry={navigation.retry} onCancel={navigation.cancel} />}
          <Suspense fallback={<p>Loading feature</p>}>
            {showMissing && <MissingFeature />}
            {view === 'safe' && <div data-testid="retained-feature"><SafeFeature /></div>}
          </Suspense>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<AppRuntimeBoundary><HashRouter><Fixture /></HashRouter></AppRuntimeBoundary>);
    `, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    external: ['/assets/*'], define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'source-alias', setup(build) { build.onResolve({ filter: /^@\// }, args => build.resolve(path.resolve('src', args.path.slice(2)), { resolveDir: process.cwd(), kind: args.kind })); } }],
  });
  if (process.env.AUDIT_BUILD_ONLY === '1') { console.log('PASS isolated deployment-recovery browser fixture bundle and retained-assets plan'); return; }
  const boot = fs.readFileSync('index.html', 'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(boot, 'Use the actual inline boot policy');
  let deployed = false;
  const requested = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fixture.invalid').pathname;
    requested.push(pathname);
    if (pathname === '/fixture-shell.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (pathname.startsWith('/assets/')) {
      const content = deployed ? retained.files.get(pathname.slice(1)) : bytes.get(pathname.slice(1));
      res.writeHead(content ? 200 : 404, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(content || 'Missing synthetic release asset'); return;
    }
    res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'no-store');
    res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic release ' + (deployed ? 'v2' : 'v1') + '</title><style>body{font:16px system-ui;margin:20px}button{min-height:44px;margin:4px}textarea{display:block;min-height:120px;width:90%}section{padding:12px;border:1px solid #888}svg{width:20px}</style><div id="root"></div><script>' + boot + '</script><script src="/fixture-shell.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const reports = [];
  try {
    browser = await qa('playwright').chromium.launch({ headless: true });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      deployed = false;
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); const errors = []; let navigations = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      try {
        await page.goto(origin); await page.getByRole('heading', { name: 'Isolated deployment recovery' }).waitFor();
        assert.equal(await page.evaluate(() => window.innerWidth), viewport.width, 'The CSS viewport matches the requested desktop or phone width');
        const draft = page.getByLabel('Unsaved synthetic draft');
        const value = '未儲存的合成草稿\nDo not reload, clear, or claim this was saved.';
        await draft.fill(value);
        const initialNavigations = navigations;
        const originalStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
        deployed = true; // The document stays open while the server changes releases.
        await page.evaluate(() => { const event = new Event('vite:preloadError', { cancelable: true }); event.payload = new Error('Failed to fetch dynamically imported module: synthetic-v1'); dispatchEvent(event); });
        await page.getByRole('button', { name: 'Open unavailable nested feature', exact: true }).click();
        const recovery = page.locator('[data-module-load-recovery="true"]'); await recovery.waitFor();
        assert.equal(await draft.inputValue(), value);
        await recovery.getByRole('button', { name: '重試載入此功能', exact: true }).click();
        await recovery.waitFor();
        assert.equal(await draft.inputValue(), value, 'Repeated missing imports retain the parent memory draft');
        page.once('dialog', dialog => dialog.dismiss());
        await recovery.getByRole('button', { name: '儲存後更新版本', exact: true }).click();
        await page.evaluate(() => { window.allowFixtureLeave = false; });
        page.once('dialog', dialog => dialog.accept());
        await recovery.getByRole('button', { name: '儲存後更新版本', exact: true }).click();
        await page.evaluate(() => { window.allowFixtureLeave = true; });
        await page.getByRole('button', { name: 'Close nested feature', exact: true }).click();
        await recovery.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Navigate unavailable feature', exact: true }).click();
        await recovery.waitFor(); assert.equal(await page.getByTestId('fixture-view').innerText(), 'editor');
        await recovery.getByRole('button', { name: '留在目前畫面', exact: true }).click();
        await recovery.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Start slow navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Navigate latest choice', exact: true }).click();
        await page.waitForTimeout(450);
        assert.equal(await page.getByTestId('fixture-view').innerText(), 'latest');
        await page.getByRole('button', { name: 'Start slow navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Cancel navigation', exact: true }).click();
        await page.waitForTimeout(450);
        assert.equal(await page.getByTestId('fixture-view').innerText(), 'latest');
        await page.getByRole('button', { name: 'Navigate retained feature', exact: true }).click();
        await page.getByTestId('retained-feature').waitFor();
        assert.equal(await page.getByTestId('retained-feature').innerText(), 'Retained synthetic feature v1', 'The retained module renders its own exact output');
        assert.equal(navigations, initialNavigations, 'Import failures and retry controls never navigate the document');
        // Existing raw listeners and the real HashRouter must wait for a destination import.
        await page.evaluate(() => { fixtureHistory.push('?workspace=first#/first'); fixtureHistory.push('?workspace=current#/current'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); });
        await page.getByTestId('router-path').filter({ hasText: '/current' }).waitFor();
        const historyBefore = await page.evaluate(() => ({ raw: fixtureHistory.raw.length, accepted: fixtureHistory.accepted.length }));
        await page.evaluate(() => { fixtureHistory.mode = 'defer'; history.back(); });
        await page.waitForFunction(() => typeof fixtureHistory.reject === 'function');
        await page.waitForFunction(() => new URL(location.href).searchParams.get('workspace') === 'current');
        assert.equal(await page.getByTestId('router-path').innerText(), '/current');
        assert.deepEqual(await page.evaluate(() => ({ raw: fixtureHistory.raw.length, accepted: fixtureHistory.accepted.length })), historyBefore);
        await page.evaluate(() => fixtureHistory.reject(new Error('Synthetic historical module unavailable')));
        await page.waitForFunction(() => new URL(location.href).searchParams.get('workspace') === 'current');
        await page.waitForFunction(() => fixtureHistory.failures === 1);
        assert.equal(await page.getByTestId('router-path').innerText(), '/current');
        assert.deepEqual(await page.evaluate(() => ({ raw: fixtureHistory.raw.length, accepted: fixtureHistory.accepted.length })), historyBefore, 'Rejected history and cursor restoration do not reach the old listeners');
        // A draft can become dirty while the target import is pending. Recheck at commit.
        await page.evaluate(() => { fixtureHistory.resolve = null; history.back(); });
        await page.waitForFunction(() => typeof fixtureHistory.resolve === 'function');
        await page.waitForFunction(() => new URL(location.href).searchParams.get('workspace') === 'current');
        await page.evaluate(() => { window.allowFixtureLeave = false; fixtureHistory.resolve(); });
        await page.waitForTimeout(150);
        await page.waitForFunction(() => new URL(location.href).searchParams.get('workspace') === 'current');
        assert.equal(await page.getByTestId('router-path').innerText(), '/current');
        assert.deepEqual(await page.evaluate(() => ({ raw: fixtureHistory.raw.length, accepted: fixtureHistory.accepted.length })), historyBefore, 'Drafts changed during loading veto the final commit');
        assert.equal(await draft.inputValue(), value);
        await page.evaluate(() => { window.allowFixtureLeave = true; fixtureHistory.mode = 'resolve'; history.back(); });
        await page.getByTestId('router-path').filter({ hasText: '/first' }).waitFor();
        assert.deepEqual(await page.evaluate(() => ({ raw: fixtureHistory.raw.length, accepted: fixtureHistory.accepted.length })), { raw: historyBefore.raw + 1, accepted: historyBefore.accepted + 1 }, 'Successful destination is replayed exactly once');
        await page.evaluate(() => { location.hash = '#/native-route'; });
        await page.getByTestId('router-path').filter({ hasText: '/native-route' }).waitFor();
        await page.evaluate(() => history.back());
        await page.getByTestId('router-path').filter({ hasText: '/first' }).waitFor();
        assert.equal(await draft.inputValue(), value);
        assert.equal(await page.title(), 'Synthetic release v1', 'The open document was not reloaded into the new release');
        assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
        assert.deepEqual(await page.evaluate(() => window.fixtureEffects), { mounts: 1, unmounts: 0, commits: ['latest', 'safe'], writes: [] });
        assert.deepEqual(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })), originalStorage, 'Recovery does not mutate persisted values');
        assert.equal((await context.request.get(origin + '/' + seedPath)).status(), 404);
        assert.equal((await context.request.get(origin + '/' + oldImporter)).status(), 404);
        assert.deepEqual(errors, []);
        if (process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR) {
          fs.mkdirSync(process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR, `${viewport.width}-retained-draft.png`), fullPage: true });
        }
        reports.push({ width: viewport.width, crossReleaseSafeChunk: true, missingChunkPreservesMemoryDraft: true, noReload: true, noStorageWrites: true, seedAndOldImporterAbsent: true, latestNavigationWins: true, cancellationPreservesState: true, historyAndRouterWaitForPreload: true });
      } catch (error) {
        console.error(JSON.stringify({ width: viewport.width, error: error.message, pageErrors: errors, body: (await page.locator('body').innerText()).slice(0, 12000), state: await page.evaluate(() => ({ effects: window.fixtureEffects, history: window.fixtureHistory, url: location.href })) }));
        if (process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR) {
          fs.mkdirSync(process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR, `${viewport.width}-failure.png`), fullPage: true });
        }
        throw error;
      } finally { await context.close(); }
    }
    assert.ok(requested.includes('/' + safePath), 'The old safe chunk was fetched after release replacement');
    if (process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.AUDIT_DEPLOYMENT_EVIDENCE_DIR, 'results.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ scope: 'synthetic local release switch, actual recovery components and navigation hook; not proof about previously opened production tabs', reports }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
