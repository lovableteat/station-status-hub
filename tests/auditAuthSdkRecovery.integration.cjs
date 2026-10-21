const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { React, act, create, browser, loader } = require('./support/renderHarness.cjs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const authId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const authUser = { id: authId, aud: 'authenticated', role: 'authenticated', app_metadata: {} };
const profile = { user_id: userId, username: 'synthetic', role: 'user', display_name: 'Synthetic' };
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const jwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: authId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })}.${Buffer.alloc(32).toString('base64url')}`;
const session = { access_token: jwt, refresh_token: 'synthetic-refresh', user: authUser, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' };
const rows = {
  test_projects: [{ id: 'A', name: 'Synthetic project', status: 'active' }],
  test_systems: [{ id: 'system-A', project_id: 'A', system_name: 'Synthetic machine', assigned_engineer: '', current_station: 'Station', overall_progress: 0, status: 'active' }],
  test_flow_stations: [{ id: 'station-A', project_id: 'A', station_name: 'Station', station_order: 1 }],
  test_flow_items: [{ id: 'item-A', project_id: 'A', station_id: 'station-A', item_name: 'Check', item_order: 1 }],
  station_contents: [{ id: 'content-A', project_id: 'A', station_id: 'station-A', title: 'Instructions', content: '', order_num: 1 }],
  test_progress: [{ id: 'progress-A', project_id: 'A', system_id: 'system-A', station_id: 'station-A', item_id: 'item-A', status: 'Not Started', progress_percent: 0, notes: '' }],
};

async function fixture(t, { expired = false, refreshFailure = 'stalled', deniedLogin = false, deniedTable = null } = {}) {
  const { createBoundedAuthFetch } = await import(pathToFileURL(path.resolve('src/integrations/supabase/authLockPolicy.mjs')));
  const storage = new Map();
  if (expired) storage.set('synthetic-auth', JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) - 60 }));
  const requests = [], warnings = [], failures = [], toasts = [];
  let refreshAttempts = 0, loginAt = null, state, projects, data;
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requests.push({ path: url.pathname, authorization: headers.get('Authorization') });
    if (url.pathname === '/auth/v1/token') {
      refreshAttempts += 1;
      if (refreshFailure === 'network') throw new TypeError('Synthetic network unavailable');
      if (refreshFailure === 'server') return Response.json({ message: 'Synthetic service unavailable' }, { status: 503 });
      // Old refreshes never respond. This must stop after one transport deadline,
      // rather than locking subsequent Functions/REST calls for the SDK retry budget.
      return new Promise((_resolve, reject) => {
        const abort = () => reject(init.signal.reason);
        if (init.signal.aborted) abort();
        else init.signal.addEventListener('abort', abort, { once: true });
      });
    }
    if (url.pathname.endsWith('/account-login')) {
      loginAt = performance.now();
      return deniedLogin
        ? Response.json({ error: 'Invalid credentials' }, { status: 401 })
        : Response.json({ success: true, session, system_user: profile });
    }
    if (url.pathname === '/auth/v1/user') return Response.json(authUser);
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/rpc/get_current_system_user') return Response.json([profile]);
    if (url.pathname === '/rest/v1/rpc/get_test_project_summaries') return Response.json([]);
    const table = url.pathname.replace('/rest/v1/', '');
    if (table in rows) {
      assert.equal(headers.get('Authorization'), `Bearer ${jwt}`, `${table} must use the verified session`);
      return table === deniedTable
        ? Response.json({ code: '42501', message: 'permission denied' }, { status: 403 })
        : Response.json(rows[table]);
    }
    throw new Error(`Unexpected synthetic request ${url.pathname}`);
  };
  const client = createClient('https://synthetic.supabase.co', 'synthetic-anon-key', {
    db: { schema: 'workspace' },
    global: { fetch: createBoundedAuthFetch({ fetchImpl, timeoutMs: 60 }) },
    auth: {
      storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      storageKey: 'synthetic-auth', persistSession: true, autoRefreshToken: true,
      lock: async (_name, _timeout, operation) => operation(),
    },
  });
  // Keep the real Auth, Functions and PostgREST SDK. Only WebSocket transport is
  // replaced: these tests exercise session/HTTP sequencing, not a remote service.
  client.channel = () => ({ on() { return this; }, subscribe() { return this; } });
  client.removeChannel = async () => {};
  const window = browser();
  const browserStorage = new Map([['bringup-auth-session-version', '2026-07-31-tab-isolation-v2']]);
  window.sessionStorage = { getItem: key => browserStorage.get(key) ?? null, setItem: (key, value) => browserStorage.set(key, value), removeItem: key => browserStorage.delete(key) };
  const toast = value => toasts.push(value);
  const load = loader({
    window,
    mocks: {
      '@/integrations/supabase/client': { supabase: client },
      '@/lib/realtimeCollaborationConfig': { REALTIME_COLLABORATION_V2_ENABLED: true },
      '@/hooks/use-toast': { useToast: () => ({ toast }) },
    },
    globals: { console: { ...console, warn: (...args) => warnings.push(args), error: (...args) => failures.push(args) } },
    // Make the app's visible gate open before the old Auth request times out,
    // exactly the race reported by the user, without spending 8 seconds per test.
    transform: source => source.replace('const SESSION_BOOTSTRAP_TIMEOUT_MS = 8_000;', 'const SESSION_BOOTSTRAP_TIMEOUT_MS = 20;'),
  });
  const { UserProvider, useUser } = load('src/components/auth/UserContext.tsx');
  const { TestProjectProvider, useTestProject } = load('src/components/test-projects/TestProjectProvider.tsx');
  const { UnifiedDataProvider, useUnifiedData } = load('src/hooks/useUnifiedData.ts');
  function DataProbe() { projects = useTestProject(); data = useUnifiedData(); return null; }
  function Gate() {
    state = useUser();
    return state.isLoggedIn && !state.isInitializing
      ? React.createElement(TestProjectProvider, null, React.createElement(UnifiedDataProvider, null, React.createElement(DataProbe)))
      : null;
  }
  let tree;
  t.after(async () => {
    await act(async () => tree?.unmount());
    await client.auth.stopAutoRefresh();
    client.realtime.disconnect();
  });
  await act(async () => { tree = create(React.createElement(UserProvider, null, React.createElement(Gate))); });
  return {
    client, requests, toasts, failures, warnings, storage,
    get state() { return state; }, get projects() { return projects; }, get data() { return data; },
    get refreshAttempts() { return refreshAttempts; }, get loginAt() { return loginAt; },
    async waitUntil(check, message) {
      const started = performance.now();
      while (!check() && performance.now() - started < 1500) await act(async () => sleep(5));
      assert.ok(check(), message);
    },
    async login() {
      const started = performance.now();
      let result;
      await act(async () => {
        result = await Promise.race([
          state.authenticate('synthetic', 'synthetic-password'),
          sleep(1500).then(() => { throw new Error('New login remained blocked by old Auth refresh'); }),
        ]);
      });
      return { result, started };
    },
  };
}

for (const scenario of [
  { expired: false, label: 'fresh login' },
  { expired: true, label: 'stalled refresh recovery' },
  { expired: true, refreshFailure: 'network', label: 'network refresh recovery' },
  { expired: true, refreshFailure: 'server', label: '503 refresh recovery' },
]) {
  test(`real SDK ${scenario.label} reaches all five project data sets`, async t => {
    const f = await fixture(t, scenario);
    await f.waitUntil(() => !f.state.isInitializing, 'login gate must open');
    const { result, started } = await f.login();
    assert.equal(result.user.userId, userId);
    assert.ok(f.loginAt - started < 500, 'credential request must not wait through SDK refresh retries');
    await f.waitUntil(() => f.projects?.activeProjectId === 'A' && f.data?.systems.length === 1 && !f.data.isLoading, 'project and station data must finish loading');
    assert.equal(f.data.stations[0].id, 'station-A');
    assert.equal(f.data.testItems[0].id, 'item-A');
    assert.equal(f.data.stationContents[0].id, 'content-A');
    assert.equal(f.data.progress[0].id, 'progress-A');
    assert.equal(f.refreshAttempts, scenario.expired ? 1 : 0);
    assert.deepEqual(f.toasts, []);
    assert.deepEqual(f.failures, []);
    assert.equal(f.client.auth.lockAcquired, false);
    assert.equal(f.client.auth.pendingInLock.length, 0);
    await act(async () => f.state.logout());
    await f.waitUntil(() => !f.state.isLoggedIn, 'logout must clear the session');
  });
}

test('expired-session recovery never promotes rejected credentials or reads project data', async t => {
  const f = await fixture(t, { expired: true, deniedLogin: true });
  await f.waitUntil(() => !f.state.isInitializing, 'login gate must open');
  const { result } = await f.login();
  assert.equal(result, null);
  assert.equal(f.state.isLoggedIn, false);
  assert.equal(f.refreshAttempts, 1);
  assert.ok(!f.requests.some(request => request.path === '/rest/v1/test_projects'));
});

test('a real project-data permission failure still reports failure instead of empty success', async t => {
  const f = await fixture(t, { deniedTable: 'test_progress' });
  await f.waitUntil(() => !f.state.isInitializing, 'login gate must open');
  await f.login();
  await f.waitUntil(() => f.toasts.some(value => value.title === '資料載入失敗'), 'actual REST errors must remain visible');
  assert.equal(f.state.isLoggedIn, true);
  assert.equal(f.data.systems.length, 0);
});
