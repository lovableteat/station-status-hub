// Actual React DOM/provider with synthetic transport; not hosted Auth or a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader, database, deferred } = require('./support/renderHarness.cjs');
const { profile, attachProfileRpc } = require('./support/sanitizedProfiles.cjs');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '/tmp/station-release-qa', 'package.json'));
const { JSDOM } = qa('jsdom');

test('actual DOM permission refresh retains mounted memory draft and denies access without cached grants', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.invalid/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(dom.window.document, 'visibilityState', { value: 'visible' });
  let tick; dom.window.setInterval = fn => { tick = fn; return 1; }; dom.window.clearInterval = () => {};
  let run = q => ({ data: profile(q.filters.id, { permissions: { pagePermissions: ['dashboard_view'], workspaceAccess: { 'station-status': 'view' } } }), error: null });
  const db = attachProfileRpc(database(q => {
    assert.equal(q.table, 'user_page_permissions'); return { data: [], error: null };
  }), q => run(q));
  const load = loader({ window: dom.window, globals: { document: dom.window.document }, mocks: {
    react: React, '@/components/auth/UserContext': { useUser: () => ({ user: { userId: 'owner' } }) }, '@/integrations/supabase/client': { supabase: db },
  } });
  const { PermissionsProvider, usePermissions } = load('src/hooks/usePermissions.ts');
  let permissions, edit, mounts = 0;
  function Editor() {
    permissions = usePermissions(); const [draft, setDraft] = React.useState('Original'); edit = setDraft;
    React.useEffect(() => { mounts++; }, []);
    return React.createElement('div', null, React.createElement('textarea', { value: draft, onChange: e => setDraft(e.target.value) }),
      React.createElement('button', { disabled: !permissions.canViewModule('dashboard') }, 'Authorized action'));
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(PermissionsProvider, null, React.createElement(Editor))));
    const textarea = dom.window.document.querySelector('textarea');
    await React.act(async () => edit('未儲存草稿'));
    assert.equal(textarea.value, '未儲存草稿');
    const wait = deferred(); run = () => wait.promise;
    await React.act(async () => tick());
    assert.equal(permissions.loading, false); assert.equal(dom.window.document.querySelector('textarea'), textarea);
    await React.act(async () => wait.resolve({ data: null, error: { code: '42501' } }));
    assert.equal(dom.window.document.querySelector('button').disabled, true);
    assert.equal(textarea.value, '未儲存草稿'); assert.equal(mounts, 1);
    assert.equal(permissions.canViewModule('dashboard'), false);
    run = q => ({ data: profile(q.filters.id, { permissions: { pagePermissions: [], workspaceAccess: { 'station-status': 'none' } } }), error: null });
    await React.act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(dom.window.document.querySelector('button').disabled, true);
    assert.equal(dom.window.document.querySelector('textarea'), textarea);
    assert.equal(db.reads.every(q => q.table === 'user_page_permissions'), true);
    // The provider does not unmount its children. A separate module authorization
    // gate can still unmount an editor and remains a deployment checkpoint.
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
