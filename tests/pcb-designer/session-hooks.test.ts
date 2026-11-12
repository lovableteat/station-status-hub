import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { UsePcbWorkspaceOptions } from "../../src/components/pcb-designer/hooks/usePcbWorkspace.ts";
import type { UsePcbPersistenceOptions } from "../../src/components/pcb-designer/hooks/usePcbPersistence.ts";
import { PcbLocalRepository } from "../../src/components/pcb-designer/core/storage.ts";
import { createPcbAccountRemoteClient, type PcbAccountDatabase } from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";
import type { PcbSession, PcbSessionSource } from "../../src/components/pcb-designer/core/remoteAccess.ts";

const qa = createRequire(`${process.env.AUDIT_QA_DIR ?? "/tmp/station-release-qa"}/package.json`);
const { JSDOM } = qa("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://synthetic.invalid/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { loader } = createRequire(import.meta.url)("../support/renderHarness.cjs");
const load = loader({ window: dom.window, mocks: { react: React, "@/hooks/use-toast": { toast: () => undefined } } });
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
  repository.save(state);
  repository.saveRecovery(owner, state, "2026-11-12T01:00:00.000Z", recoveryClientId);
  return { state, storage, repository };
}
function cloud() {
  let current: PcbSession | null = session();
  let denied = false;
  let permissionFailure: { rpc: string; message: string } | null = null;
  let rpcFailure: { error: unknown; throws: boolean } | null = null;
  let load: () => Promise<unknown> = async () => null;
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
    load: (next: typeof load) => { load = next; },
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
