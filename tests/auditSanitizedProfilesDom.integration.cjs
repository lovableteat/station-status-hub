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

test('actual dialog DOM exposes retry only after failed read and recovers without enabling stale save', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.invalid/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const wrap = ({ children }) => React.createElement('div', null, children);
  const button = ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children);
  let pending = deferred(), closed = 0, writes = 0;
  const toast = () => {};
  const db = attachProfileRpc(database(q => {
    if (q.method === 'rpc') writes++;
    assert.equal(q.table, 'user_page_permissions'); return { data: [], error: null };
  }), () => pending.promise);
  const load = loader({ window: dom.window, globals: { document: dom.window.document }, mocks: {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': { Save: () => null, Shield: () => null, X: () => null },
    '@/components/ui/button': { Button: button }, '@/components/ui/badge': { Badge: wrap },
    '@/components/ui/checkbox': { Checkbox: () => null }, '@/components/ui/label': { Label: wrap },
    '@/components/ui/radio-group': { RadioGroup: wrap, RadioGroupItem: () => null },
    '@/components/ui/dialog': { Dialog: wrap, DialogContent: wrap, DialogDescription: wrap, DialogHeader: wrap, DialogTitle: wrap },
    '@/components/auth/UserContext': { useUser: () => ({ user: { userId: 'actor', username: 'Synthetic' } }) },
    '@/integrations/supabase/client': { supabase: db }, '@/hooks/use-toast': { useToast: () => ({ toast }) },
  } });
  const { UserPermissionsDialog } = load('src/components/admin/UserPermissionsDialog.tsx');
  const root = createRoot(dom.window.document.getElementById('root'));
  const find = text => [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === text);
  const footer = () => dom.window.document.querySelector('.admin-permissions-footer');
  try {
    await React.act(async () => root.render(React.createElement(UserPermissionsDialog, { isOpen: true, userId: 'target', username: 'Synthetic', onClose: () => closed++ })));
    assert.equal(find('儲存權限').disabled, true); assert.equal(footer().hasAttribute('data-load-retry'), false);
    await React.act(async () => pending.resolve({ data: null, error: { code: '42501' } }));
    assert.equal(footer().getAttribute('data-load-retry'), 'true');
    assert.equal(find('重新載入權限').disabled, false); assert.equal(find('取消').disabled, false);
    assert.equal(find('儲存權限').disabled, true); assert.equal(writes, 0);
    await React.act(async () => find('取消').click()); assert.equal(closed, 1);
    pending = deferred();
    await React.act(async () => find('重新載入權限').click());
    assert.equal(find('儲存權限').disabled, true); assert.equal(footer().hasAttribute('data-load-retry'), false);
    await React.act(async () => pending.resolve({ data: profile('target', { permissions: { pagePermissions: [], workspaceAccess: {} } }), error: null }));
    assert.equal(find('重新載入權限'), undefined); assert.equal(footer().hasAttribute('data-load-retry'), false);
    assert.equal(find('儲存權限').disabled, false); assert.equal(writes, 0);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
