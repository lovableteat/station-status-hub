// Isolated jsdom integration, not a real-browser or production verification.
// Keep AuthenticatedApplication/PreparedRoutes, React Router, recovery components,
// useModuleNavigation and workspaceHistory real. Only page import boundaries and
// data providers are synthetic. No source files or on-disk bundles are rewritten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { MessageChannel } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
const qaDirectory = process.env.AUDIT_QA_DIR ||
  (fs.existsSync(path.join(root, '../qa-tools/node_modules/jsdom')) ? path.join(root, '../qa-tools') : '/tmp/station-release-qa');
const qa = createRequire(path.join(qaDirectory, 'package.json'));
const { JSDOM, VirtualConsole } = qa('jsdom');

let bundlePromise;
function bundle() {
  if (bundlePromise) return bundlePromise;
  const providers = new Map([
    ['@/components/test-projects/TestProjectProvider', 'TestProjectProvider'],
    ['@/hooks/useUnifiedData', 'UnifiedDataProvider'],
    ['@/hooks/useUserPresence', 'UserPresenceProvider'],
    ['@/hooks/usePermissions', 'PermissionsProvider'],
  ]);
  const pages = new Map([
    ['@/pages/Index', 'Index'],
    ['@/pages/NotFound', 'NotFound'],
    ['@/pages/TestTrackerPage', 'TestTrackerPage'],
    ['@/components/api-management/ApiManagementPage', 'ApiManagementPage'],
  ]);
  bundlePromise = require('esbuild').build({
    absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `
      import './src/lib/workspaceHistory';
      import React, { useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
      import AuthenticatedApplication from './src/components/auth/AuthenticatedApplication';
      import { pushWorkspaceHistory, watchWorkspaceHistory } from './src/lib/workspaceHistory';
      const api = window.__routerFixture = {
        act: React.act, attempts: {}, mounts: {}, unmounts: {}, modes: {}, waits: {},
        guards: [], allowLeave: true, observedPopstate: [], acceptedWorkspace: [],
        historyMode: 'resolve', historyWaits: [], historyRetry: null,
        defer(name) { this.modes[name] = 'defer'; },
        reject(name) { this.modes[name] = 'reject'; },
        ready(name) { this.modes[name] = 'resolve'; },
      };
      window.addEventListener('popstate', () => api.observedPopstate.push(window.location.href));
      const components = {};
      function makePage(name) {
        return function SyntheticPage() {
          const location = useLocation();
          const navigate = useNavigate();
          const [params, setParams] = useSearchParams();
          const initial = name + ' synthetic memory-only draft';
          const [draft, setDraft] = useState(initial);
          const [outerSearch, setOuterSearch] = useState(window.location.search);
          useEffect(() => {
            api.mounts[name] = (api.mounts[name] || 0) + 1;
            return () => { api.unmounts[name] = (api.unmounts[name] || 0) + 1; };
          }, []);
          useEffect(() => {
            api.navigate = navigate;
            api.edit = setDraft;
            api.search = values => setParams(previous => {
              const next = new URLSearchParams(previous);
              for (const [key, value] of Object.entries(values)) {
                if (value === null) next.delete(key); else next.set(key, value);
              }
              return next;
            });
            api.current = { name, pathname: location.pathname, search: location.search, hash: location.hash, draft, outerSearch };
          }, [navigate, location, draft, outerSearch, setParams]);
          useEffect(() => {
            const guard = event => {
              api.guards.push({ name, draft, dirty: draft !== initial });
              if (draft !== initial && !api.allowLeave) event.preventDefault();
            };
            window.addEventListener('workspace-before-navigate', guard);
            return () => window.removeEventListener('workspace-before-navigate', guard);
          }, [draft]);
          useEffect(() => {
            if (name !== 'Index') return;
            api.workspacePush = url => {
              pushWorkspaceHistory(url);
              setOuterSearch(window.location.search);
            };
            return watchWorkspaceHistory(() => {
              api.acceptedWorkspace.push(window.location.href);
              setOuterSearch(window.location.search);
            }, () => {
              if (api.historyMode === 'reject') return Promise.reject(new Error('Synthetic missing workspace chunk'));
              if (api.historyMode === 'defer') return new Promise((resolve, reject) => api.historyWaits.push({ resolve, reject }));
              return Promise.resolve();
            }, retry => { api.historyRetry = retry; });
          }, []);
          return <main data-page={name}>
            <h1>{name}</h1>
            <input data-testid="draft" value={draft} onChange={event => setDraft(event.target.value)} />
            <output data-testid="route">{location.pathname + location.search + location.hash}</output>
            <output data-testid="outer-query">{outerSearch}</output>
            <output data-testid="query-filter">{params.get('filter') || ''}</output>
          </main>;
        };
      }
      api.importPage = name => {
        api.attempts[name] = (api.attempts[name] || 0) + 1;
        const finish = () => {
          const component = components[name] || (components[name] = makePage(name));
          return { default: component, ApiManagementPage: component };
        };
        if (api.modes[name] === 'reject') return Promise.reject(new Error('Synthetic missing page chunk: ' + name));
        if (api.modes[name] === 'defer') return new Promise((resolve, reject) => {
          (api.waits[name] ||= []).push({ resolve: () => resolve(finish()), reject });
        });
        return Promise.resolve(finish());
      };
      const reactRoot = createRoot(document.getElementById('root'));
      api.mount = () => reactRoot.render(<AuthenticatedApplication />);
      api.unmount = () => reactRoot.unmount();
    ` },
    plugins: [{ name: 'synthetic-page-and-provider-boundaries', setup(build) {
      build.onResolve({ filter: /^@\// }, args => {
        if (providers.has(args.path)) return { path: args.path, namespace: 'provider-fixture' };
        return build.resolve(path.join(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind });
      });
      build.onLoad({ filter: /.*/, namespace: 'provider-fixture' }, args => ({
        contents: `export function ${providers.get(args.path)}({children}) { return children; }
          export function usePermissions() { return { loading: false, canViewModule: () => true, canEditModule: () => true }; }`,
        loader: 'js',
      }));
      build.onLoad({ filter: /[/\\]AuthenticatedApplication\.tsx$/ }, args => {
        let contents = fs.readFileSync(args.path, 'utf8');
        // These are the four dynamic page-import boundaries, not replacements for
        // PreparedRoutes, useNavigate, lazy recovery, history, or permission logic.
        for (const [specifier, name] of pages) {
          const target = `import("${specifier}")`;
          assert.equal(contents.split(target).length, 2, `one page import boundary: ${specifier}`);
          contents = contents.replace(target, `window.__routerFixture.importPage("${name}")`);
        }
        return { contents, loader: 'tsx', resolveDir: path.dirname(args.path) };
      });
    } }],
  }).then(result => result.outputFiles[0].text);
  return bundlePromise;
}

async function fixture(t, suffix = '?workspace=pcb-designer&project=A#/?filter=initial') {
  const errors = [], network = [], storageWrites = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  console.on('error', (...values) => errors.push(values.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://station.example.invalid/station-status-hub/' + suffix,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom omits MessageChannel; use Node's actual implementation for React.act
  // and close both ports during teardown so the fixture cannot keep Node alive.
  const channels = [];
  win.MessageChannel = class extends MessageChannel {
    constructor() { super(); channels.push(this); }
  };
  // Seed before installing write spies. All navigation must preserve these bytes.
  win.localStorage.setItem('synthetic-draft', '{"partial":');
  win.sessionStorage.setItem('synthetic-session', 'fixture-only');
  for (const method of ['setItem', 'removeItem', 'clear']) {
    const original = win.Storage.prototype[method];
    win.Storage.prototype[method] = function (...args) {
      storageWrites.push({ method, args });
      return original.apply(this, args);
    };
  }
  const denyNetwork = target => { network.push(String(target)); throw new Error('Network is forbidden in this fixture'); };
  win.fetch = denyNetwork;
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    win[name] = function (...args) { denyNetwork(name + ':' + args.join(',')); };
  }
  let hydrationConstructors = 0;
  win.SyntheticNetworkConstructor = function () { hydrationConstructors++; };
  win.__staticRouterHydrationData = { loaderData: {}, errors: { root: {
    __type: 'Error', __subType: 'SyntheticNetworkConstructor', message: 'fixture-only',
  } } };
  win.eval(await bundle());
  const api = win.__routerFixture;
  async function act(callback = () => {}) { await api.act(async () => { await callback(); }); }
  async function until(predicate, description = 'router state') {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return;
      await act(() => new Promise(resolve => setTimeout(resolve, 10)));
    }
    assert.ok(predicate(), `Timed out waiting for ${description}; URL=${win.location.href}; body=${win.document.body.textContent}`);
  }
  t.after(async () => {
    try {
      await act(() => api.unmount());
      assert.deepEqual(storageWrites, [], 'no localStorage/sessionStorage mutations');
      assert.equal(win.localStorage.getItem('synthetic-draft'), '{"partial":');
      assert.equal(win.sessionStorage.getItem('synthetic-session'), 'fixture-only');
      assert.equal(hydrationConstructors, 0, 'Declarative HashRouter never deserializes SSR hydration constructors');
      assert.deepEqual(network, [], 'no real services or external requests');
      assert.deepEqual(errors, [], 'no unexpected React/jsdom errors');
    } finally {
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
      win.close();
    }
  });
  await act(() => api.mount());
  await until(() => api.current, 'initial page');
  const page = () => win.document.querySelector('[data-page]')?.getAttribute('data-page');
  const draft = () => win.document.querySelector('[data-testid="draft"]');
  const navigate = async (to, options) => { await act(() => api.navigate(to, options)); };
  const click = async label => {
    const button = [...win.document.querySelectorAll('button')].find(item => item.textContent === label);
    assert.ok(button, `button exists: ${label}`);
    await act(() => button.click());
  };
  return { win, api, act, until, page, draft, navigate, click };
}

test('real HashRouter/PreparedRoutes accept query/hash deep links and useSearchParams without changing outer project query', async t => {
  for (const [suffix, expected, route] of [
    ['?workspace=performance&project=A#/?filter=initial#section', 'Index', '/'],
    ['?workspace=station-status&project=A#/test-tracker?filter=initial', 'TestTrackerPage', '/test-tracker'],
    ['?workspace=user-management&project=A#/api-management?filter=initial', 'ApiManagementPage', '/api-management'],
  ]) await t.test(expected, async t => {
    const f = await fixture(t, suffix);
    assert.equal(f.page(), expected); assert.equal(f.api.current.pathname, route);
    assert.equal(f.win.document.querySelector('[data-testid="query-filter"]').textContent, 'initial');
    const query = f.win.location.search, length = f.win.history.length;
    await f.act(() => f.api.search({ filter: '中文 & /\\ value' }));
    await f.until(() => f.win.document.querySelector('[data-testid="query-filter"]').textContent === '中文 & /\\ value');
    assert.equal(f.win.location.search, query);
    assert.equal(f.win.location.pathname, '/station-status-hub/');
    assert.equal(f.win.history.length, length + 1);
    assert.equal(f.api.mounts[expected], 1, 'query updates keep the page mounted');
  });
});

test('real navigate push/replace and Back/Forward preserve hash routes, query and history ordering', async t => {
  const f = await fixture(t); const initialLength = f.win.history.length;
  await f.navigate('/test-tracker?filter=one'); await f.until(() => f.page() === 'TestTrackerPage');
  await f.navigate('/test-tracker?filter=two', { replace: true });
  await f.until(() => f.api.current.search === '?filter=two');
  assert.equal(f.win.history.length, initialLength + 1, 'replace does not append an entry');
  assert.equal(f.api.mounts.TestTrackerPage, 1);
  await f.navigate('/api-management?filter=three'); await f.until(() => f.page() === 'ApiManagementPage');
  assert.equal(f.win.history.length, initialLength + 2);
  for (const [direction, expected, search] of [
    ['back', 'TestTrackerPage', '?filter=two'], ['back', 'Index', '?filter=initial'],
    ['forward', 'TestTrackerPage', '?filter=two'], ['forward', 'ApiManagementPage', '?filter=three'],
  ]) {
    await f.act(() => f.win.history[direction]());
    await f.until(() => f.page() === expected && f.api.current.search === search, direction + ' to ' + expected);
    assert.equal(f.win.location.search, '?workspace=pcb-designer&project=A');
  }
});

test('slow real PreparedRoutes preload keeps the editor and checks its latest dirty state only at commit', async t => {
  const f = await fixture(t); const originalInput = f.draft();
  f.api.defer('TestTrackerPage'); f.api.allowLeave = false;
  await f.navigate('/test-tracker'); await f.until(() => f.api.waits.TestTrackerPage?.length === 1);
  assert.equal(f.page(), 'Index'); assert.equal(f.draft(), originalInput);
  assert.match(f.win.document.body.textContent, /目前畫面仍可操作/);
  assert.equal(f.api.guards.length, 0, 'do not ask before the slow import finishes');
  await f.act(() => f.api.edit('newly edited while loading'));
  await f.act(() => f.api.waits.TestTrackerPage[0].resolve());
  await f.until(() => f.win.location.hash === '#/?filter=initial' && f.api.guards.length === 1);
  assert.equal(f.draft(), originalInput); assert.equal(f.draft().value, 'newly edited while loading');
  assert.equal(f.api.guards[0].draft, 'newly edited while loading');
  assert.equal(f.api.unmounts.Index || 0, 0);
  f.api.allowLeave = true;
  await f.navigate('/test-tracker'); await f.until(() => f.page() === 'TestTrackerPage');
  assert.equal(f.api.guards.length, 2, 'one guard call per final commit attempt');
  assert.equal(f.api.unmounts.Index, 1);
  assert.equal(f.api.attempts.TestTrackerPage, 1, 'the loaded chunk is reused after veto');
});

test('failed page imports, repeated retry and Cancel retain the same memory-only editor and restore its route', async t => {
  const f = await fixture(t); const originalInput = f.draft();
  f.api.reject('ApiManagementPage');
  await f.act(() => f.api.edit('unsaved synthetic private draft'));
  await f.navigate('/api-management');
  await f.until(() => f.win.document.querySelector('[data-module-load-recovery]'));
  assert.equal(f.draft(), originalInput); assert.equal(f.api.guards.length, 0);
  await f.click('重試載入此功能'); await f.until(() => f.api.attempts.ApiManagementPage === 2);
  assert.equal(f.draft().value, 'unsaved synthetic private draft');
  await f.click('留在目前畫面');
  await f.until(() => !f.win.document.querySelector('[data-module-load-recovery]') && f.win.location.hash === '#/?filter=initial');
  assert.equal(f.page(), 'Index'); assert.equal(f.draft(), originalInput);
  assert.equal(f.api.unmounts.Index || 0, 0);
  f.api.ready('ApiManagementPage');
  await f.navigate('/api-management'); await f.until(() => f.page() === 'ApiManagementPage');
  assert.equal(f.api.attempts.ApiManagementPage, 3);
});

test('a newer actual route wins over a late successful import from an older navigation', async t => {
  const f = await fixture(t);
  f.api.defer('TestTrackerPage');
  await f.navigate('/test-tracker'); await f.until(() => f.api.waits.TestTrackerPage?.length === 1);
  await f.navigate('/api-management?filter=newest'); await f.until(() => f.page() === 'ApiManagementPage');
  await f.act(() => f.api.waits.TestTrackerPage[0].resolve());
  await f.act(() => new Promise(resolve => setTimeout(resolve, 25)));
  assert.equal(f.page(), 'ApiManagementPage'); assert.equal(f.api.current.search, '?filter=newest');
  assert.equal(f.api.mounts.TestTrackerPage || 0, 0); assert.equal(f.api.unmounts.Index, 1);
});

test('native hash entries work with real HashRouter and dirty cancellation does not accept a vetoed target', async t => {
  const f = await fixture(t);
  await f.act(() => { f.win.location.hash = '#/test-tracker?filter=native'; });
  await f.until(() => f.page() === 'TestTrackerPage');
  assert.equal(f.api.current.search, '?filter=native');
  await f.act(() => f.win.history.back()); await f.until(() => f.page() === 'Index');
  await f.act(() => f.api.edit('dirty before native hash'));
  f.api.allowLeave = false; const previous = f.win.location.href, guards = f.api.guards.length;
  await f.act(() => { f.win.location.hash = '#/api-management'; });
  await f.until(() => f.api.guards.length > guards && f.win.location.href === previous);
  assert.equal(f.page(), 'Index'); assert.equal(f.draft().value, 'dirty before native hash');
  assert.equal(f.api.mounts.ApiManagementPage || 0, 0);
});

test('early workspaceHistory intercepts real HashRouter popstate until preparation succeeds and preserves canceled draft/query', async t => {
  const f = await fixture(t);
  await f.act(() => {
    f.api.workspacePush('?workspace=first&project=B#/?filter=initial');
    f.api.workspacePush('?workspace=current&project=A#/?filter=initial');
  });
  const originalInput = f.draft(), previous = f.win.location.href;
  const observedBefore = f.api.observedPopstate.length;
  f.api.historyMode = 'defer'; f.api.allowLeave = false;
  await f.act(() => f.win.history.back());
  await f.until(() => f.api.historyWaits.length === 1 && f.win.location.href === previous);
  assert.equal(f.api.observedPopstate.length, observedBefore, 'early dispatcher blocks downstream listeners during prepare/restore');
  assert.equal(f.api.guards.length, 0);
  await f.act(() => f.api.edit('dirty during workspace prepare'));
  await f.act(() => f.api.historyWaits[0].reject(new Error('synthetic old-release chunk missing')));
  await f.until(() => typeof f.api.historyRetry === 'function');
  assert.equal(f.win.location.href, previous); assert.equal(f.draft(), originalInput);
  f.api.historyMode = 'resolve';
  await f.act(() => f.api.historyRetry());
  await f.until(() => f.api.guards.length === 1 && f.win.location.href === previous);
  assert.equal(f.api.guards[0].draft, 'dirty during workspace prepare');
  assert.equal(f.api.acceptedWorkspace.length, 0);
  assert.equal(f.api.observedPopstate.length, observedBefore);
  f.api.allowLeave = true;
  await f.act(() => f.win.history.back());
  await f.until(() => f.api.acceptedWorkspace.length === 1 && f.api.current.outerSearch === '?workspace=first&project=B');
  assert.equal(f.api.guards.length, 2); assert.equal(f.draft(), originalInput);
  assert.equal(f.draft().value, 'dirty during workspace prepare');
  assert.equal(f.api.observedPopstate.length, observedBefore + 1, 'one accepted event reaches the real router');
  assert.equal(f.win.history.state.workspaceHistoryIndex, 1);
});

test('mixed-slash and interpolated navigation inputs are rejected or remain same-origin through real HashRouter/PreparedRoutes', async t => {
  const f = await fixture(t);
  let rejected = 0, confined = 0;
  for (const value of ['//outside.example.invalid/path', '\\\\outside.example.invalid/path', '/\\outside.example.invalid/path', '\\/outside.example.invalid/path', '../../\\outside.example.invalid/path', '%2F%5Coutside.example.invalid']) {
    for (const to of [value, '/cabinet/' + value, '/issues?openIssue=' + value, '/tools?openSnippet=' + value + '&tab=code']) {
      const before = { url: f.win.location.href, page: f.page(), draft: f.draft() };
      try {
        await f.navigate(to);
        await f.until(() => f.page() === 'NotFound' && !f.win.document.body.textContent.includes('目前畫面仍可操作'));
        confined++;
      } catch (error) {
        assert.equal(error.message, 'External navigation is not allowed', 'only an explicit safe URL rejection is expected');
        assert.equal(f.win.location.href, before.url); assert.equal(f.page(), before.page); assert.equal(f.draft(), before.draft);
        rejected++;
      }
      assert.equal(f.win.location.origin, 'https://station.example.invalid');
      assert.equal(f.win.location.pathname, '/station-status-hub/');
      assert.equal(f.win.location.search, '?workspace=pcb-designer&project=A');
    }
  }
  assert.ok(rejected > 0, 'patched Router explicitly rejects an external navigation');
  assert.ok(confined > 0, 'ordinary internal targets with query/path data still navigate');
  assert.equal(rejected + confined, 24);
});
