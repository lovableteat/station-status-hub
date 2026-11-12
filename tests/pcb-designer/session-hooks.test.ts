import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { UsePcbWorkspaceOptions } from "../../src/components/pcb-designer/hooks/usePcbWorkspace.ts";
import type { UsePcbPersistenceOptions } from "../../src/components/pcb-designer/hooks/usePcbPersistence.ts";
import { PcbLocalRepository, PCB_STORAGE_KEY, pcbOwnerStorageKey } from "../../src/components/pcb-designer/core/storage.ts";
import * as pcbStorage from "../../src/components/pcb-designer/core/storage.ts";
import { createPcbAccountRemoteClient, type PcbAccountDatabase } from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";
import { envelope, LEGACY_KEY } from "./legacy-fixtures.ts";
import type { PcbSession, PcbSessionSource } from "../../src/components/pcb-designer/core/remoteAccess.ts";

const qa = createRequire(`${process.env.AUDIT_QA_DIR ?? "/tmp/station-release-qa"}/package.json`);
const { JSDOM } = qa("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://synthetic.invalid/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { loader } = createRequire(import.meta.url)("../support/renderHarness.cjs");
const load = loader({ window: dom.window, mocks: { react: React, "../core/storage.ts": pcbStorage, "@/hooks/use-toast": { toast: () => undefined } } });
const { usePcbWorkspace } = load("src/components/pcb-designer/hooks/usePcbWorkspace.ts");
const { usePcbPersistence } = load("src/components/pcb-designer/hooks/usePcbPersistence.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const editor = { userId: owner, username: "Synthetic", displayName: "Synthetic" };
const recoveryClientId = "synthetic-recovery";
const session = (): PcbSession => ({ access_token: "synthetic", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "synthetic-auth" } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function localDraft() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const project = { ...createBlankProject("Preserved synthetic draft"), updatedAt: "2026-11-12T03:00:00.000Z" };
  const state: PcbSaveState = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  const repository = new PcbLocalRepository(storage);
  repository.save(state, owner);
  repository.saveRecovery(owner, state, "2026-11-12T01:00:00.000Z", recoveryClientId);
  return { state, storage, repository };
}
function cloud() {
  let current: PcbSession | null = session();
  let denied = false;
  let permissionFailure: { rpc: string; message: string } | null = null;
  let rpcFailure: { error: unknown; throws: boolean } | null = null;
  let load: () => Promise<unknown> = async () => null;
  let legacyLoad: (() => Promise<unknown>) | null = null;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const listeners = new Set<(event: string, value: PcbSession | null) => void>();
  const auth: PcbSessionSource = {
    getSession: async () => ({ data: { session: current }, error: null }),
    onAuthStateChange: callback => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; },
  };
  const database = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (rpcFailure?.throws) throw rpcFailure.error;
      if (rpcFailure) return { data: null, error: rpcFailure.error };
      if (denied) return { data: null, error: { code: "42501", message: "denied" } };
      if (name === "load_pcb_designer_workspace_shared" && legacyLoad) return { data: null, error: { code: "PGRST202", message: "Could not find the function workspace.load_pcb_designer_workspace_shared(p_user_id) in the schema cache" } };
      if (name === "load_pcb_designer_legacy_workspace") return { data: await legacyLoad?.(), error: null };
      if (permissionFailure?.rpc === name) return { data: null, error: { code: "P0001", message: permissionFailure.message } };
      return { error: null, data: name === "load_pcb_designer_workspace_shared" ? await load()
        : name.includes("project_lock") ? { available: true, acquired: true, lock: null } : true };
    },
    from: () => { throw new Error("Forbidden permissions fallback"); },
  } as unknown as PcbAccountDatabase;
  return {
    client: createPcbAccountRemoteClient(database, owner, "synthetic-tab", auth), calls,
    deny: (next: boolean) => { denied = next; },
    failAll: (error: unknown, throws = false) => { rpcFailure = error === null ? null : { error, throws }; },
    denyRpc: (rpc: string, message: string) => { permissionFailure = { rpc, message }; },
    session: (next: PcbSession | null, event?: string) => { current = next; if (event) listeners.forEach(listener => listener(event, next)); },
    load: (next: typeof load) => { load = next; legacyLoad = null; },
    legacy: (next: unknown | (() => Promise<unknown>)) => { legacyLoad = typeof next === "function" ? next as () => Promise<unknown> : async () => next; },
  };
}
async function mount<T, P>(hook: (props: P) => T, initial: P) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let value!: T;
  function Harness(props: P) { value = hook(props); return null; }
  const render = async (props: P) => { await act(async () => { root.render(createElement(Harness as never, props as never)); }); };
  await render(initial);
  return { get value() { return value; }, render,
    async flush() { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); },
    async close() { await act(async () => root.unmount()); host.remove(); },
  };
}

for (const issue of ["missing", "expired", "denied"] as const) test(`${issue} cloud load preserves dirty draft and recovery, retry same account succeeds`, async () => {
  const local = localDraft(); const remote = cloud();
  if (issue === "missing") remote.session(null);
  if (issue === "expired") remote.session({ ...session(), expires_at: 1 });
  if (issue === "denied") remote.deny(true);
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    await hook.flush();
    assert.equal(hook.value.remoteReady, false);
    assert.equal(hook.value.canEdit, false);
    assert.equal(hook.value.canMutate, false);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
    const retained = local.repository.loadRecovery(owner, recoveryClientId)!;
    assert.equal(retained.savedRevision, "2026-11-12T01:00:00.000Z");
    await act(async () => assert.equal(await hook.value.saveNow(), false));
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.ok(local.repository.loadRecovery(owner, recoveryClientId));
    await act(async () => { remote.deny(false); remote.session(session()); await hook.value.retryRemote(); });
    await hook.flush();
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
    await act(async () => assert.equal(await hook.value.saveNow(), true));
    assert.equal(hook.value.hasUnsavedChanges, false);
    assert.equal(local.repository.loadRecovery(owner, recoveryClientId), null);
  } finally { await hook.close(); }
});

test("late denied/stale cloud responses never replace a dirty draft after session recovery", async () => {
  const local = localDraft(); const remote = cloud(); const pending = deferred<unknown>();
  remote.load(() => pending.promise);
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    await act(async () => remote.session(null, "SIGNED_OUT"));
    const cloudState = { ...local.state, projects: [{ ...local.state.projects[0], name: "Must not overwrite draft" }] };
    await act(async () => pending.resolve(cloudState));
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
    assert.equal(hook.value.remoteReady, false);
    assert.ok(local.repository.loadRecovery(owner, recoveryClientId));
    await act(async () => { remote.load(async () => cloudState); remote.session(session(), "SIGNED_IN"); });
    await hook.flush();
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
  } finally { await hook.close(); }
});

test("switching application account cannot reassign, upload or clear the old owner's draft", async () => {
  const local = localDraft(); const remote = cloud();
  const props: UsePcbWorkspaceOptions = { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId };
  const hook = await mount(usePcbWorkspace, props);
  try {
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    const otherId = "22222222-2222-4222-8222-222222222222";
    const otherRemote = cloud();
    await hook.render({ ...props, remoteClient: otherRemote.client, editor: { ...editor, userId: otherId } });
    assert.equal(hook.value.ownerChanged, true);
    assert.equal(hook.value.canEdit, false);
    assert.equal(hook.value.canMutate, false);
    assert.equal(hook.value.remoteReady, false);
    await act(async () => assert.equal(await hook.value.saveNow(), false));
    assert.ok(local.repository.loadRecovery(owner, recoveryClientId));
    assert.equal(local.repository.loadRecovery(otherId, recoveryClientId), null);
    assert.equal(otherRemote.calls.length, 0);
    assert.equal(remote.calls.filter(call => call.name.startsWith("save_")).length, 0);
    await hook.render(props);
    await hook.flush();
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
  } finally { await hook.close(); }
});

test("save queue retains same-session click order but invalidates work on lost sync permission", async () => {
  for (const revoke of [false, true]) {
    const local = localDraft(); const first = deferred<boolean>();
    const writes: string[] = [];
    const remoteClient = { save: async (state: PcbSaveState) => { writes.push(state.updatedAt); return writes.length === 1 ? first.promise : true; } };
    let props: UsePcbPersistenceOptions = { state: local.state, storage: local.storage, remoteClient, allowRemoteSync: true, editor, recoveryClientId, initialSavedRevision: "2026-11-12T01:00:00.000Z" };
    const hook = await mount(usePcbPersistence, props);
    try {
      let a!: Promise<boolean>; let b!: Promise<boolean>;
      await act(async () => { a = hook.value.saveNow(); await Promise.resolve(); });
      props = { ...props, state: { ...local.state, updatedAt: "2026-11-12T04:00:00.000Z" } };
      await hook.render(props);
      await act(async () => { b = hook.value.saveNow(); });
      if (revoke) await hook.render({ ...props, allowRemoteSync: false });
      await act(async () => { first.resolve(true); await Promise.all([a, b]); });
      assert.deepEqual(writes, revoke ? [local.state.updatedAt] : [local.state.updatedAt, props.state.updatedAt]);
      assert.equal(hook.value.hasUnsavedChanges, revoke);
      assert.equal(Boolean(local.repository.loadRecovery(owner, recoveryClientId)), revoke);
      if (revoke) { assert.equal(await a, false); assert.equal(await b, false); }
    } finally { await hook.close(); }
  }
});

test("normal same-actor token refresh retains the lease and dirty recovery without reload", async () => {
  const local = localDraft(); const remote = cloud();
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    const calls = remote.calls.length;
    await act(async () => remote.session({ ...session(), access_token: "synthetic-refreshed" }, "TOKEN_REFRESHED"));
    await hook.flush();
    assert.equal(remote.calls.length, calls);
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.canMutate, true);
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.equal(local.repository.loadRecovery(owner, recoveryClientId)?.savedRevision, "2026-11-12T01:00:00.000Z");
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
  } finally { await hook.close(); }
});

for (const message of ["PCB workspace access denied", "PCB workspace edit access denied"]) {
  for (const operation of ["load", "save", "lock"] as const) test(`P0001 ${operation} denial pauses editing immediately and preserves dirty recovery: ${message}`, async () => {
    const local = localDraft(); const remote = cloud();
    const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
    try {
      assert.equal(hook.value.canEdit, true);
      const before = local.repository.loadRecovery(owner, recoveryClientId);
      const target = operation === "load" ? "load_pcb_designer_workspace_shared"
        : operation === "save" ? "save_pcb_designer_workspace_locked" : "acquire_pcb_designer_project_lock";
      remote.denyRpc(target, message);
      await act(async () => {
        if (operation === "load") await hook.value.retryRemote();
        else if (operation === "save") assert.equal(await hook.value.saveNow(), false);
        else await hook.value.projectLock.refresh();
      });
      await hook.flush(); // No eight-second heartbeat wait is needed.
      assert.equal(hook.value.remoteAccessStatus, "denied");
      assert.equal(hook.value.remoteReady, false);
      assert.equal(hook.value.canEdit, false);
      assert.equal(hook.value.canMutate, false);
      assert.equal(hook.value.hasUnsavedChanges, true);
      assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
      assert.deepEqual(local.repository.loadRecovery(owner, recoveryClientId), before);
      assert.equal(remote.calls.some(call => ["save_pcb_designer_workspace_shared", "save_pcb_designer_workspace", "load_pcb_designer_workspace"].includes(call.name)), false);
    } finally { await hook.close(); }
  });
}

function intervalClock() {
  const originalSet = window.setInterval;
  const originalClear = window.clearInterval;
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; delay: number; next: number }>();
  window.setInterval = ((handler: () => void, delay = 0) => {
    const id = nextId++;
    timers.set(id, { callback: handler, delay, next: now + delay });
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = id => { timers.delete(id); };
  return {
    async advance(milliseconds: number) {
      now += milliseconds;
      await act(async () => {
        for (const timer of [...timers.values()]) {
          while (timer.next <= now) { timer.next += timer.delay; timer.callback(); }
        }
        await new Promise(resolve => setImmediate(resolve));
      });
    },
    restore() { window.setInterval = originalSet; window.clearInterval = originalClear; },
  };
}

for (const failure of ["server-500", "transport"] as const) test(`persistent ${failure} pauses editing and retries only on the eight-second cadence or explicit retry`, async () => {
  const local = localDraft(); const remote = cloud(); const clock = intervalClock();
  remote.failAll(failure === "server-500" ? { status: 500, message: "Synthetic server unavailable" }
    : new TypeError("Failed to fetch"), failure === "transport");
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    const recovery = local.repository.loadRecovery(owner, recoveryClientId);
    const generation = remote.client.getAccessSnapshot!().generation;
    for (let pass = 0; pass < 3; pass++) await hook.flush();
    assert.equal(remote.calls.length, 2); // One initial workspace read and one lease attempt.
    assert.equal(hook.value.remoteAccessStatus, "error");
    assert.equal(hook.value.remoteReady, false);
    assert.equal(hook.value.canEdit, false);
    assert.equal(hook.value.canMutate, false);
    assert.equal(hook.value.hasUnsavedChanges, true);
    await clock.advance(7_999);
    assert.equal(remote.calls.length, 2);
    await clock.advance(1);
    assert.equal(remote.calls.length, 4);
    await hook.flush();
    assert.equal(remote.calls.length, 4);
    assert.equal(remote.client.getAccessSnapshot!().generation, generation);
    assert.deepEqual(local.repository.loadRecovery(owner, recoveryClientId), recovery);
    await act(async () => { remote.failAll(null); await hook.value.retryRemote(); });
    await hook.flush();
    assert.equal(remote.calls.length, 6);
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.deepEqual(local.repository.loadRecovery(owner, recoveryClientId), recovery);
  } finally { await hook.close(); clock.restore(); }
});

test("a delayed transport error from the old session cannot pause the recovered session or clear its draft", async () => {
  const local = localDraft(); const remote = cloud(); const pending = deferred<unknown>();
  remote.load(async () => { await pending.promise; throw new TypeError("Old session transport failure"); });
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    const recovery = local.repository.loadRecovery(owner, recoveryClientId);
    await act(async () => remote.session(null, "SIGNED_OUT"));
    await act(async () => { remote.load(async () => null); remote.session(session(), "SIGNED_IN"); });
    await hook.flush();
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.canEdit, true);
    const generation = remote.client.getAccessSnapshot!().generation;
    const calls = remote.calls.length;
    await act(async () => pending.resolve(null));
    await hook.flush();
    assert.equal(remote.client.getAccessSnapshot!().generation, generation);
    assert.equal(remote.client.getAccessSnapshot!().status, "ready");
    assert.equal(remote.calls.length, calls);
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.canEdit, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    assert.deepEqual(local.repository.loadRecovery(owner, recoveryClientId), recovery);
  } finally { await hook.close(); }
});

for (const storageFailure of ["quota", "unavailable"] as const) test(`actual PermissionsProvider/PermissionGuard removal retains only the same owner's memory draft after ${storageFailure}`, async () => {
  let currentUser = { ...editor, role: "engineer" };
  let profileDenied = false;
  let failStorage = false;
  let failedWrites = 0;
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { if (failStorage && storageFailure === "unavailable") throw new Error("Synthetic storage unavailable"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (failStorage) { failedWrites++; throw new Error("Synthetic quota exceeded"); } values.set(key, value); },
  };
  const repository = new PcbLocalRepository(storage);
  const unclaimed = repository.load();
  repository.save({ ...unclaimed, projects: [{ ...unclaimed.projects[0], name: "Unclaimed global private data" }] });
  const originalGlobal = values.get(PCB_STORAGE_KEY);
  const ownCloud = cloud(); const otherCloud = cloud(); otherCloud.session(null);
  const otherOwner = "22222222-2222-4222-8222-222222222222";
  const database = {
    from(table: string) {
      assert.equal(table, "user_page_permissions");
      return { select: () => ({ eq: async () => ({ data: [{ permission: "pcb_designer_view" }, { permission: "pcb_designer_edit" }], error: null }) }) };
    },
    channel() { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: async () => undefined,
  };
  const guardedLoad = loader({ window: dom.window, globals: { console: { ...console, error() {} } }, mocks: {
    react: React, "../core/storage.ts": pcbStorage,
    "@/components/ui/alert": { Alert: ({ children }) => createElement("aside", null, children), AlertDescription: ({ children }) => createElement("p", null, children) },
    "lucide-react": { Shield: () => null },
    "@/hooks/use-toast": { toast: () => undefined },
    "@/components/auth/UserContext": { useUser: () => ({ user: currentUser }) },
    "@/integrations/supabase/client": { supabase: database },
    "@/lib/permissionRefresh.mjs": { watchPermissionRefresh: () => () => undefined },
    "@/lib/systemUserProfiles": { readSystemUserProfile: async (id: string) => profileDenied
      ? { data: null, error: new Error("Synthetic profile denied") }
      : { data: { id, role: "engineer", status: "active", permissions: { workspaceAccess: { "pcb-designer": "edit" } } }, error: null } },
  } });
  const { PermissionsProvider, usePermissions } = guardedLoad("src/hooks/usePermissions.ts");
  const { PermissionGuard } = guardedLoad("src/components/layout/PermissionGuard.tsx");
  const { usePcbWorkspace: guardedWorkspace } = guardedLoad("src/components/pcb-designer/hooks/usePcbWorkspace.ts");
  let api: ReturnType<typeof usePcbWorkspace>;
  let mounted = false;
  let recoveryId = "guarded-memory-client";
  function Board() {
    const permission = usePermissions();
    api = guardedWorkspace({ canEdit: permission.canEditModule("pcb-designer"), storage, editor: currentUser,
      remoteClient: currentUser.userId === owner ? ownCloud.client : otherCloud.client, recoveryClientId: recoveryId });
    React.useEffect(() => { mounted = true; return () => { mounted = false; }; }, []);
    return createElement("div", null, api.activeProject.name);
  }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const render = async () => { await act(async () => root.render(createElement(PermissionsProvider, null, createElement(PermissionGuard, { module: "pcb-designer" }, createElement(Board))))); };
  const refreshProfile = async () => { await act(async () => dom.window.dispatchEvent(new dom.window.CustomEvent("station-permissions-updated"))); };
  try {
    await render();
    assert.equal(mounted, true);
    assert.notEqual(api!.activeProject.name, "Unclaimed global private data");
    assert.ok(values.has(pcbOwnerStorageKey(owner)));
    failStorage = true;
    await new Promise(resolve => setTimeout(resolve, 2));
    await act(async () => api!.renameProject(api!.activeProject.id, "Owner A unsaved memory-only draft"));
    assert.equal(api!.hasUnsavedChanges, true);
    const checkpoint = structuredClone(api!.data);
    assert.ok(failedWrites > 0);
    assert.ok(repository.loadRecovery(owner, recoveryId));
    const durableDraftKey = `${PCB_STORAGE_KEY}:draft:${owner}:${recoveryId}`;
    assert.equal(values.get(durableDraftKey) ?? "", ""); // No false claim of durable storage.
    profileDenied = true; await refreshProfile(); assert.equal(mounted, false);
    const leaveWhileGuarded = new dom.window.Event("beforeunload", { cancelable: true });
    dom.window.dispatchEvent(leaveWhileGuarded);
    assert.equal(leaveWhileGuarded.defaultPrevented, true); // Survives the hook's true unmount.
    profileDenied = false; await refreshProfile(); assert.equal(mounted, true);
    assert.deepEqual(structuredClone(api!.data), checkpoint);
    assert.equal(api!.hasUnsavedChanges, true);
    assert.equal(api!.canEdit, true);
    currentUser = { ...editor, userId: otherOwner, role: "engineer" }; await render();
    assert.equal(mounted, true);
    assert.equal(JSON.stringify(api!.data).includes("Owner A unsaved"), false);
    assert.equal(repository.loadRecovery(otherOwner, recoveryId), null);
    assert.ok(repository.loadRecovery(owner, recoveryId));
    currentUser = { ...editor, role: "engineer" }; await render();
    assert.deepEqual(structuredClone(api!.data), checkpoint);
    profileDenied = true; await refreshProfile(); assert.equal(mounted, false);
    recoveryId = "different-client"; profileDenied = false; await refreshProfile();
    assert.equal(JSON.stringify(api!.data).includes("Owner A unsaved"), false);
    assert.equal(repository.loadRecovery(owner, recoveryId), null);
    assert.ok(repository.loadRecovery(owner, "guarded-memory-client"));
    assert.equal(values.get(PCB_STORAGE_KEY), originalGlobal);
  } finally {
    await act(async () => root.unmount()); host.remove();
    repository.clearRecovery(owner, "guarded-memory-client");
    repository.clearRecovery(owner, "different-client");
    repository.clearRecovery(otherOwner, "guarded-memory-client");
    const leaveAfterClear = new dom.window.Event("beforeunload", { cancelable: true });
    dom.window.dispatchEvent(leaveAfterClear);
    assert.equal(leaveAfterClear.defaultPrevented, false);
  }
});

test("successful own locked cloud save clears the memory-only warning even when disk stays unavailable", async () => {
  const local = localDraft(); const remote = cloud();
  local.storage.setItem = () => { throw new Error("Synthetic quota"); };
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    await hook.flush();
    const before = new dom.window.Event("beforeunload", { cancelable: true }); dom.window.dispatchEvent(before);
    assert.equal(before.defaultPrevented, true);
    assert.equal(hook.value.hasUnsavedChanges, true);
    await act(async () => assert.equal(await hook.value.saveNow(), true));
    assert.equal(hook.value.hasUnsavedChanges, false);
    assert.ok(remote.calls.some(call => call.name === "save_pcb_designer_workspace_locked"));
    assert.equal(local.repository.loadRecovery(owner, recoveryClientId), null);
    const after = new dom.window.Event("beforeunload", { cancelable: true }); dom.window.dispatchEvent(after);
    assert.equal(after.defaultPrevented, false);
  } finally { await hook.close(); local.repository.clearRecovery(owner, recoveryClientId); }
});

for (const ownPresent of [true, false]) test(`legacy recovery is read-only and unsaved on a fresh seed (own present: ${ownPresent})`, async () => {
  const local = localDraft(); const remote = cloud();
  local.repository.clearRecovery(owner, recoveryClientId);
  const cleanSeed = new PcbLocalRepository({ getItem: () => null, setItem: () => undefined }).load();
  local.repository.save(cleanSeed, owner);
  remote.legacy(envelope([{ id: owner, permissions: { [LEGACY_KEY]: local.state } }], ownPresent ? owner : "missing-owner"));
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    await hook.flush();
    assert.equal(hook.value.legacyRecovery, ownPresent ? "own" : "shared-only");
    assert.equal(hook.value.activeProject.name, "Preserved synthetic draft");
    assert.equal(hook.value.canEdit, false);
    assert.equal(hook.value.canMutate, false);
    assert.equal(hook.value.remoteReady, false);
    assert.equal(hook.value.hasUnsavedChanges, true);
    const beforeCalls = remote.calls.length;
    await act(async () => assert.equal(await hook.value.saveNow(), false));
    assert.equal(await remote.client.save!(hook.value.data), false);
    assert.equal(await remote.client.deleteProject!(hook.value.activeProject.id), false);
    assert.equal(remote.calls.length, beforeCalls);
    assert.ok(local.repository.loadRecovery(owner, recoveryClientId));
  } finally { await hook.close(); }
});

test("legacy recovery never applies stale tombstones to existing dirty or newer modern content", async () => {
  for (const initiallyDirty of [true, false]) {
    const local = localDraft(); const remote = cloud();
    if (!initiallyDirty) local.repository.clearRecovery(owner, recoveryClientId);
    remote.load(async () => local.state);
    const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
    try {
      const current = structuredClone(hook.value.data);
      const old = { ...local.state, updatedAt: "2020-01-01T00:00:00.000Z", remoteDeletions: { projects: [local.state.projects[0].id], templates: [], library: [] } };
      remote.legacy(envelope([{ id: owner, permissions: { [LEGACY_KEY]: old } }], owner));
      await act(async () => hook.value.retryRemote()); await hook.flush();
      assert.equal(hook.value.legacyRecovery, "own");
      assert.deepEqual(structuredClone(hook.value.data), current);
      assert.equal(hook.value.hasUnsavedChanges, true);
      assert.equal(hook.value.canEdit, false);
      assert.ok(local.repository.loadRecovery(owner, recoveryClientId));
      assert.equal(remote.calls.some(call => call.name.startsWith("save_")), false);
    } finally { await hook.close(); }
  }
});

test("old-session legacy completion cannot change newer modern content or turn its adapter read-only", async () => {
  const local = localDraft(); const remote = cloud(); const pending = deferred<unknown>();
  local.repository.clearRecovery(owner, recoveryClientId);
  remote.legacy(() => pending.promise);
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  try {
    await act(async () => remote.session(null, "SIGNED_OUT"));
    await act(async () => { remote.load(async () => local.state); remote.session(session(), "SIGNED_IN"); });
    await hook.flush();
    const modern = structuredClone(hook.value.data);
    const old = { ...local.state, updatedAt: "2020-01-01T00:00:00.000Z" };
    await act(async () => pending.resolve(envelope([{ id: owner, permissions: { [LEGACY_KEY]: old } }], owner)));
    await hook.flush();
    assert.equal(hook.value.legacyRecovery, null);
    assert.equal(hook.value.remoteReady, true);
    assert.equal(hook.value.canEdit, true);
    assert.deepEqual(structuredClone(hook.value.data), modern);
    await act(async () => assert.equal(await hook.value.saveNow(), true));
    assert.equal(remote.calls.at(-1)?.name, "save_pcb_designer_workspace_locked");
  } finally { await hook.close(); }
});

test('project-settings success receipt follows actual reducer adoption, with no new remote write', async () => {
  const local = localDraft(), remote = cloud();
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  const settings = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  try {
    await hook.flush();
    const project = hook.value.activeProject;
    const parsed = settings.parseProjectSettings({ ...settings.initialProjectSettings(project).values, name: 'Applied synthetic settings' });
    assert.equal(typeof parsed, 'object');
    const beforeWrites = remote.calls.filter(call => /save|delete/.test(call.name)).length;
    let receipt!: Promise<boolean>;
    await act(async () => { receipt = hook.value.updateProjectSettings(project.id, settings.projectSettingsRevision(project), parsed); });
    assert.equal(await receipt, true);
    assert.equal(hook.value.activeProject.name, 'Applied synthetic settings');
    assert.equal(remote.calls.filter(call => /save|delete/.test(call.name)).length, beforeWrites);
  } finally { await hook.close(); }
});

test('queued CAD edit wins over a stale project-settings action and returns a failed receipt', async () => {
  const local = localDraft(), remote = cloud();
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  const settings = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  try {
    await hook.flush();
    const project = hook.value.activeProject;
    const parsed = settings.parseProjectSettings({ ...settings.initialProjectSettings(project).values, name: 'Must not replace newer CAD' });
    let receipt!: Promise<boolean>;
    await act(async () => {
      hook.value.commitProject({ ...project, description: 'Newer queued CAD edit' });
      receipt = hook.value.updateProjectSettings(project.id, settings.projectSettingsRevision(project), parsed);
    });
    assert.equal(await receipt, false);
    assert.equal(hook.value.activeProject.description, 'Newer queued CAD edit');
    assert.equal(hook.value.activeProject.name, project.name);
  } finally { await hook.close(); }
});

test('captured settings callback cannot apply after permission loss or owner switch', async () => {
  const local = localDraft(), remote = cloud();
  const initial = { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId };
  const hook = await mount(usePcbWorkspace, initial);
  const settings = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  try {
    await hook.flush();
    const project = hook.value.activeProject, callback = hook.value.updateProjectSettings;
    const args = [project.id, settings.projectSettingsRevision(project), settings.parseProjectSettings(settings.initialProjectSettings(project).values)] as const;
    await hook.render({ ...initial, canEdit: false });
    assert.equal(await callback(...args), false);
    await hook.render({ ...initial, editor: { ...editor, userId: '22222222-2222-4222-8222-222222222222' } });
    assert.equal(await callback(...args), false);
    assert.equal(hook.value.activeProject.name, project.name);
  } finally { await hook.close(); }
});

test('timestamp-only queued commit cannot impersonate acceptance of trimmed no-op settings', async () => {
  const local = localDraft(), remote = cloud();
  local.state.projects[0].projectGroup = ''; local.state.projects[0].revision = '1';
  local.repository.saveRecovery(owner, local.state, '2026-11-12T01:00:00.000Z', recoveryClientId);
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  const settings = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  try {
    await hook.flush();
    const project = hook.value.activeProject;
    const parsed = settings.parseProjectSettings({ ...settings.initialProjectSettings(project).values, name: `  ${project.name}  ` });
    let receipt!: Promise<boolean>;
    await act(async () => {
      hook.value.commitProject({ ...project });
      receipt = hook.value.updateProjectSettings(project.id, settings.projectSettingsRevision(project), parsed);
    });
    assert.equal(await receipt, false);
    assert.equal(hook.value.projectSettingsReceipt.accepted, false);
    assert.equal(hook.value.activeProject.name, project.name);
    assert.notEqual(hook.value.activeProject.updatedAt, project.updatedAt);
    assert.equal('projectSettingsReceipt' in hook.value.data, false);
    assert.equal(remote.calls.some(call => /save|delete/.test(call.name)), false);
  } finally { await hook.close(); }
});

test('queued hydration superseding settings resolves the exact receipt false and retains the raw checkpoint', async () => {
  const local = localDraft(), remote = cloud();
  local.repository.saveRecovery(owner, local.state, local.state.updatedAt, recoveryClientId);
  const hook = await mount(usePcbWorkspace, { canEdit: true, storage: local.storage, remoteClient: remote.client, editor, recoveryClientId });
  const settings = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  const registry = load('src/lib/documentDrafts.ts'); registry.setDocumentDraftActor(owner);
  try {
    await hook.flush(); assert.equal(hook.value.canMutate, true); assert.equal(hook.value.hasUnsavedChanges, false);
    const wait = deferred<unknown>(); remote.load(() => wait.promise);
    let refreshing!: Promise<void>;
    await act(async () => { refreshing = hook.value.refreshRemoteNow(); await new Promise(resolve => setImmediate(resolve)); });
    const project = hook.value.activeProject, draft = new settings.ProjectSettingsSession(owner, project);
    draft.write({ ...draft.draft.values, name: '  User pending settings  ', description: 'raw preserved description' });
    const server = structuredClone(hook.value.data);
    server.updatedAt = server.projects[0].updatedAt = '2099-01-01T00:00:00.000Z'; server.projects[0].name = 'Remote replacement';
    let receipt!: Promise<boolean>;
    await act(async () => {
      receipt = hook.value.updateProjectSettings(project.id, settings.projectSettingsRevision(project), settings.parseProjectSettings(draft.draft.values));
      wait.resolve(server); await refreshing;
    });
    const applied = await receipt; if (applied) draft.clear();
    assert.equal(applied, false); assert.equal(hook.value.projectSettingsReceipt.accepted, false);
    assert.equal(hook.value.activeProject.name, 'Remote replacement');
    assert.equal(new settings.ProjectSettingsSession(owner, project).draft.values.name, '  User pending settings  ');
    assert.equal('projectSettingsReceipt' in hook.value.data, false);
    assert.equal(remote.calls.some(call => /save|delete/.test(call.name)), false);
  } finally { await hook.close(); registry.setDocumentDraftActor(null); }
});
