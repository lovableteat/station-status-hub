const test = require('node:test');
const assert = require('node:assert/strict');
const { React, act, create, deferred, browser, database, loader, flush } = require('./support/renderHarness.cjs');
const { profile, attachProfileRpc } = require('./support/sanitizedProfiles.cjs');
const ok = data => ({ data, error: null });
const settings = { pagePermissions: ['dashboard_view', 'dashboard_edit'], workspaceAccess: { 'station-status': 'edit' } };
async function providerHarness() {
  let user = { userId: 'A' }, current, run = q => ok(profile(q.filters.id, { permissions: settings }));
  let pages = () => ok([]), tick;
  const db = attachProfileRpc(database(q => {
    assert.equal(q.table, 'user_page_permissions'); return pages(q);
  }), q => run(q));
  const win = browser(); win.setInterval = fn => { tick = fn; return 1; }; win.clearInterval = () => {};
  const load = loader({ window: win, mocks: { '@/components/auth/UserContext': { useUser: () => ({ user }) }, '@/integrations/supabase/client': { supabase: db } } });
  const { PermissionsProvider, usePermissions } = load('src/hooks/usePermissions.ts');
  let mounts = 0;
  function Probe() { current = usePermissions(); React.useEffect(() => { mounts++; }, []); return null; }
  const element = () => React.createElement(PermissionsProvider, null, React.createElement(Probe));
  let root; await act(async () => { root = create(element()); }); await flush();
  return { db, win, get current() { return current; }, get mounts() { return mounts; },
    run: fn => { run = fn; }, pages: fn => { pages = fn; }, tick: () => tick(),
    async account(id) { user = { userId: id }; await act(async () => root.update(element())); await flush(); },
    async close() { await act(async () => root.unmount()); },
  };
}
test('actual permissions provider preserves stored-page precedence and refreshes from sanitized RPC', async () => {
  const h = await providerHarness();
  try {
    assert.equal(h.current.canEditModule('dashboard'), true);
    h.pages(() => ({ data: null, error: { code: '42501' } }));
    h.run(q => ok(profile(q.filters.id, { permissions: { ...settings, pagePermissions: [] } })));
    await act(async () => h.tick()); await flush();
    assert.equal(h.current.canEditModule('dashboard'), false);
    assert.equal(h.current.canViewModule('dashboard'), false, 'explicit empty stored pages override stale legacy rows');
    h.run(q => ok(profile(q.filters.id, { permissions: {} })));
    await act(async () => h.current.reloadPermissions());
    assert.equal(h.current.canViewModule('dashboard'), false, 'legacy read error cannot invent access');
    assert.equal(h.db.reads.every(q => q.table === 'user_page_permissions'), true);
  } finally { await h.close(); }
});
test('background pending refresh does not unmount provider children; denied and malformed data fail closed', async () => {
  const h = await providerHarness(); const wait = deferred();
  try {
    h.run(() => wait.promise); await act(async () => h.tick()); await flush();
    assert.equal(h.current.loading, false); assert.equal(h.mounts, 1);
    await act(async () => wait.resolve({ data: null, error: { code: '42501' } })); await flush();
    assert.equal(h.current.canViewModule('dashboard'), false);
    h.run(q => ok(profile(q.filters.id, { role: 'admin', permissions: { pcbDesignerWorkspace: { synthetic: true } } })));
    await act(async () => h.current.reloadPermissions());
    assert.equal(h.current.isAdmin, false, 'malformed/snapshot-bearing profile cannot grant admin');
    assert.equal(h.mounts, 1, 'provider itself does not reload or remount children; module gates are a separate cutover concern');
  } finally { await h.close(); }
});
test('account switch fences late sanitized success and failure and all refresh signals use RPC', async () => {
  const h = await providerHarness(); const wait = deferred();
  try {
    h.run(() => wait.promise); let old; await act(async () => { old = h.current.reloadPermissions(); });
    h.run(q => ok(profile(q.filters.id, { role: 'viewer', permissions: { pagePermissions: [] } })));
    await h.account('B');
    await act(async () => { wait.resolve(ok(profile('A', { role: 'admin' }))); await old; });
    assert.equal(h.current.isAdmin, false); assert.equal(h.current.canViewModule('dashboard'), false);
    const before = h.db.profileReads.length;
    await act(async () => {
      h.win.dispatchEvent(new Event('focus')); h.win.dispatchEvent(new Event('online'));
      h.win.dispatchEvent(new CustomEvent('station-permissions-updated', { detail: { userId: 'B' } }));
      const channel = h.db.channels.find(c => !c.removed);
      channel.emit('system_users', { new: { id: 'B' } }); channel.status('SUBSCRIBED');
    }); await flush();
    assert.ok(h.db.profileReads.length >= before + 5);
    assert.equal(h.db.profileReads.slice(before).every(q => q.filters.id === 'B'), true);
  } finally { await h.close(); }
});
async function dialogHarness() {
  let actor = { userId: 'actor-A', username: 'Synthetic admin' }, target = 'A', isOpen = true;
  let read = q => ok(profile(q.filters.id, { permissions: settings })); let save = () => ok(null);
  const writes = [], toasts = []; let closed = 0;
  const db = attachProfileRpc(database(q => {
    if (q.method === 'rpc') { assert.equal(q.table, 'set_user_access_permissions'); writes.push(q.args); return save(q); }
    assert.equal(q.table, 'user_page_permissions'); return ok([]);
  }), q => read(q));
  const toast = value => toasts.push(value);
  const load = loader({ mocks: { '@/components/auth/UserContext': { useUser: () => ({ user: actor }) }, '@/integrations/supabase/client': { supabase: db }, '@/hooks/use-toast': { useToast: () => ({ toast }) } } });
  const { UserPermissionsDialog } = load('src/components/admin/UserPermissionsDialog.tsx');
  const element = () => React.createElement(UserPermissionsDialog, { isOpen, userId: target, username: target, onClose: () => { closed++; } });
  let root; await act(async () => { root = create(element()); }); await flush();
  const saveButton = () => root.root.findAll(n => n.type === 'stub' && typeof n.props.onClick === 'function' && String(n.props.children).includes('儲存')).at(-1)
    || root.root.findAll(n => n.type === 'stub' && typeof n.props.onClick === 'function').at(-1);
  return { db, writes, toasts, get closed() { return closed; }, saveButton,
    read: fn => { read = fn; }, save: fn => { save = fn; },
    async target(id) { target = id; await act(async () => root.update(element())); await flush(); },
    async actor(id) { actor = { ...actor, userId: id }; await act(async () => root.update(element())); await flush(); },
    async dismiss() { isOpen = false; await act(async () => root.update(element())); await flush(); },
    async close() { await act(async () => root.unmount()); },
  };
}
test('actual permissions dialog blocks new target until sanitized read and ignores old response', async () => {
  const h = await dialogHarness(); const old = deferred(), latest = deferred();
  try {
    const previousTargetSave = h.saveButton().props.onClick;
    h.read(q => q.filters.id === 'B' ? old.promise : latest.promise);
    await h.target('B'); assert.equal(h.saveButton().props.disabled, true);
    await act(async () => previousTargetSave()); assert.equal(h.writes.length, 0, 'retained handler cannot save an old target after replacement');
    await act(async () => h.saveButton().props.onClick()); assert.equal(h.writes.length, 0);
    await h.target('C');
    await act(async () => old.resolve(ok(profile('B', { permissions: settings })))); await flush();
    assert.equal(h.saveButton().props.disabled, true);
    await act(async () => latest.resolve(ok(profile('C', { permissions: settings })))); await flush();
    assert.equal(h.saveButton().props.disabled, false);
    await act(async () => h.saveButton().props.onClick());
    assert.equal(h.writes[0].p_user_id, 'C');
    assert.deepEqual(Object.keys(h.writes[0]).sort(), ['p_granted_by','p_performance_manager','p_permissions','p_user_id','p_workspace_access']);
    assert.equal(h.closed, 1);
  } finally { await h.close(); }
});
test('dialog actor switch and read failure disable configuration without raw fallback', async () => {
  const h = await dialogHarness(); const wait = deferred();
  try {
    const previousActorSave = h.saveButton().props.onClick;
    h.read(() => wait.promise); await h.actor('actor-B'); assert.equal(h.saveButton().props.disabled, true);
    await act(async () => previousActorSave()); assert.equal(h.writes.length, 0, 'retained old-actor handler cannot submit under the replacement session');
    await act(async () => h.saveButton().props.onClick()); assert.equal(h.writes.length, 0);
    await act(async () => wait.resolve({ data: null, error: { code: 'PGRST202' } })); await flush();
    assert.equal(h.saveButton().props.disabled, true); assert.equal(h.toasts.at(-1).title, '權限載入失敗');
    await h.dismiss(); await act(async () => h.saveButton().props.onClick()); assert.equal(h.writes.length, 0);
  } finally { await h.close(); }
});
test('late successful permission save cannot close or reset a different target dialog', async () => {
  const h = await dialogHarness(); const wait = deferred();
  try {
    h.save(() => wait.promise); let saving; await act(async () => { saving = h.saveButton().props.onClick(); });
    await h.target('B'); assert.equal(h.saveButton().props.disabled, false);
    await act(async () => { wait.resolve(ok(null)); await saving; });
    assert.equal(h.closed, 0); assert.equal(h.toasts.length, 0); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].p_user_id, 'A');
  } finally { await h.close(); }
});
