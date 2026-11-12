// Synthetic transport boundary only. Production PCB adapter/hooks are not mocked.
import { useSyncExternalStore } from 'react';
import { createBlankProject } from '../../src/components/pcb-designer/defaults.ts';
import { PCB_STORAGE_KEY, pcbOwnerStorageKey, isPcbSaveState } from '../../src/components/pcb-designer/core/storage.ts';

export const USER_ID = '10000000-0000-4000-8000-000000000001';
export const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
export const RECOVERY_CLIENT_ID = 'pcb-browser-synthetic-recovery';
export const RECOVERY_KEY = `${PCB_STORAGE_KEY}:draft:${USER_ID}:${RECOVERY_CLIENT_ID}`;
export const DRAFT = '合成 PCB 未儲存草稿 α 🧪 | do not replace';
const params = new URLSearchParams(location.search);
const initial = params.get('scenario') || 'healthy';
const project = createBlankProject('Synthetic preserved PCB');
project.id = 'synthetic-pcb-project';
project.description = DRAFT;
project.updatedAt = '2026-11-12T10:01:00.000Z';
project.board.holes = [[{ x: 60, y: 50 }, { x: 65, y: 50 }, { x: 65, y: 55 }, { x: 60, y: 55 }]];
const component = {
  id: 'synthetic-library-component', name: 'Synthetic recovery component', type: 'Other',
  manufacturer: 'SYNTHETIC ONLY', partNumber: 'TEST-NOT-A-REAL-PART',
  width: 8, height: 5, maxHeight: 3, color: '#39c6e8', shape: 'rectangle',
  source: 'custom', createdAt: project.updatedAt,
};
project.components = [{ ...component, instanceId: 'synthetic-placement', reference: 'TEST1',
  x: 20, y: 20, rotation: 90, layer: 'bottom', locked: false, insertionDepth: 0,
  keepout: { top: 1, right: 1, bottom: 1, left: 1 } }];
project.keepouts = [{ id: 'synthetic-keepout', name: 'Synthetic keepout', x: 40, y: 20, width: 10, height: 8, color: '#ff0000' }];
project.measurements = [{ id: 'synthetic-measurement', x1: 10, y1: 10, x2: 30, y2: 10, color: '#ffffff' }];
const seed = {
  projects: [project], templates: [], library: [component], activeProjectId: project.id,
  modelAssets: {}, pendingPlacementsByProject: {},
  remoteDeletions: { projects: [], templates: [], library: [] },
  updatedAt: project.updatedAt,
};
if (!isPcbSaveState(seed)) throw new Error('The synthetic recovery payload must pass production validation');
const baseline = structuredClone(seed);
baseline.projects[0].description = 'Synthetic saved baseline';
baseline.updatedAt = '2026-11-12T10:00:00.000Z';
const recovery = { version: 1, state: seed, savedRevision: baseline.updatedAt };
const legacyOwn = structuredClone(baseline);
legacyOwn.projects[0].updatedAt = baseline.updatedAt;
legacyOwn.projects[0].description = 'OLDER LEGACY VALUE MUST NOT REPLACE DIRTY DRAFT';
legacyOwn.templates = [{ id: 'own-private-template', name: 'Synthetic own private template', category: 'Synthetic',
  description: 'OWN PRIVATE α', isBuiltIn: false, createdAt: baseline.updatedAt, updatedAt: baseline.updatedAt, project: structuredClone(legacyOwn.projects[0]) }];
legacyOwn.modelAssets = { own: { id: 'own', fileName: 'OWN PRIVATE.model', createdAt: baseline.updatedAt, updatedAt: baseline.updatedAt } };
legacyOwn.pendingPlacementsByProject = { [project.id]: [{ ...component, reference: 'OWN-PENDING', quantity: 2 }] };
legacyOwn.privateFutureField = 'OWN PRIVATE UNKNOWN 🧪';
if (!isPcbSaveState(legacyOwn)) throw new Error('Synthetic own legacy snapshot must validate');
const sharedProject = structuredClone(legacyOwn.projects[0]);
sharedProject.id = 'synthetic-shared-project'; sharedProject.name = 'Synthetic shared board'; sharedProject.description = 'SHARED PROJECT ONLY';
const deletedProject = { ...structuredClone(sharedProject), id: 'synthetic-deleted-project' };
const sharedComponent = { ...component, id: 'synthetic-shared-component', name: 'Synthetic shared BOM', source: 'bom' };
const catalog = [
  { projects: [structuredClone(legacyOwn.projects[0]), sharedProject, deletedProject], library: [component, sharedComponent],
    updatedAt: baseline.updatedAt, remoteDeletions: { projects: [], library: [] } },
  { projects: [{ ...structuredClone(sharedProject), description: 'NEWER SHARED REVISION', updatedAt: '2026-11-12T10:00:30.000Z' }],
    library: [{ ...sharedComponent, name: 'Synthetic newer shared BOM' }], updatedAt: '2026-11-12T10:00:30.000Z',
    remoteDeletions: { projects: ['synthetic-deleted-project'], library: [] } },
];
const legacyEnvelope = { schemaVersion: 1, ownSnapshotPresent: true, ownSnapshot: legacyOwn, sharedCatalog: catalog };
const values = new Map([
  [PCB_STORAGE_KEY, JSON.stringify({ version: 1, state: baseline })],
  [pcbOwnerStorageKey(USER_ID), JSON.stringify({ version: 1, state: baseline })],
  [RECOVERY_KEY, JSON.stringify(recovery)],
  ['unrelated-synthetic-sentinel', 'keep exact bytes\t\u0000🧪 {"partial":'],
]);
const events = new Set();
const userListeners = new Set();
const subscribeUser = callback => { userListeners.add(callback); return () => userListeners.delete(callback); };
const getUser = () => fixture.user;
let serial = 0;
export const fixture = window.pcbRecoveryFixture = {
  scenario: initial, seed, baseline, recoveryKey: RECOVERY_KEY, legacyEnvelope, legacyOwn,
  draft: DRAFT, userId: USER_ID, otherUserId: OTHER_USER_ID, mounted: 0, unmounted: 0, state: null,
  user: { userId: USER_ID, username: 'synthetic-editor', displayName: 'Synthetic editor', role: 'user' },
  renders: [],
  calls: [], held: [], storageWrites: [], storageReads: [], storageFailures: [], storageFailure: false, storageReadFailure: false, destructiveWrites: [],
  toasts: [], sessionReads: 0, permissionsReads: 0, authMutations: [],
  controls: { load: initial === 'rpc401' ? '401' : initial === 'rpc42501' ? '42501' : initial === 'view-denied' ? 'view-denied' : 'ok',
    lock: initial === 'rpc401' ? '401' : initial === 'rpc42501' ? '42501' : 'ok', save: 'ok', legacy: params.get('legacyMode') || 'ok' },
  session: initial === 'missing' ? null : {
    access_token: 'synthetic-token-1', refresh_token: 'synthetic-refresh-1',
    expires_at: Math.floor(Date.now() / 1000) + (initial === 'expired' ? -60 : 3600),
    user: { id: '20000000-0000-4000-8000-000000000001', app_metadata: {} },
  },
  storage: {
    getItem(key) { fixture.storageReads.push(key); if (fixture.storageReadFailure) throw new Error('Synthetic storage unavailable'); return values.get(key) ?? null; },
    setItem(key, value) {
      // Browser storage is never used. Even this synthetic repository may not
      // erase the baseline/recovery or touch an unrelated key in these tests.
      const allowed = [pcbOwnerStorageKey(USER_ID), RECOVERY_KEY];
      if (params.get('surface') === 'guard') allowed.push(pcbOwnerStorageKey(OTHER_USER_ID), `${PCB_STORAGE_KEY}:draft:${OTHER_USER_ID}:${RECOVERY_CLIENT_ID}`);
      if (!allowed.includes(key) || !value) {
        fixture.destructiveWrites.push({ key, value });
        throw new Error('Synthetic fixture forbids destructive storage writes');
      }
      if (fixture.storageFailure) { fixture.storageFailures.push(key); throw new Error('Synthetic storage quota/unavailable'); }
      JSON.parse(value);
      fixture.storageWrites.push({ key, value });
      values.set(key, value);
    },
  },
  storageSnapshot() { return Object.fromEntries(values); },
  renewSession(event = 'TOKEN_REFRESHED') {
    fixture.session = {
      access_token: `synthetic-token-${++serial + 1}`, refresh_token: 'synthetic-refresh-1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '20000000-0000-4000-8000-000000000001', app_metadata: {} },
    };
    for (const callback of events) callback(event, fixture.session);
  },
  expireSession() {
    fixture.session = null;
    for (const callback of events) callback('SIGNED_OUT', null);
  },
  switchActor() {
    fixture.user = { userId: OTHER_USER_ID, username: 'synthetic-editor-b', displayName: 'Synthetic editor B', role: 'user' };
    fixture.session = {
      access_token: 'synthetic-account-b-token', refresh_token: 'synthetic-account-b-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '20000000-0000-4000-8000-000000000002', app_metadata: {} },
    };
    for (const callback of events) callback('SIGNED_IN', fixture.session);
    for (const callback of userListeners) callback();
  },
  resolveHeld(kind, index = 0, mode = 'ok') {
    const held = fixture.held.filter(item => item.kind === kind && !item.resolved)[index];
    if (!held) throw new Error(`No pending synthetic ${kind} request ${index}`);
    held.resolved = true;
    held.resolve(response(held.name, held.args, mode));
  },
};

if (params.has('loadMode')) fixture.controls.load = params.get('loadMode');
if (params.get('surface') === 'guard') {
  const otherSeed = structuredClone(seed);
  otherSeed.projects[0].id = 'synthetic-other-owner-project';
  otherSeed.projects[0].name = 'Synthetic independent other owner';
  otherSeed.projects[0].description = 'OTHER OWNER INDEPENDENT DRAFT β';
  otherSeed.activeProjectId = otherSeed.projects[0].id;
  fixture.otherOwnerSeed = otherSeed;
  values.set(`${PCB_STORAGE_KEY}:draft:${OTHER_USER_ID}:${RECOVERY_CLIENT_ID}`, JSON.stringify({ version: 1, state: otherSeed, savedRevision: baseline.updatedAt }));
  values.set(pcbOwnerStorageKey(OTHER_USER_ID), JSON.stringify({ version: 1, state: otherSeed }));
}

function response(name, args, mode) {
  // The unchanged backend permission checks use P0001, not 42501. Deliberately
  // omit HTTP status so only these exact production messages identify denial.
  if (mode === 'view-denied' || mode === 'edit-denied') return {
    data: null,
    error: { code: 'P0001', message: mode === 'view-denied'
      ? 'PCB workspace access denied' : 'PCB workspace edit access denied' },
  };
  if (mode === '401' || mode === '42501') return {
    data: null,
    error: { code: mode === '401' ? 'PGRST301' : '42501', status: mode === '401' ? 401 : 403, message: 'Synthetic authorization denied' },
  };
  if (mode === 'missing-rpc') return { data: null, error: { code: 'PGRST202', message: `Could not find the function workspace.${name}()` } };
  if (mode === 'helper-missing') return { data: null, error: { code: '42883', message: 'function workspace.internal_helper() does not exist' } };
  if (mode === 'transport') return { data: null, error: { message: 'Synthetic transport unavailable' } };
  if (name === 'load_pcb_designer_legacy_workspace') {
    if (Object.keys(args || {}).length) throw new Error('Protected legacy retrieval must not select an owner');
    const envelope = structuredClone(legacyEnvelope);
    if (mode === 'absent') { envelope.ownSnapshotPresent = false; envelope.ownSnapshot = null; }
    if (mode === 'null') envelope.ownSnapshot = null;
    if (mode === 'malformed') envelope.ownSnapshot = { projects: 'invalid synthetic snapshot' };
    if (mode === 'future') envelope.schemaVersion = 2;
    if (mode === 'private-catalog') envelope.sharedCatalog[1].templates = [{ name: 'OTHER PRIVATE MUST NOT LEAVE SERVER' }];
    if (mode === 'inconsistent-absence') envelope.ownSnapshotPresent = false;
    return { data: envelope, error: null };
  }
  if (name.startsWith('load_pcb_designer_workspace')) {
    const state = structuredClone(baseline);
    state.projects[0].description = mode === 'stale' ? 'STALE CLOUD RESPONSE MUST NOT REPLACE DRAFT' : 'Synthetic cloud baseline';
    state.projects[0].updatedAt = '2027-01-01T00:00:00.000Z';
    state.updatedAt = state.projects[0].updatedAt;
    return { data: mode === 'empty' ? null : mode === 'malformed' ? { projects: 'invalid modern response' } : state, error: null };
  }
  if (/^(acquire|load)_pcb_designer_project_lock$/.test(name)) return {
    data: { available: true, acquired: true, lock: {
      projectId: args.p_project_id, projectName: args.p_project_name || project.name,
      editorUserId: USER_ID, editorClientId: args.p_editor_client_id || fixture.clientId,
      editorUsername: 'synthetic-editor', editorDisplayName: 'Synthetic editor',
      heartbeatAt: new Date().toISOString(), leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
    } }, error: null,
  };
  if (name === 'list_pcb_designer_model_assets') return { data: [], error: null };
  return { data: true, error: null };
}

const database = {
  rpc(name, args) {
    const kind = name === 'load_pcb_designer_legacy_workspace' ? 'legacy' : name.startsWith('load_pcb_designer_workspace') ? 'load'
      : /^(acquire|load)_pcb_designer_project_lock$/.test(name) ? 'lock'
        : name.startsWith('save_pcb_designer_workspace') ? 'save' : 'other';
    fixture.calls.push({ name, args: structuredClone(args), session: fixture.session?.access_token ?? null,
      actor: fixture.session?.user.id ?? null });
    // Only explicitly allowlisted RPCs can reach even the synthetic service.
    if (!['load_pcb_designer_workspace_shared', 'load_pcb_designer_workspace', 'load_pcb_designer_legacy_workspace',
      'acquire_pcb_designer_project_lock', 'load_pcb_designer_project_lock',
      'release_pcb_designer_project_lock', 'save_pcb_designer_workspace_locked',
      'save_pcb_designer_workspace_shared', 'save_pcb_designer_workspace',
      'list_pcb_designer_model_assets'].includes(name)) throw new Error(`Unexpected synthetic RPC: ${name}`);
    const mode = fixture.controls[kind] || 'ok';
    if (mode === 'hold') return new Promise(resolve => fixture.held.push({ kind, name, args: structuredClone(args), resolve, resolved: false }));
    return Promise.resolve(response(name, args, mode));
  },
  from() { fixture.permissionsReads++; throw new Error('Direct permissions fallback is forbidden in this fixture'); },
};

export const supabase = {
  schema(name) { if (name !== 'workspace') throw new Error(`Unexpected schema ${name}`); return database; },
  auth: {
    async getSession() { fixture.sessionReads++; return { data: { session: fixture.session }, error: null }; },
    onAuthStateChange(callback) { events.add(callback); return { data: { subscription: { unsubscribe() { events.delete(callback); } } } }; },
    async signOut() { fixture.authMutations.push('signOut'); throw new Error('No fixture auth mutation'); },
    async setSession() { fixture.authMutations.push('setSession'); throw new Error('No fixture auth mutation'); },
  },
};
export function useUser() {
  const user = useSyncExternalStore(subscribeUser, getUser, getUser);
  return { user,
    sessionMode: fixture.session ? 'authenticated' : 'signed-out', isAuthenticated: Boolean(fixture.session) };
}
export function usePermissions() { return { canEditModule: () => true, canViewModule: () => true }; }
export function toast(value) { fixture.toasts.push(value); }
export function usePcbProjectPresence() {
  return { connected: false, workspaceConnected: false, peers: [], workspacePeers: [], broadcastProjectSaved: async () => false };
}
