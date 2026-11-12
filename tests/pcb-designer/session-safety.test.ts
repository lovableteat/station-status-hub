import assert from "node:assert/strict";
import test from "node:test";
import { createPcbAccountRemoteClient, type PcbAccountDatabase } from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { loadPcbRemote } from "../../src/components/pcb-designer/core/remoteSync.ts";
import { PcbRemoteAccessError, type PcbSession, type PcbSessionSource } from "../../src/components/pcb-designer/core/remoteAccess.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const session = (): PcbSession => ({ access_token: "synthetic-only", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "auth-id-is-not-the-system-id" } });
const draft = (): PcbSaveState => {
  const project = createBlankProject("Synthetic preserved board");
  return { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let current: PcbSession | null = session();
  let handler = async (_name: string, _args: Record<string, unknown>) => ({ data: null as unknown, error: null as unknown });
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const events = new Set<(event: string, value: PcbSession | null) => void>();
  let tableCalls = 0;
  const auth: PcbSessionSource = {
    getSession: async () => ({ data: { session: current }, error: null }),
    onAuthStateChange: (callback) => {
      events.add(callback);
      return { data: { subscription: { unsubscribe: () => events.delete(callback) } } };
    },
  };
  const database = {
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return handler(name, args); },
    from: () => { tableCalls += 1; throw new Error("Unexpected legacy permissions access"); },
  } as unknown as PcbAccountDatabase;
  const client = createPcbAccountRemoteClient(database, owner, "own-tab", auth);
  return { client, calls, database, auth, tableCalls: () => tableCalls,
    handle: (next: typeof handler) => { handler = next; },
    session: (next: PcbSession | null, event?: string) => { current = next; if (event) events.forEach(callback => callback(event, next)); },
  };
}

for (const error of [
  { code: "42501", message: "denied" }, { status: 401, message: "expired" },
  { status: 403, message: "blocked" }, { code: "PGRST301", message: "JWT expired" },
  { status: 502, message: "gateway" }, { code: "42P01", message: "relation does not exist" },
]) test(`cloud load ${JSON.stringify(error)} never falls back or becomes empty`, async () => {
  const f = fixture();
  f.handle(async () => ({ data: null, error }));
  await assert.rejects(loadPcbRemote(f.client));
  assert.deepEqual(f.calls.map(call => call.name), ["load_pcb_designer_workspace_shared"]);
  assert.equal(f.tableCalls(), 0);
  assert.notEqual(f.client.getAccessSnapshot!().status, "ready");
});

for (const deniedStage of ["save_pcb_designer_workspace_locked", "save_pcb_designer_workspace_shared", "save_pcb_designer_workspace"]) {
  test(`save denial at ${deniedStage} stops every compatibility write`, async () => {
    const f = fixture();
    f.handle(async (name) => ({ data: null, error: name === deniedStage
      ? { code: "42501", message: "Permission denied" } : { code: "PGRST202", message: `Could not find the function workspace.${name}(p_user_id) in the schema cache` } }));
    assert.equal(await f.client.save!(draft()), false);
    assert.equal(f.calls.at(-1)?.name, deniedStage);
    assert.equal(f.tableCalls(), 0);
    assert.equal(f.client.getAccessSnapshot!().status, "denied");
  });
}

test("legacy load denial cannot read account permission snapshots", async () => {
  const f = fixture();
  f.handle(async name => ({ data: null, error: name.endsWith("_shared")
    ? { code: "PGRST202", message: `Could not find the function workspace.${name}(p_user_id) in the schema cache` } : { code: "42501", message: "denied" } }));
  await assert.rejects(f.client.load!());
  assert.equal(f.calls.length, 2);
  assert.equal(f.tableCalls(), 0);
});

test("successful empty workspace is authoritative and does not read legacy snapshots", async () => {
  const f = fixture();
  assert.equal(await loadPcbRemote(f.client), null);
  assert.equal(f.calls.length, 1);
  assert.equal(f.tableCalls(), 0);
  assert.equal(f.client.getAccessSnapshot!().status, "ready");
});

for (const missing of [null, { ...session(), expires_at: 1 }]) test(`missing or expired session gates every PCB RPC (${missing ? "expired" : "missing"})`, async () => {
  const f = fixture(); f.session(missing);
  await assert.rejects(f.client.load!(), PcbRemoteAccessError);
  await assert.rejects(f.client.acquireProjectLock!({ projectId: "board", projectName: "Synthetic" }));
  await assert.rejects(f.client.loadProjectLock!("board"));
  assert.equal(await f.client.save!(draft()), false);
  assert.equal(await f.client.releaseProjectLock!("board"), false);
  assert.equal(await f.client.deleteProject!("board"), false);
  assert.equal(await f.client.loadModelAsset!("model"), null);
  assert.deepEqual(await f.client.listModelAssets!(), []);
  assert.equal(f.calls.length, 0);
  assert.equal(f.tableCalls(), 0);
  assert.equal(f.client.getAccessSnapshot!().status, "session-required");
});

test("UUID application identity alone cannot establish a session", async () => {
  const f = fixture();
  const client = createPcbAccountRemoteClient(f.database, owner);
  await assert.rejects(client.load!());
  assert.equal(f.calls.length, 0);
});

test("explicit retry with the same actor restores cloud access without a new login", async () => {
  const f = fixture();
  f.session(null);
  await assert.rejects(f.client.load!());
  f.session(session());
  f.client.retryAccess!();
  assert.equal(await f.client.load!(), null);
  assert.equal(f.client.getAccessSnapshot!().status, "ready");
});

test("locks preserve system account and own-client identifiers through acquire, renew and release", async () => {
  const f = fixture();
  f.handle(async () => ({ data: { available: true, acquired: true, lock: null }, error: null }));
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await f.client.acquireProjectLock!({ projectId: "board", projectName: "Synthetic" })).acquired, true);
  assert.equal(await f.client.releaseProjectLock!("board"), true);
  for (const call of f.calls) {
    assert.equal(call.args.p_user_id, owner);
    assert.equal(call.args.p_editor_client_id, "own-tab");
    assert.equal(call.args.p_project_id, "board");
  }
});

test("denied locking never becomes a legacy/unlocked lease", async () => {
  const f = fixture();
  f.handle(async () => ({ data: null, error: { code: "42501", message: "denied" } }));
  await assert.rejects(f.client.acquireProjectLock!({ projectId: "board", projectName: "Synthetic" }));
  assert.equal(f.client.getAccessSnapshot!().status, "denied");
  assert.equal(f.calls.length, 1);
});

for (const subscribed of [true, false]) test(`actor changes reject pending loads and saves, even without a subscriber (${subscribed})`, async () => {
  for (const operation of ["load", "save"] as const) {
    const f = fixture(); const pending = deferred<{ data: unknown; error: null }>();
    f.handle(() => pending.promise);
    const cleanup = subscribed ? f.client.subscribeAccess!(() => undefined) : () => undefined;
    const outcome = operation === "load" ? assert.rejects(f.client.load!()) : f.client.save!(draft());
    await new Promise<void>(resolve => setImmediate(resolve));
    f.session({ ...session(), user: { id: "other-auth-actor" } }, "SIGNED_IN");
    pending.resolve({ data: operation === "load" ? draft() : true, error: null });
    if (operation === "load") await outcome;
    else assert.equal(await outcome, false);
    f.client.retryAccess!();
    await assert.rejects(f.client.load!());
    assert.equal(f.calls.length, 1);
    cleanup();
  }
});

test("same-actor token refresh preserves a healthy request generation", async () => {
  const f = fixture(); const pending = deferred<{ data: unknown; error: null }>();
  f.handle(() => pending.promise);
  const cleanup = f.client.subscribeAccess!(() => undefined);
  const old = f.client.load!();
  await new Promise<void>(resolve => setImmediate(resolve));
  const generation = f.client.getAccessSnapshot!().generation;
  await new Promise<void>(resolve => setImmediate(resolve));
  f.session({ ...session(), access_token: "synthetic-refreshed" }, "TOKEN_REFRESHED");
  pending.resolve({ data: draft(), error: null }); assert.ok(await old);
  assert.equal(f.client.getAccessSnapshot!().generation, generation);
  f.handle(async () => ({ data: null, error: null }));
  assert.equal(await f.client.load!(), null);
  assert.equal(f.client.getAccessSnapshot!().status, "ready");
  cleanup();
});

for (const error of [
  { code: "42883", message: "function workspace.missing_internal_helper(uuid) does not exist" },
  { code: "PGRST202", message: "Could not find the function workspace.other_function(p_user_id) in the schema cache" },
  { code: "PGRST202", message: "missing RPC" },
]) test(`a different or unidentified missing function is not compatibility permission: ${error.code}/${error.message}`, async () => {
  const f = fixture(); f.handle(async () => ({ data: null, error }));
  await assert.rejects(f.client.load!());
  assert.equal(f.calls.length, 1); assert.equal(f.tableCalls(), 0);
});

test("an explicitly missing SQL entry point permits the next deployed save RPC", async () => {
  const f = fixture(); f.handle(async name => ({ data: null, error: name === "save_pcb_designer_workspace_locked"
    ? { code: "42883", message: "function workspace.save_pcb_designer_workspace_locked(uuid, text, text, jsonb) does not exist" } : null }));
  assert.equal(await f.client.save!(draft()), true);
  assert.deepEqual(f.calls.map(call => call.name), ["save_pcb_designer_workspace_locked", "save_pcb_designer_workspace_shared"]);
  assert.equal(f.tableCalls(), 0);
});

test("same-actor token refresh cannot override a server authorization denial", async () => {
  const f = fixture(); const cleanup = f.client.subscribeAccess!(() => undefined);
  f.handle(async () => ({ data: null, error: { code: "42501", message: "denied" } }));
  await assert.rejects(f.client.load!());
  const generation = f.client.getAccessSnapshot!().generation;
  f.session({ ...session(), access_token: "synthetic-new-token" }, "TOKEN_REFRESHED");
  assert.equal(f.client.getAccessSnapshot!().status, "denied");
  assert.equal(f.client.getAccessSnapshot!().generation, generation);
  await assert.rejects(f.client.load!()); assert.equal(f.calls.length, 1);
  cleanup();
});
