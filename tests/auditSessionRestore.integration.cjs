const assert = require('node:assert/strict');
const test = require('node:test');
const { React, act, create, browser, deferred, loader } = require('./support/renderHarness.cjs');

const session = (id, token = `token-${id}`) => ({
  access_token: token, refresh_token: `refresh-${id}`,
  user: { id: `auth-${id}`, app_metadata: {} },
});
const profile = id => ({ data: [{ user_id: id, username: id, role: 'user', display_name: id }], error: null });

async function fixture() {
  const window = browser();
  const storage = new Map([['bringup-auth-session-version', '2026-07-31-tab-isolation-v2']]);
  window.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const bootstrap = deferred();
  const profiles = [];
  const timers = new Map();
  let nextTimer = 0, listener, state, signOuts = 0, subscribed = true;
  const supabase = {
    auth: {
      getSession: () => bootstrap.promise,
      onAuthStateChange: callback => {
        listener = callback;
        return { data: { subscription: { unsubscribe() { subscribed = false; } } } };
      },
      getUser: async () => ({ data: { user: null }, error: new Error('Unverified') }),
      signOut: async () => { signOuts += 1; return { error: null }; },
    },
    rpc: name => {
      assert.equal(name, 'get_current_system_user');
      const request = deferred(); profiles.push(request); return request.promise;
    },
    realtime: { setAuth: async () => {} },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => {},
  };
  const load = loader({
    window,
    mocks: {
      '@/integrations/supabase/client': { supabase },
      '@/lib/realtimeCollaborationConfig': { REALTIME_COLLABORATION_V2_ENABLED: true },
    },
    globals: {
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id),
      console: { ...console, warn() {} },
    },
  });
  const { UserProvider, useUser } = load('src/components/auth/UserContext.tsx');
  function Probe() { state = useUser(); return null; }
  let tree;
  await act(async () => { tree = create(React.createElement(UserProvider, null, React.createElement(Probe))); });
  return {
    profiles, bootstrap, storage, timers, supabase,
    get state() { return state; },
    get signOuts() { return signOuts; },
    get subscribed() { return subscribed; },
    async emit(event, value) { await act(async () => { listener(event, value); }); },
    async resolveBootstrap(value) { await act(async () => { bootstrap.resolve({ data: { session: value }, error: null }); }); },
    async resolveProfile(index, value) { await act(async () => { profiles[index].resolve(value); }); },
    async timeout() {
      const pending = [...timers];
      await act(async () => {
        for (const [id, timer] of pending) {
          assert.equal(timer.delay, 8_000);
          timers.delete(id); timer.callback();
        }
      });
    },
    async logout() { await act(async () => { state.logout(); }); },
    async unmount() { await act(async () => { tree.unmount(); }); },
  };
}

for (const first of ['event', 'getSession']) {
  test(`same-token ${first} bootstrap shares one profile request and keeps the gate closed`, async t => {
    const f = await fixture(); t.after(() => f.unmount());
    const account = session('A');
    if (first === 'event') {
      await f.emit('INITIAL_SESSION', account);
      await f.resolveBootstrap(account);
    } else {
      await f.resolveBootstrap(account);
      await f.emit('INITIAL_SESSION', { ...account });
    }
    assert.equal(f.profiles.length, 1);
    assert.equal(f.state.isInitializing, true);
    assert.equal(f.state.isLoggedIn, false);
    await f.resolveProfile(0, profile('A'));
    assert.equal(f.state.user.userId, 'A');
    assert.equal(f.state.sessionMode, 'authenticated');
    assert.equal(f.state.isInitializing, false);
  });
}

test('late getSession cannot replace a newer verified auth event', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.emit('SIGNED_IN', session('B'));
  await f.resolveProfile(0, profile('B'));
  await f.resolveBootstrap(session('A'));
  assert.equal(f.profiles.length, 1);
  assert.equal(f.state.user.userId, 'B');
  assert.equal(JSON.parse(f.storage.get('user')).userId, 'B');
});

test('older account profile cannot overwrite a newer profile or release its pending gate', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.resolveBootstrap(session('A'));
  await f.emit('SIGNED_IN', session('B'));
  assert.equal(f.profiles.length, 2);
  await f.resolveProfile(0, profile('A'));
  assert.equal(f.state.isInitializing, true);
  assert.equal(f.state.user, null);
  assert.equal(f.storage.has('user'), false);
  await f.resolveProfile(1, profile('B'));
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.state.isInitializing, false);
});

test('older failed profile cannot sign out the newer verified account', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.resolveBootstrap(session('A'));
  await f.emit('TOKEN_REFRESHED', session('B'));
  await f.resolveProfile(1, profile('B'));
  await f.resolveProfile(0, { data: [], error: null });
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.signOuts, 0);
  assert.ok(f.storage.has('bringup-auth-session-version'));
});

test('a later same-token event revalidates instead of caching authorization permanently', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  const account = session('A');
  await f.resolveBootstrap(account);
  await f.resolveProfile(0, profile('A'));
  await f.emit('USER_UPDATED', account);
  assert.equal(f.profiles.length, 2);
  await f.resolveProfile(1, { data: [], error: null });
  assert.equal(f.state.user, null);
  assert.equal(f.signOuts, 1);
});

test('verified login response cannot be undone by its slower SIGNED_IN profile timeout', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  const account = session('B');
  f.supabase.functions = {
    invoke: async () => ({
      data: {
        success: true, session: account,
        system_user: { user_id: 'B', username: 'B', role: 'user', display_name: 'B' },
      }, error: null,
    }),
  };
  f.supabase.auth.setSession = async () => {
    await f.emit('SIGNED_IN', account);
    return { error: null };
  };
  let result;
  await act(async () => { result = await f.state.authenticate('B', 'unchanged-password'); });
  assert.equal(result.user.userId, 'B');
  assert.equal(f.profiles.length, 1);
  assert.equal(f.state.isInitializing, false);
  await f.timeout();
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.signOuts, 0);
});

for (const signOut of ['logout', 'SIGNED_OUT']) {
  test(`${signOut} invalidates a pending profile even before SDK sign-out completes`, async t => {
    const f = await fixture(); t.after(() => f.unmount());
    await f.emit('INITIAL_SESSION', session('A'));
    if (signOut === 'logout') await f.logout();
    else await f.emit('SIGNED_OUT', null);
    assert.equal(f.state.user, null);
    assert.equal(f.state.isInitializing, false);
    await f.resolveProfile(0, profile('A'));
    await f.resolveBootstrap(session('A'));
    assert.equal(f.state.user, null);
    assert.equal(f.state.sessionMode, 'signed-out');
    assert.equal(f.storage.has('user'), false);
  });
}

test('bootstrap timeout cannot clear a newer verified session', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.emit('SIGNED_IN', session('B'));
  await f.resolveProfile(0, profile('B'));
  await f.timeout();
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.state.isInitializing, false);
  assert.equal(f.signOuts, 0);
});

test('shared profile timeout stays signed out even if the server responds late', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  const account = session('A');
  await f.resolveBootstrap(account);
  await f.emit('INITIAL_SESSION', account);
  assert.equal(f.profiles.length, 1);
  await f.timeout();
  assert.equal(f.state.isInitializing, false);
  assert.equal(f.state.user, null);
  assert.equal(f.signOuts, 1);
  await f.resolveProfile(0, profile('A'));
  assert.equal(f.state.user, null);
  assert.equal(f.storage.has('user'), false);
});

test('session-version rejection never queries or trusts the cached user', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  f.storage.delete('bringup-auth-session-version');
  await f.resolveBootstrap(session('A'));
  assert.equal(f.profiles.length, 0);
  assert.equal(f.state.user, null);
  assert.equal(f.state.reauthRequired, true);
  assert.equal(f.signOuts, 1);
});

test('unmounted profile restore cannot write a user back to browser storage', async () => {
  const f = await fixture();
  await f.resolveBootstrap(session('A'));
  await f.unmount();
  await f.resolveProfile(0, profile('A'));
  assert.equal(f.subscribed, false);
  assert.equal(f.storage.has('user'), false);
});
