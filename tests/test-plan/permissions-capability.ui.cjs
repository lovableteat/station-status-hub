const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader, flush, database, deferred } = require('../support/renderHarness.cjs');

function fixture(profiles, user = { userId: 'account-a', role: 'engineer' }) {
  const session = { user };
  const db = database(async query => {
    if (query.table === 'user_page_permissions') return { data: [], error: null };
    assert.equal(query.table, 'system_users');
    const profile = profiles.get(query.filters.id);
    return profile?.then ? profile : { data: profile ?? null, error: null };
  });
  const load = loader({ mocks: {
    '@/components/auth/UserContext': { useUser: () => session },
    '@/integrations/supabase/client': { supabase: db },
  } });
  const { PermissionsProvider, usePermissions } = load('src/hooks/usePermissions.ts');
  let current;
  function Probe() { current = usePermissions(); return null; }
  function App() { return React.createElement(PermissionsProvider, null, React.createElement(Probe)); }
  return { session, db, App, get current() { return current; } };
}
const profile = (role, status = 'active') => ({ role, status, permissions: { workspaceAccess: { 'station-status': 'edit' } } });

test('administrator capability follows the verified active database role independently of the browser session role', async () => {
  const profiles = new Map([['account-a', profile('engineer')]]);
  const f = fixture(profiles, { userId: 'account-a', role: 'admin' });
  let tree;
  await act(async () => { tree = create(React.createElement(f.App)); }); await flush();
  assert.equal(f.current.isAdmin, false, 'cached administrator text cannot grant administrator capability');
  assert.equal(f.current.canEditModule('test-plan'), true, 'ordinary workspace edit access is distinct from administrator capability');
  f.session.user.role = 'engineer';
  for (const role of ['admin', 'super_admin']) {
    profiles.set('account-a', profile(role));
    await act(async () => f.db.channels[0].emit('system_users', { new: profiles.get('account-a') })); await flush();
    assert.equal(f.current.isAdmin, true);
    assert.equal(f.session.user.role, 'engineer', 'canonical capability must not depend on session role refresh');
  }
  profiles.set('account-a', profile('engineer'));
  await act(async () => f.db.channels[0].emit('system_users', { new: profiles.get('account-a') })); await flush();
  assert.equal(f.current.isAdmin, false, 'demotion revokes the exposed capability');
  profiles.set('account-a', profile('admin', 'disabled'));
  await act(async () => f.db.channels[0].emit('system_users', { new: profiles.get('account-a') })); await flush();
  assert.equal(f.current.isAdmin, false, 'inactive administrators have no administrator capability');
  assert.equal(f.current.canEditModule('test-plan'), false);
  await act(async () => tree.unmount());
});

test('late administrator responses cannot restore capability after switching accounts', async () => {
  const pending = deferred();
  const profiles = new Map([['account-a', pending.promise], ['account-b', profile('engineer')]]);
  const f = fixture(profiles);
  let tree;
  await act(async () => { tree = create(React.createElement(f.App)); }); await flush();
  assert.equal(f.current.isAdmin, false, 'capability starts closed while the account has not been verified');
  f.session.user = { userId: 'account-b', role: 'admin' };
  await act(async () => tree.update(React.createElement(f.App))); await flush();
  assert.equal(f.current.isAdmin, false);
  await act(async () => pending.resolve({ data: profile('admin'), error: null })); await flush();
  assert.equal(f.current.isAdmin, false, 'previous account responses must be ignored');
  await act(async () => tree.unmount());
});

test('permission lookup failures fail closed instead of restoring cached administrator roles', async () => {
  const profiles = new Map([['account-a', profile('admin')]]);
  const f = fixture(profiles, { userId: 'account-a', role: 'admin' });
  let tree;
  await act(async () => { tree = create(React.createElement(f.App)); }); await flush();
  assert.equal(f.current.isAdmin, true);
  profiles.set('account-a', Promise.resolve({ data: null, error: { message: 'permission lookup failed' } }));
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    await act(async () => f.db.channels[0].emit('system_users', {})); await flush();
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.equal(f.current.isAdmin, false);
  assert.equal(f.current.canEditModule('test-plan'), false);
  await act(async () => tree.unmount());
});
