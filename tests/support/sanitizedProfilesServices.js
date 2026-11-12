// Only synthetic transport/Auth boundaries. Actual profile reader and consumers are bundled.
import { useSyncExternalStore } from 'react';
export const OWNER = '10000000-0000-4000-8000-000000000001';
export const TARGET = '10000000-0000-4000-8000-000000000002';
export const SECOND = '10000000-0000-4000-8000-000000000003';
const surface = new URLSearchParams(location.search).get('surface') || 'permissions';
const listeners = new Set();
const clone = value => structuredClone(value);
const settings = (level, pages) => ({ workspaceAccess: { 'pcb-designer': level, 'station-status': level, 'user-management': 'none' },
  pagePermissions: pages, performanceManager: false, futureKey: { unicode: '保留 α 🧪', explicitNull: null, falseFlag: false } });
const profile = (id, name, role, permission, index) => ({ id, username: name, display_name: `Synthetic ${name}`, role, status: 'active',
  permissions: permission, created_by: null, created_at: `2026-11-0${index}T10:00:00.000Z`, updated_at: '2026-11-12T10:00:00.000Z',
  registration_requested_at: null, approved_at: null, approved_by: null, auth_user_id: `20000000-0000-4000-8000-00000000000${index}`,
  auth_migrated_at: null, last_seen_at: null, avatar_path: null });
export const fixture = window.sanitizedProfilesFixture = {
  surface, owner: OWNER, target: TARGET, second: SECOND,
  user: { userId: OWNER, username: 'synthetic-owner', displayName: 'Synthetic owner', role: surface === 'permissions' ? 'engineer' : 'admin' },
  profiles: [profile(OWNER, 'Owner', surface === 'permissions' ? 'engineer' : 'admin', settings('edit', ['pcb_designer_view', 'pcb_designer_edit', 'dashboard_view']), 1),
    profile(TARGET, 'Target', 'engineer', settings('view', ['pcb_designer_view', 'dashboard_view']), 2),
    profile(SECOND, 'Second', 'engineer', settings('none', []), 3)],
  // This protected synthetic storage value is NOT returned by the profile RPC.
  sourceSnapshots: { [OWNER]: { privateTemplate: 'private-own-snapshot α' }, [TARGET]: { privateTemplate: 'private-other-snapshot β' } },
  modes: {}, pageMode: 'ok', saveMode: 'ok', calls: [], held: [], writes: [], rawAttempts: [], authMutations: [], toasts: [], channels: [],
  state: null, renders: [], mountCount: 0, unmountCount: 0, permissionEvents: [],
  switchUser(id = SECOND) {
    fixture.user = { userId: id, username: 'synthetic-switched', displayName: 'Synthetic switched', role: 'engineer' };
    for (const listener of listeners) listener();
  },
  resolveHeld(key, mode = 'ok') {
    const item = fixture.held.find(item => item.key === key && !item.resolved);
    if (!item) throw new Error(`No held request for ${key}`);
    item.resolved = true; item.resolve(mode === 'ok' ? clone(item.snapshot) : reply(item.key, mode));
  },
  emitRealtime(table = 'system_users', status) {
    for (const channel of fixture.channels.filter(channel => !channel.removed)) {
      if (status) channel.callback?.(status);
      else for (const entry of channel.entries) if (entry.config.table === table) entry.callback({ new: { id: OWNER, display_name: 'Synthetic updated identity' } });
    }
  },
};
const sourceSnapshots = JSON.stringify(fixture.sourceSnapshots);
fixture.assertSnapshots = () => JSON.stringify(fixture.sourceSnapshots) === sourceSnapshots;
window.addEventListener('station-permissions-updated', event => fixture.permissionEvents.push(event.detail || {}));

function reply(key, mode) {
  if (mode === 'error') return { data: null, error: { code: '42501', message: 'Synthetic profile read denied' } };
  if (mode === 'missing-rpc') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function workspace.list_system_user_profiles()' } };
  if (mode === 'missing') return { data: null, error: null };
  let data = key === 'roster' ? [...fixture.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at)) : fixture.profiles.find(row => row.id === key) || null;
  data = clone(data);
  if (mode === 'extra-secret' && data) (Array.isArray(data) ? data[0] : data).password_hash = 'SYNTHETIC REJECT ME';
  if (mode === 'raw-snapshot' && data) (Array.isArray(data) ? data[0] : data).permissions.pcbDesignerWorkspace = { privateTemplate: 'SYNTHETIC FORBIDDEN' };
  return { data, error: null };
}
function request(key) {
  const mode = fixture.modes[key] || 'ok';
  fixture.calls.push({ type: 'profiles', key, mode, actor: fixture.user.userId });
  if (mode === 'hold') return new Promise(resolve => fixture.held.push({ key, resolve, resolved: false, snapshot: reply(key, 'ok') }));
  return Promise.resolve(reply(key, mode));
}
function profileQuery() {
  let key = 'roster';
  return {
    eq(column, id) { if (column !== 'id') throw new Error('Only id profile filter allowed'); key = id; return this; },
    maybeSingle() { return request(key); },
    order(column, options) { if (column !== 'created_at' || options?.ascending !== false) throw new Error('Roster must preserve descending order'); return request('roster'); },
    then(resolve, reject) { return request(key).then(resolve, reject); },
  };
}
export const supabase = {
  schema(name) { if (name !== 'workspace') throw new Error(`Unexpected schema: ${name}`); return {
    rpc(name, args) {
      if (name !== 'list_system_user_profiles' || (args !== undefined && Object.keys(args).length)) throw new Error('Only zero-argument sanitized profile reads allowed');
      fixture.calls.push({ type: 'rpc', name, args: clone(args) }); return profileQuery();
    },
  }; },
  from(table) {
    if (table !== 'user_page_permissions') { fixture.rawAttempts.push({ table }); throw new Error('Raw system_users read/write forbidden'); }
    let userId;
    const query = { select(columns) { if (columns !== 'permission') throw new Error('Unexpected projection'); return query; },
      eq(column, id) { if (column !== 'user_id') throw new Error('Unexpected filter'); userId = id; return query; },
      then(resolve, reject) { fixture.calls.push({ type: 'pages', userId }); return Promise.resolve({
        data: [{ permission: 'admin_edit' }], error: fixture.pageMode === 'error' ? { message: 'Synthetic page read denied' } : null,
      }).then(resolve, reject); } };
    return query;
  },
  async rpc(name, args) {
    if (name !== 'set_user_access_permissions') { fixture.rawAttempts.push({ name }); throw new Error(`Unexpected mutation ${name}`); }
    fixture.calls.push({ type: 'save', name, args: clone(args) });
    if (fixture.saveMode === 'error') return { data: null, error: { message: 'Synthetic save denied; source retained' } };
    if (fixture.saveMode === 'hold') await new Promise(resolve => { fixture.finishSave = resolve; });
    const target = fixture.profiles.find(row => row.id === args.p_user_id);
    if (!target) throw new Error('Unknown synthetic target');
    fixture.writes.push({ name, args: clone(args) });
    target.permissions = { ...target.permissions, pagePermissions: clone(args.p_permissions), workspaceAccess: clone(args.p_workspace_access), performanceManager: args.p_performance_manager };
    return { data: null, error: null };
  },
  channel(name) {
    const channel = { name, entries: [], removed: false,
      on(_event, config, callback) { channel.entries.push({ config, callback }); return channel; },
      subscribe(callback) { channel.callback = callback; return channel; } };
    fixture.channels.push(channel); return channel;
  },
  async removeChannel(channel) { channel.removed = true; },
};
const getSnapshot = () => fixture.user;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function useUser() { return { user: useSyncExternalStore(subscribe, getSnapshot, getSnapshot), isRealtimeAuthenticated: true,
  logout() { fixture.authMutations.push('logout'); throw new Error('No auth mutation'); } }; }
export function toast(value) { fixture.toasts.push(value); }
export function useToast() { return { toast }; }
export const REALTIME_COLLABORATION_V2_ENABLED = true;
export async function mutateAuthAccount() { fixture.rawAttempts.push({ accountMutation: true }); throw new Error('Account mutation is out of scope'); }
