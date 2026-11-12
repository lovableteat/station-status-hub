// CI-only real Chromium regression. No live account, endpoint or PCB payload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { buildPcbRecoveryFixture } = require('./support/pcbRecoveryBrowser.cjs');

(async () => {
  const bundle = await buildPcbRecoveryFixture();
  if (process.env.PCB_RECOVERY_BUILD_ONLY === '1') {
    console.log(JSON.stringify({ status: 'build-only-passed', browserExecuted: false, actualSources: bundle.inputs, bytes: bundle.javascript.length }));
    return;
  }
  // Deliberately do not support local Chromium execution for this repair.
  // Keep local bundle validation separate from the authorized PR browser run.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Browser execution is restricted to the authorized GitHub PR CI runner; use PCB_RECOVERY_BUILD_ONLY=1 locally');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request', 'Run the synthetic browser regression only on the authorized pull_request workflow');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR, 'package.json'));
  const evidence = path.resolve(process.env.PCB_RECOVERY_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP, 'pcb-session-recovery'));
  fs.mkdirSync(evidence, { recursive: true });
  const summary = { status: 'running', syntheticOnly: true, actualSources: bundle.inputs, results: [], limits: [
    'Synthetic Auth/RPC transport and storage, not hosted PostgREST/Auth or production PCB data.',
    'Desktop Chromium and mobile viewport emulation, not physical-device verification.',
    'CAD/STEP/3D and presence transport are excluded; actual 2D workspace, toolbar, dialogs, access adapter and persistence/lock hooks are exercised.',
  ] };
  const report = () => fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(summary, null, 2));
  report();
  const serverRequests = [], blocked = [];
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://synthetic.invalid').pathname;
    serverRequests.push({ method: request.method, pathname });
    if (request.method !== 'GET') { blocked.push(`${request.method} ${pathname}`); response.writeHead(405).end(); return; }
    if (pathname === '/pcb-fixture.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bundle.javascript); return; }
    if (pathname === '/pcb-fixture.css') { response.writeHead(200, { 'Content-Type': 'text/css' }); response.end(bundle.css); return; }
    if (pathname !== '/pcb-recovery/') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'" });
    response.end('<!doctype html><html lang="zh-Hant" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic PCB recovery</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/pcb-fixture.css"><style>html,body,#root{margin:0;width:100%;height:100%}.pcb-synthetic-host{height:100%;display:flex;flex-direction:column;min-width:0}.pcb-synthetic-notice{font:12px system-ui;padding:4px 8px;margin:0;flex:none;overflow-wrap:anywhere}.pcb-synthetic-host>.pcb-designer-workspace{flex:1;min-height:0}</style></head><body><div id="root"></div><script src="/pcb-fixture.js"></script></body></html>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await qa('playwright').chromium.launch();

    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      async function scenario(name, body, initial = 'healthy') {
        const result = { name, viewport, status: 'running' };
        summary.results.push(result); report();
        const context = await browser.newContext({ viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390,
          reducedMotion: 'reduce', serviceWorkers: 'block' });
        const requests = [], forbidden = [], errors = [];
        await context.route('**/*', route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === origin && request.method() === 'GET' && ['/pcb-recovery/', '/pcb-fixture.js', '/pcb-fixture.css'].includes(url.pathname)) {
            requests.push(url.pathname); return route.continue();
          }
          forbidden.push(`${request.method()} ${request.url()}`); return route.abort();
        });
        await context.addInitScript(() => {
          window.pcbBoundaryViolations = [];
          window.pcbDocumentIdentity = crypto.randomUUID();
          const deny = name => (...args) => {
            window.pcbBoundaryViolations.push({ name, args: args.map(String) });
            throw new Error(`Fixture blocked real side effect: ${name}`);
          };
          window.fetch = deny('fetch');
          for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) window[name] = deny(name);
          navigator.sendBeacon = deny('sendBeacon');
          indexedDB.open = deny('indexedDB.open');
          indexedDB.deleteDatabase = deny('indexedDB.deleteDatabase');
          for (const method of ['setItem', 'removeItem', 'clear']) Storage.prototype[method] = deny(`Storage.${method}`);
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => errors.push(error.message));
        let documentLoads = 0;
        page.on('domcontentloaded', () => { documentLoads++; });
        await page.clock.install();
        const state = () => page.evaluate(() => pcbRecoveryFixture.state);
        const saved = async (label = 'draft') => {
          const value = await page.evaluate(() => ({ state: pcbRecoveryFixture.state, storage: pcbRecoveryFixture.storageSnapshot() }));
          assert.equal(value.state.hasUnsavedChanges, true, `${label}: remains dirty`);
          assert.notEqual(value.state.persistenceStatus, 'synced', `${label}: never claims cloud success`);
          const recovery = JSON.parse(value.storage[await page.evaluate(() => pcbRecoveryFixture.recoveryKey)]);
          assert.equal(recovery.savedRevision, '2026-11-12T10:00:00.000Z', `${label}: old saved revision retained`);
          const content = projects => projects.map(({ lastEditedBy, lastEditedById, ...project }) => project);
          assert.deepEqual(content(recovery.state.projects), content(value.state.data.projects), `${label}: recovery contains full project content (save attribution may be added)`);
          assert.equal(value.storage['unrelated-synthetic-sentinel'], 'keep exact bytes\t\u0000🧪 {"partial":');
          return value.state.data;
        };
        const unchanged = async expected => {
          const actual = await saved();
          assert.deepEqual(actual, expected, 'The full draft, not just visible text, survives');
          assert.deepEqual(Array.from(Buffer.from(actual.projects[0].description)), Array.from(Buffer.from(expected.projects[0].description)), 'Exact UTF-8 draft bytes survive');
        };
        const ready = () => page.waitForFunction(() => pcbRecoveryFixture.state?.canEdit && pcbRecoveryFixture.state.remoteReady);
        const denied = () => page.waitForFunction(() => pcbRecoveryFixture.state && !pcbRecoveryFixture.state.canEdit && !pcbRecoveryFixture.state.remoteReady
          && ['session-required', 'denied', 'error'].includes(pcbRecoveryFixture.state.remoteAccessStatus)
          && document.querySelector('[data-testid="pcb-cloud-access"]'));
        const retry = () => page.getByTestId('pcb-cloud-retry');
        const screenshot = label => page.screenshot({ path: path.join(evidence, `${viewport.width}-${name}-${label}.png`), fullPage: true });
        const settings = async () => {
          if (viewport.width === 390) {
            await page.getByRole('button', { name: '開啟 PCB 專案操作', exact: true }).click();
            await page.getByRole('menuitem', { name: '專案設定', exact: true }).click();
          } else await page.getByRole('button', { name: '專案設定', exact: true }).click();
          await page.getByRole('dialog').waitFor();
        };
        try {
          await page.goto(`${origin}/pcb-recovery/?scenario=${initial}`, { waitUntil: 'load' });
          // Playwright's installed clock intentionally replaces Performance
          // entries with []. Keep real document/network evidence instead.
          const originalDocument = await page.evaluateHandle(() => document);
          const originalDocumentIdentity = await page.evaluate(() => pcbDocumentIdentity);
          await page.getByTestId('pcb-designer-workspace').waitFor();
          await page.waitForFunction(() => pcbRecoveryFixture.state?.hasUnsavedChanges);
          await body({ page, state, saved, unchanged, ready, denied, retry, screenshot, settings });
          result.safety = await page.evaluate(() => ({
            networkOrBrowserStorageWrites: pcbBoundaryViolations,
            destructiveRepositoryWrites: pcbRecoveryFixture.destructiveWrites,
            permissionsReads: pcbRecoveryFixture.permissionsReads, authMutations: pcbRecoveryFixture.authMutations,
            documentIdentity: pcbDocumentIdentity,
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          }));
          result.safety.documentLoads = documentLoads;
          result.safety.documentRequests = requests.filter(value => value === '/pcb-recovery/').length;
          result.safety.originalDocumentRetained = await page.evaluate(original => document === original, originalDocument);
          await originalDocument.dispose();
          assert.deepEqual(result.safety.networkOrBrowserStorageWrites, [], 'No real network, browser storage or IndexedDB operations');
          assert.deepEqual(result.safety.destructiveRepositoryWrites, [], 'No draft/baseline removal even in the isolated repository');
          assert.deepEqual(result.safety.authMutations, [], 'Recovery is read-only and never signs out or changes a login');
          assert.equal(result.safety.permissionsReads, 0, 'No fallback to legacy permissions snapshots');
          assert.equal(result.safety.width, viewport.width);
          assert.ok(result.safety.scrollWidth <= viewport.width, 'PCB recovery does not overflow the document');
          assert.equal(result.safety.documentLoads, 1, 'Recovery does not load another document');
          assert.equal(result.safety.documentRequests, 1, 'Exactly one real document request: no reload or replacement navigation');
          assert.equal(result.safety.originalDocumentRetained, true, 'The actual original Document object survives recovery');
          assert.equal(result.safety.documentIdentity, originalDocumentIdentity, 'The original per-document identity remains unchanged');
          assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
          await screenshot('passed'); result.status = 'passed';
        } catch (error) {
          result.status = 'failed'; result.error = error.message;
          result.debug = await page.evaluate(() => ({ state: window.pcbRecoveryFixture?.state,
            calls: window.pcbRecoveryFixture?.calls, violations: window.pcbBoundaryViolations,
            destructive: window.pcbRecoveryFixture?.destructiveWrites, body: document.body.innerText })).catch(() => null);
          result.browserErrors = errors; result.forbiddenRequests = forbidden;
          await screenshot('failure').catch(() => {});
          throw error;
        } finally { report(); await context.close(); }
      }

      for (const initial of ['missing', 'expired', 'rpc401', 'rpc42501', 'view-denied']) await scenario(initial + '-draft-recovery', async ({ page, saved, unchanged, ready, denied, retry, screenshot }) => {
        await denied();
        assert.equal(await page.getByTestId('pcb-cloud-access').getAttribute('data-status'), ['missing', 'expired'].includes(initial) ? 'session-required' : 'denied');
        const draft = await saved();
        assert.equal(await page.getByRole('button', { name: '儲存', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: '匯入 JSON', exact: true }).isDisabled(), true);
        // Disabled UI and the real persistence API both fail closed.
        await page.keyboard.press('Control+s');
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.api.saveNow()), false);
        await retry().click(); await denied(); await retry().click(); await denied();
        await unchanged(draft); await screenshot('denied');
        const calls = await page.evaluate(() => pcbRecoveryFixture.calls);
        if (initial === 'missing' || initial === 'expired') assert.deepEqual(calls, [], 'Invalid session sends no RPC, including lock acquire/release');
        assert.ok(!calls.some(call => call.name === 'load_pcb_designer_workspace' || call.name.startsWith('save_')), 'Denial never falls through to legacy load or saves');
        const box = await retry().boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height,
          'Recovery action is visible and reachable at the target viewport');
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'ok'; pcbRecoveryFixture.controls.lock = 'ok'; pcbRecoveryFixture.renewSession(); });
        if (!['missing', 'expired'].includes(initial)) {
          await denied();
          assert.equal(await page.getByTestId('pcb-cloud-access').getAttribute('data-status'), 'denied', 'Routine token refresh cannot clear server denial');
          await retry().click();
        }
        await ready(); await unchanged(draft);
        assert.equal(await page.getByRole('button', { name: '儲存', exact: true }).isEnabled(), true);
      }, initial);

      await scenario('empty-cloud-keeps-dirty-recovery', async ({ page, ready, saved, unchanged, denied }) => {
        await denied(); const draft = await saved();
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'empty'; pcbRecoveryFixture.controls.lock = 'ok'; pcbRecoveryFixture.renewSession(); });
        await ready(); await unchanged(draft);
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.toasts.some(value => /完成|已同步/.test(value.title))), false,
          'A legitimately empty load does not claim the existing draft was saved');
      }, 'missing');

      for (const [name, mode] of [['save-denial-keeps-recovery', '42501'], ['p0001-edit-denial-keeps-recovery', 'edit-denied']]) await scenario(name, async ({ page, ready, denied, saved, unchanged }) => {
        await ready(); const draft = await saved();
        await page.evaluate(mode => { pcbRecoveryFixture.controls.save = mode; }, mode);
        await page.getByRole('button', { name: '儲存', exact: true }).click();
        await page.waitForFunction(() => pcbRecoveryFixture.toasts.some(value => value.title.includes('失敗')));
        await denied();
        assert.equal(await page.getByTestId('pcb-cloud-access').getAttribute('data-status'), 'denied', 'Explicit save authorization denial pauses editing as well as saving');
        await unchanged(draft);
        const saves = await page.evaluate(() => pcbRecoveryFixture.calls.filter(call => call.name.startsWith('save_')));
        assert.equal(saves.length, 1);
        assert.equal(saves[0].name, 'save_pcb_designer_workspace_locked', 'Rejected locked save never becomes an unlocked/permissions fallback');
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.toasts.some(value => value.title === '儲存與同步完成')), false);
      });

      await scenario('denied-lock-never-unlocks', async ({ page, ready, denied, saved, unchanged, retry }) => {
        await ready(); const draft = await saved();
        await page.evaluate(async () => { pcbRecoveryFixture.controls.lock = '42501'; await pcbRecoveryFixture.api.projectLock.refresh(); });
        await denied();
        assert.equal((await page.evaluate(() => pcbRecoveryFixture.state)).projectLockCanEdit, false);
        await page.keyboard.press('Control+s'); await retry().click(); await denied();
        await unchanged(draft);
        await page.evaluate(() => { pcbRecoveryFixture.controls.lock = 'ok'; pcbRecoveryFixture.renewSession(); });
        await denied();
        assert.equal(await page.getByTestId('pcb-cloud-access').getAttribute('data-status'), 'denied');
        await retry().click();
        await ready(); await unchanged(draft);
      });

      await scenario('stale-load-after-new-session', async ({ page, ready, saved, unchanged, denied }) => {
        await denied(); const draft = await saved();
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'hold'; pcbRecoveryFixture.controls.lock = 'ok'; pcbRecoveryFixture.renewSession(); });
        await page.waitForFunction(() => pcbRecoveryFixture.held.some(item => item.kind === 'load' && !item.resolved));
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'ok'; pcbRecoveryFixture.expireSession(); });
        await denied();
        await page.evaluate(() => pcbRecoveryFixture.renewSession('SIGNED_IN'));
        await ready();
        await page.evaluate(() => pcbRecoveryFixture.resolveHeld('load', 0, 'stale'));
        await page.waitForTimeout(50); await unchanged(draft);
        assert.equal(await page.getByTestId('pcb-cloud-access').count(), 0, 'A stale completion cannot downgrade recovered access');
      }, 'missing');

      await scenario('stale-denial-after-new-session', async ({ page, ready, saved, unchanged, denied }) => {
        await denied(); const draft = await saved();
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'hold'; pcbRecoveryFixture.controls.lock = 'ok'; pcbRecoveryFixture.renewSession(); });
        await page.waitForFunction(() => pcbRecoveryFixture.held.some(item => item.kind === 'load' && !item.resolved));
        await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'ok'; pcbRecoveryFixture.expireSession(); });
        await denied();
        await page.evaluate(() => pcbRecoveryFixture.renewSession('SIGNED_IN'));
        await ready();
        await page.evaluate(() => pcbRecoveryFixture.resolveHeld('load', 0, '42501'));
        await page.waitForTimeout(50); await unchanged(draft); await ready();
        assert.equal(await page.getByTestId('pcb-cloud-access').count(), 0);
      }, 'missing');

      await scenario('stale-save-keeps-newer-draft', async ({ page, ready, denied, saved, unchanged, settings }) => {
        await ready();
        await page.evaluate(() => { pcbRecoveryFixture.controls.save = 'hold'; });
        await page.getByRole('button', { name: '儲存', exact: true }).click();
        await page.waitForFunction(() => pcbRecoveryFixture.held.some(item => item.kind === 'save'));
        assert.equal(await page.getByRole('button', { name: '正在同步', exact: true }).isDisabled(), true, 'Repeated save click is blocked while pending');
        await settings();
        await page.getByRole('dialog').getByLabel('描述', { exact: true }).fill('Synthetic newer draft after pending save 🧪');
        await page.getByRole('dialog').getByRole('button', { name: '儲存', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        const newer = await saved();
        await page.evaluate(() => { pcbRecoveryFixture.controls.save = 'ok'; pcbRecoveryFixture.expireSession(); });
        await denied();
        await page.evaluate(() => pcbRecoveryFixture.renewSession('SIGNED_IN'));
        await ready();
        await page.evaluate(() => pcbRecoveryFixture.resolveHeld('save'));
        await page.waitForTimeout(50); await unchanged(newer);
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.toasts.some(value => value.title === '儲存與同步完成')), false,
          'A response from the old session cannot claim the new draft was synchronized');
      });

      await scenario('normal-token-refresh-keeps-own-lease', async ({ page, ready, saved, unchanged }) => {
        await ready(); const draft = await saved();
        await page.waitForFunction(() => pcbRecoveryFixture.calls.some(call => call.name === 'list_pcb_designer_model_assets'));
        const before = await page.evaluate(() => ({ calls: pcbRecoveryFixture.calls,
          access: pcbRecoveryFixture.remoteClient.getAccessSnapshot(), lock: pcbRecoveryFixture.api.projectLock.lock,
          client: pcbRecoveryFixture.clientId, renderIndex: pcbRecoveryFixture.renders.length }));
        await page.evaluate(() => pcbRecoveryFixture.renewSession());
        await page.waitForTimeout(50); await ready(); await unchanged(draft);
        const after = await page.evaluate(() => ({ calls: pcbRecoveryFixture.calls,
          access: pcbRecoveryFixture.remoteClient.getAccessSnapshot(), lock: pcbRecoveryFixture.api.projectLock.lock,
          client: pcbRecoveryFixture.clientId, renders: pcbRecoveryFixture.renders }));
        assert.deepEqual(after.calls, before.calls, 'Routine same-actor TOKEN_REFRESHED triggers no release, acquire, load or other RPC');
        assert.deepEqual(after.access, before.access, 'Healthy access generation and readiness are unchanged');
        assert.deepEqual(after.lock, before.lock, 'The existing own-client lease is retained');
        assert.equal(after.client, before.client);
        assert.ok(after.renders.slice(before.renderIndex).every(render => render.canEdit && render.remoteReady && render.remoteAccessStatus === 'ready'),
          'Routine token refresh never renders a transient editing or readiness outage');
        assert.equal(await page.getByTestId('pcb-cloud-access').count(), 0);
      });

      await scenario('actor-switch-preserves-original-owner', async ({ page, ready, denied, saved, unchanged, retry }) => {
        await ready(); const draft = await saved();
        await page.waitForFunction(() => pcbRecoveryFixture.calls.some(call => call.name === 'list_pcb_designer_model_assets'));
        const before = await page.evaluate(() => ({ calls: pcbRecoveryFixture.calls.length,
          storage: pcbRecoveryFixture.storageSnapshot(), client: pcbRecoveryFixture.clientId }));
        await page.evaluate(() => pcbRecoveryFixture.switchActor());
        await denied();
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.ownerChanged), true);
        assert.match(await page.getByTestId('pcb-cloud-access').innerText(), /帳號已變更/);
        assert.equal(await page.getByRole('button', { name: '儲存', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: '匯入 JSON', exact: true }).isDisabled(), true);
        await retry().click(); await retry().click();
        await page.keyboard.press('Control+s');
        const actions = await page.evaluate(async () => {
          const saved = await pcbRecoveryFixture.api.saveNow();
          await pcbRecoveryFixture.api.refreshRemoteNow();
          await pcbRecoveryFixture.api.projectLock.refresh();
          const model = await pcbRecoveryFixture.api.loadModelAsset('synthetic-original-owner-model');
          return { saved, model };
        });
        assert.deepEqual(actions, { saved: false, model: null });
        await page.clock.fastForward(8100);
        await unchanged(draft);
        const after = await page.evaluate(() => ({ calls: pcbRecoveryFixture.calls,
          storage: pcbRecoveryFixture.storageSnapshot(), writes: pcbRecoveryFixture.storageWrites,
          originalKey: pcbRecoveryFixture.recoveryKey, user: pcbRecoveryFixture.user,
          otherUserId: pcbRecoveryFixture.otherUserId, client: pcbRecoveryFixture.clientId }));
        assert.equal(after.user.userId, after.otherUserId, 'The mounted UI really received the new application account');
        assert.equal(after.calls.length, before.calls, 'Actor change, retry, heartbeat and model/save requests never send the old workspace to the new account');
        assert.equal(after.storage[after.originalKey], before.storage[after.originalKey], 'Original owner recovery bytes remain exactly intact');
        assert.ok(!Object.keys(after.storage).some(key => key.includes(after.otherUserId)), 'No new-owner recovery or workspace is created');
        assert.ok(!after.writes.some(write => write.key.includes(after.otherUserId)), 'No write is attempted in the new-owner namespace');
        assert.equal(after.client, before.client, 'The existing mounted workspace is preserved');
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.mounted), 1);
      });

      await scenario('own-client-lease-renew-release', async ({ page, ready, saved, unchanged }) => {
        await ready(); const draft = await saved();
        const initialCount = await page.evaluate(() => pcbRecoveryFixture.calls.filter(call => call.name === 'acquire_pcb_designer_project_lock').length);
        await page.clock.fastForward(8100);
        await page.waitForFunction(count => pcbRecoveryFixture.calls.filter(call => call.name === 'acquire_pcb_designer_project_lock').length > count, initialCount);
        await unchanged(draft);
        const client = await page.evaluate(() => pcbRecoveryFixture.clientId);
        await page.evaluate(() => pcbRecoveryFixture.setVisible(false));
        await page.getByTestId('fixture-unmounted').waitFor();
        await page.waitForFunction(() => pcbRecoveryFixture.calls.some(call => call.name === 'release_pcb_designer_project_lock'));
        const calls = await page.evaluate(() => pcbRecoveryFixture.calls.filter(call => /^(acquire|release)_pcb_designer_project_lock$/.test(call.name)));
        assert.ok(calls.filter(call => call.name.startsWith('acquire')).length >= 2);
        for (const call of calls) {
          assert.equal(call.args.p_editor_client_id, client);
          assert.equal(call.args.p_project_id, 'synthetic-pcb-project');
          assert.equal(call.args.p_user_id, '10000000-0000-4000-8000-000000000001');
          if (call.name.startsWith('acquire')) assert.equal(call.args.p_lease_seconds, 30);
        }
        // Same tab recovery identity restores the draft on remount, not cloud data.
        await page.evaluate(() => pcbRecoveryFixture.setVisible(true));
        await ready(); await unchanged(draft);
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.mounted), 2);
      });

      await scenario('dialog-cancel-and-history', async ({ page, ready, saved, unchanged, settings }) => {
        await ready(); const draft = await saved();
        for (const close of ['cancel', 'escape']) {
          await settings();
          await page.getByRole('dialog').getByLabel('描述', { exact: true }).fill('Synthetic cancelled description, must never persist');
          if (close === 'cancel') await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
          else await page.keyboard.press('Escape');
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          await unchanged(draft);
        }
        const original = page.url();
        await page.evaluate(() => pcbRecoveryFixture.history.push());
        const second = page.url();
        assert.notEqual(second, original);
        const cancelled = page.waitForEvent('dialog');
        await page.evaluate(() => history.back());
        await (await cancelled).dismiss();
        await page.waitForFunction(expected => location.href === expected, second);
        await page.waitForTimeout(50); await unchanged(draft);
        const acceptedBack = page.waitForEvent('dialog');
        await page.evaluate(() => history.back());
        await (await acceptedBack).accept();
        await page.waitForFunction(expected => location.href === expected, original);
        const acceptedForward = page.waitForEvent('dialog');
        await page.evaluate(() => history.forward());
        await (await acceptedForward).accept();
        await page.waitForFunction(expected => location.href === expected, second);
        await unchanged(draft);
        assert.equal(await page.evaluate(() => pcbRecoveryFixture.mounted), 1);
      });
    }
    assert.deepEqual(blocked, []);
    summary.status = 'passed'; report();
    console.log(JSON.stringify({ status: summary.status, scenarios: summary.results.length, evidence, syntheticOnly: true }));
  } catch (error) { summary.status = 'failed'; summary.error = error.message; report(); throw error; }
  finally { if (browser) await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
