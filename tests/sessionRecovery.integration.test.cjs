const assert = require('node:assert/strict');
const test = require('node:test');
const { React, act, create, browser, deferred, loader } = require('./support/renderHarness.cjs');

const session = (id, suffix = 'initial', expiresAt = Math.floor(Date.now() / 1000) + 3600) => ({
  access_token: `synthetic-${id}-${suffix}`, refresh_token: `synthetic-refresh-${id}-${suffix}`,
  expires_at: expiresAt,
  user: { id: `auth-${id}`, app_metadata: {} },
});
const cached = id => ({ userId: id, username: id, role: 'user', displayName: `RD ${id}`, avatarPath: null });
const profile = id => ({ data: [{ user_id: id, username: id, role: 'user', display_name: `RD ${id}` }], error: null });

async function fixture({ cachedUser, delayedSignOut = false } = {}) {
  const window = browser();
  const storage = new Map([['bringup-auth-session-version', '2026-07-31-tab-isolation-v2']]);
  if (cachedUser) storage.set('user', JSON.stringify(cachedUser));
  window.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const timers = new Map();
  let timerId = 0, listener, state, signOuts = 0, hasCredential = true;
  const sessions = [], profiles = [], channels = [], signOutRequests = [];
  const setTimeout = (callback, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  const documentEvents = new EventTarget();
  const document = {
    visibilityState: 'visible',
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  };
  const supabase = {
    auth: {
      getSession() { const request = deferred(); sessions.push(request); return request.promise; },
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      getUser: async () => ({ data: { user: null }, error: { status: 503, message: 'Synthetic Auth unavailable' } }),
      signOut: async () => {
        signOuts += 1;
        if (delayedSignOut) {
          const request = deferred(); signOutRequests.push(request);
          await request.promise;
          listener('SIGNED_OUT', null);
        }
        hasCredential = false;
        return { error: null };
      },
    },
    rpc(name) {
      assert.equal(name, 'get_current_system_user');
      const request = deferred(); profiles.push(request); return request.promise;
    },
    realtime: { setAuth: async () => {} },
    channel: name => ({ name, on() { return this; }, subscribe() { channels.push(this); return this; } }),
    removeChannel: async () => {},
  };
  const load = loader({
    window,
    mocks: {
      '@/integrations/supabase/client': { supabase, hasStoredAuthSession: () => hasCredential },
      '@/lib/realtimeCollaborationConfig': { REALTIME_COLLABORATION_V2_ENABLED: true },
    },
    globals: { setTimeout, clearTimeout, document, console: { ...console, warn() {} } },
  });
  const { UserProvider, useUser } = load('src/components/auth/UserContext.tsx');
  function Probe() { state = useUser(); return null; }
  let tree;
  await act(async () => { tree = create(React.createElement(UserProvider, null, React.createElement(Probe))); });
  async function fire(delay) {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const matches = [...timers].filter(([, timer]) => timer.delay === delay);
      if (!matches.length) return;
      await act(async () => {
        for (const [id, timer] of matches) {
          if (!timers.has(id)) continue;
          timers.delete(id); timer.callback();
        }
      });
      if (delay !== 0) return;
    }
    throw new Error('Auth events must not schedule an endless zero-delay loop');
  }
  return {
    sessions, profiles, storage, timers, channels, supabase,
    get state() { return state; }, get signOuts() { return signOuts; },
    async bootstrap(value, error = null, index = 0) {
      await act(async () => { sessions[index].resolve({ data: { session: value }, error }); });
      await fire(0);
    },
    async completeProfile(index, value) { await act(async () => { profiles[index].resolve(value); }); await fire(0); },
    async completeSignOut(index = 0) { await act(async () => { signOutRequests[index].resolve(); }); await fire(0); },
    notifyAuth(event, value) { listener(event, value); },
    async emit(event, value, flush = true) { await act(async () => { listener(event, value); }); if (flush) await fire(0); },
    fire,
    async retry() { await act(async () => { state.retrySession(); }); await fire(0); },
    async logout() { await act(async () => { state.logout(); }); await fire(0); },
    async unmount() { await act(async () => { tree.unmount(); }); },
  };
}

test('initial profile timeout retains credentials and cached display data without granting authenticated access', async t => {
  const original = cached('A');
  const f = await fixture({ cachedUser: original }); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  assert.equal(f.channels.length, 0, 'cached metadata must not subscribe to private account channels');
  await f.fire(8_000);
  assert.equal(f.state.sessionRecoveryNeeded, true);
  assert.equal(f.state.isInitializing, false, 'temporary errors need a recoverable state rather than an endless spinner');
  assert.notEqual(f.state.sessionMode, 'authenticated');
  assert.equal(f.signOuts, 0, 'a deadline is not evidence of invalid credentials');
  assert.deepEqual(JSON.parse(f.storage.get('user')), original);
  assert.ok(f.storage.has('bringup-auth-session-version'));
  await f.completeProfile(0, profile('A'));
  assert.notEqual(f.state.sessionMode, 'authenticated', 'a late response must not bypass the timed-out restore generation');
  assert.equal(f.state.sessionRecoveryNeeded, true);
});

test('manual recovery verifies a fresh server profile and restores the existing login without a password', async t => {
  const f = await fixture({ cachedUser: cached('A') }); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.fire(8_000);
  assert.equal(f.state.sessionRecoveryNeeded, true);
  await f.retry();
  assert.equal(f.sessions.length, 2);
  await f.bootstrap(session('A', 'renewed'), null, 1);
  await f.completeProfile(1, profile('A'));
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.state.user.userId, 'A');
  assert.equal(f.signOuts, 0);
});

test('a transient SDK bootstrap error keeps the saved identity for automatic retry without authenticating it', async t => {
  const original = cached('A');
  const f = await fixture({ cachedUser: original }); t.after(() => f.unmount());
  await f.bootstrap(null, { status: 503, name: 'AuthRetryableFetchError', message: 'Synthetic temporary refresh failure' });
  assert.equal(f.state.sessionRecoveryNeeded, true);
  assert.notEqual(f.state.sessionMode, 'authenticated');
  assert.equal(f.profiles.length, 0);
  assert.equal(f.signOuts, 0);
  assert.deepEqual(JSON.parse(f.storage.get('user')), original);
  await f.fire(10_000);
  assert.equal(f.sessions.length, 2, 'the provider should retry once after its recovery delay');
  await f.bootstrap(session('A', 'recovered'), null, 1);
  await f.completeProfile(0, profile('A'));
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, false);
});

test('a valid renewed token keeps the already verified account through a temporary profile timeout', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  const saved = f.storage.get('user');
  await f.emit('TOKEN_REFRESHED', session('A', 'renewed'));
  assert.equal(f.profiles.length, 2);
  await f.fire(8_000);
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.state.user.userId, 'A');
  assert.equal(f.storage.get('user'), saved);
  assert.equal(f.signOuts, 0);
});

test('temporary profile network errors do not revoke a login or trust cached roles', async t => {
  const f = await fixture({ cachedUser: { ...cached('A'), role: 'admin' } }); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, { data: null, error: { status: 503, code: 'PGRST000', message: 'Synthetic network unavailable' } });
  assert.equal(f.state.sessionRecoveryNeeded, true);
  assert.notEqual(f.state.sessionMode, 'authenticated');
  assert.equal(f.channels.length, 0);
  assert.equal(f.signOuts, 0);
});

test('an expired token cannot use the previous verification to bypass a failed profile check', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  await f.emit('TOKEN_REFRESHED', session('A', 'expired', Math.floor(Date.now() / 1000) - 60));
  await f.fire(8_000);
  assert.equal(f.state.sessionRecoveryNeeded, true, 'private UI must remain gated until a valid session is recovered');
  assert.equal(f.signOuts, 0, 'temporary failure should retain refresh credentials for recovery');
});

test('a different auth identity cannot inherit the already verified account after a timeout', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  await f.emit('SIGNED_IN', session('B'));
  await f.fire(8_000);
  assert.notEqual(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, true);
  assert.equal(f.signOuts, 0);
});

test('server-confirmed unavailable account still signs out and clears recovery', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  await f.emit('USER_UPDATED', session('A'));
  await f.completeProfile(1, { data: [], error: null });
  assert.equal(f.state.user, null);
  assert.equal(f.state.sessionMode, 'signed-out');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.signOuts, 1);
  assert.equal(f.storage.has('user'), false);
  assert.equal(f.storage.has('bringup-auth-session-version'), false);
});

test('a late account A profile cannot replace account B or clear its login', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.emit('SIGNED_IN', session('B'));
  await f.completeProfile(1, profile('B'));
  await f.completeProfile(0, { data: [], error: null });
  assert.equal(f.state.user.userId, 'B');
  assert.equal(JSON.parse(f.storage.get('user')).userId, 'B');
  assert.equal(f.signOuts, 0);
});

test('a null INITIAL_SESSION event cannot erase the credentials being restored by getSession', async t => {
  const original = cached('A');
  const f = await fixture({ cachedUser: original }); t.after(() => f.unmount());
  await f.emit('INITIAL_SESSION', null);
  assert.equal(f.signOuts, 0);
  assert.deepEqual(JSON.parse(f.storage.get('user')), original);
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.state.user.userId, 'A');
});

test('a stale bootstrap error cannot gate an account verified by a newer auth event', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.emit('SIGNED_IN', session('B'));
  await f.completeProfile(0, profile('B'));
  await f.bootstrap(null, { status: 503, message: 'Synthetic stale bootstrap error' });
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.signOuts, 0);
});

test('auth profile work is deferred out of the SDK notification callback', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.emit('SIGNED_IN', session('B'), false);
  assert.equal(f.profiles.length, 0, 'private RPCs must not start under the SDK auth event lock');
  await f.fire(0);
  assert.equal(f.profiles.length, 1);
});

test('explicit logout cancels recovery retries and ignores stale authenticated work', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.fire(8_000);
  const before = f.sessions.length;
  assert.equal(f.state.sessionRecoveryNeeded, true);
  await f.logout();
  await f.fire(10_000);
  await f.completeProfile(0, profile('A'));
  assert.equal(f.sessions.length, before);
  assert.equal(f.state.user, null);
  assert.equal(f.state.sessionMode, 'signed-out');
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.signOuts, 1);
});

test('explicit logout discards queued auth notifications before they can fetch a profile', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.emit('SIGNED_IN', session('A'), false);
  await f.logout();
  await f.bootstrap(session('A'));
  assert.equal(f.profiles.length, 0);
  assert.equal(f.state.user, null);
  assert.equal(f.state.sessionRecoveryNeeded, false);
  assert.equal(f.signOuts, 1);
});

test('rapid logout then login waits for the old SDK sign-out and preserves new token refresh handling', async t => {
  const f = await fixture({ delayedSignOut: true }); t.after(() => f.unmount());
  await f.bootstrap(session('A'));
  await f.completeProfile(0, profile('A'));
  const accountB = session('B');
  const login = deferred();
  f.supabase.functions = { invoke: () => login.promise };
  let setSessionCalls = 0;
  f.supabase.auth.setSession = async () => {
    setSessionCalls += 1;
    f.notifyAuth('SIGNED_IN', accountB);
    return { error: null };
  };
  await f.logout();
  let authentication;
  await act(async () => { authentication = f.state.authenticate('B', 'CaseSensitivePassword'); });
  await act(async () => {
    login.resolve({ data: { success: true, session: accountB, system_user: profile('B').data[0] }, error: null });
  });
  assert.equal(setSessionCalls, 0, 'a pending old SDK sign-out must settle before the new session is installed');
  assert.equal(f.state.user, null);
  await f.completeSignOut();
  let result;
  await act(async () => { result = await authentication; });
  await f.fire(0);
  assert.equal(result.user.userId, 'B');
  assert.equal(f.state.sessionMode, 'authenticated');
  assert.equal(f.state.user.userId, 'B');
  const requestsBeforeRefresh = f.profiles.length;
  await f.emit('TOKEN_REFRESHED', session('B', 'refreshed-after-login'));
  assert.equal(f.profiles.length, requestsBeforeRefresh + 1, 'the old SIGNED_OUT event must not suppress the new account');
  await f.completeProfile(requestsBeforeRefresh, profile('B'));
  assert.equal(f.state.user.userId, 'B');
  assert.equal(f.state.sessionRecoveryNeeded, false);
});

test('logout during a pending account-login request cannot restore a signed-in identity', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(null);
  const login = deferred();
  f.supabase.functions = { invoke: () => login.promise };
  let setSessionCalls = 0;
  f.supabase.auth.setSession = async () => { setSessionCalls += 1; return { error: null }; };
  let authentication;
  await act(async () => {
    authentication = f.state.authenticate('B', 'CaseSensitivePassword').then(value => ({ value }), () => ({ rejected: true }));
  });
  await f.logout();
  let result;
  await act(async () => {
    login.resolve({ data: { success: true, session: session('B'), system_user: profile('B').data[0] }, error: null });
    result = await authentication;
  });
  await f.fire(0);
  assert.ok(result.rejected || !result.value, 'a cancelled attempt must not report an authenticated account');
  assert.equal(setSessionCalls, 0);
  assert.equal(f.state.user, null);
  assert.equal(f.state.sessionMode, 'signed-out');
  assert.equal(f.storage.has('user'), false);
  assert.equal(f.storage.has('bringup-auth-session-version'), false);
});

test('logout during SDK session establishment ignores its later SIGNED_IN completion', async t => {
  const f = await fixture(); t.after(() => f.unmount());
  await f.bootstrap(null);
  const accountB = session('B');
  f.supabase.functions = {
    invoke: async () => ({ data: { success: true, session: accountB, system_user: profile('B').data[0] }, error: null }),
  };
  const establishment = deferred();
  let started = false, storedCredential = null;
  f.supabase.auth.setSession = async () => {
    started = true;
    await establishment.promise;
    storedCredential = accountB.access_token;
    f.notifyAuth('SIGNED_IN', accountB);
    return { error: null };
  };
  f.supabase.auth.signOut = async () => {
    // The real SDK serializes local sign-out behind an in-flight setSession.
    await establishment.promise;
    storedCredential = null;
    f.notifyAuth('SIGNED_OUT', null);
    return { error: null };
  };
  let authentication;
  await act(async () => {
    authentication = f.state.authenticate('B', 'CaseSensitivePassword').then(value => ({ value }), () => ({ rejected: true }));
  });
  assert.equal(started, true);
  await f.logout();
  let result;
  await act(async () => { establishment.resolve(); result = await authentication; });
  await f.fire(0);
  assert.ok(result.rejected || !result.value, 'an SDK completion cannot resurrect a cancelled login attempt');
  assert.equal(f.state.user, null);
  assert.equal(f.state.sessionMode, 'signed-out');
  assert.equal(f.storage.has('user'), false);
  assert.equal(f.storage.has('bringup-auth-session-version'), false);
  assert.equal(storedCredential, null, 'the SDK must clear the session established before its queued sign-out');
});
