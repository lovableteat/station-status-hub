import assert from "node:assert/strict";
import test from "node:test";
import { createBlankProject, BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES } from "../../src/components/pcb-designer/defaults.ts";
import { parsePcbLegacyWorkspace, PcbLegacySnapshotError } from "../../src/components/pcb-designer/core/legacyWorkspace.ts";
import { createPcbAccountRemoteClient, type PcbAccountDatabase } from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { guardPcbRemoteClient, type PcbSession, type PcbSessionSource } from "../../src/components/pcb-designer/core/remoteAccess.ts";
import type { PcbRemoteLoadResult } from "../../src/components/pcb-designer/core/remoteSync.ts";
import { catalog, envelope, LEGACY_KEY } from "./legacy-fixtures.ts";
import type { PcbLibraryComponent, PcbSaveState } from "../../src/components/pcb-designer/types.ts";
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
function state(name: string): PcbSaveState {
  const project = { ...createBlankProject(`Shared board ${name}`), id: `board-${name}`, updatedAt: "2026-11-12T01:00:00.000Z" };
  return { projects: [project], activeProjectId: project.id, templates: [{ ...structuredClone(BUILT_IN_TEMPLATES[0]), id: `private-template-${name}`, name: `Private ${name}`, isBuiltIn: false }],
    library: [{ ...structuredClone(BUILT_IN_COMPONENTS[0]), id: `shared-component-${name}`, name: `Shared ${name}`, source: "custom" }],
    modelAssets: { [`private-model-${name}`]: { id: `private-model-${name}`, fileName: `private-${name}.step`, createdAt: project.updatedAt, updatedAt: project.updatedAt } as never },
    pendingPlacementsByProject: { [project.id]: [{ name: `private-pending-${name}`, type: "resistor", manufacturer: "Synthetic", partNumber: "SYN", color: "#123456", reference: "R1", width: 1, height: 1, maxHeight: 1, quantity: 1 }] },
    remoteDeletions: { projects: [], library: [], templates: [`private-deletion-${name}`] }, updatedAt: project.updatedAt,
    ...{ [`privateUnknown${name}`]: `private-note-${name}` },
  };
}
function records() { return [{ id: ownerA, permissions: { [LEGACY_KEY]: state("A") } }, { id: ownerB, permissions: { [LEGACY_KEY]: state("B") } }]; }
function clientFor(response: unknown, options: { modern?: unknown; modernError?: unknown; legacyError?: unknown; session?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const database = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "load_pcb_designer_workspace_shared") {
      return Object.prototype.hasOwnProperty.call(options, "modern") ? { data: options.modern, error: null }
        : { data: null, error: options.modernError ?? { code: "PGRST202", message: `Could not find the function workspace.${name}(p_user_id) in the schema cache` } };
    }
    if (name === "load_pcb_designer_legacy_workspace") return { data: response, error: options.legacyError ?? null };
    throw new Error("Unexpected non-read operation");
  }, from() { throw new Error("Raw read/write forbidden"); } } as unknown as PcbAccountDatabase;
  const auth = { getSession: async () => ({ data: { session: options.session === false ? null : { access_token: "synthetic", expires_at: 4_102_444_800, user: { id: "auth-not-system-id" } } }, error: null }) };
  return { client: createPcbAccountRemoteClient(database, ownerA, "synthetic-tab", auth), calls };
}

test("two owners share only catalog fields and keep their own private fields and exact source untouched", () => {
  for (const [id, own, other] of [[ownerA, "A", "B"], [ownerB, "B", "A"]]) {
    const input = envelope(records(), id); const before = structuredClone(input);
    const result = parsePcbLegacyWorkspace(input);
    assert.equal(result.ownSnapshotPresent, true);
    assert.equal(result.state.projects.length, 2);
    assert.equal(result.state.activeProjectId, `board-${own}`);
    assert.equal(result.state.templates.some(template => template.id === `private-template-${own}`), true);
    assert.equal(result.state.modelAssets?.[`private-model-${own}`]?.fileName, `private-${own}.step`);
    assert.equal((result.state as unknown as Record<string, unknown>)[`privateUnknown${own}`], `private-note-${own}`);
    for (const fragment of [`private-template-${other}`, `private-model-${other}`, `private-pending-${other}`, `private-note-${other}`, `private-deletion-${other}`]) assert.equal(JSON.stringify(result).includes(fragment), false);
    assert.deepEqual(input, before);
  }
});

test("absent own snapshot never adopts another owner's active selection, private records or unknown fields", () => {
  const result = parsePcbLegacyWorkspace(envelope(records(), "absent-owner"));
  assert.equal(result.ownSnapshotPresent, false);
  assert.equal(result.state.projects.length, 2);
  assert.equal(result.state.activeProjectId, null);
  assert.ok(result.state.templates.every(template => template.isBuiltIn));
  assert.deepEqual(result.state.modelAssets, {});
  assert.deepEqual(result.state.pendingPlacementsByProject, {});
  assert.equal(JSON.stringify(result).includes("private-"), false);
});

test("shared fold preserves newest project/library revisions, opposite stable ties, tombstones and builtin exclusion", () => {
  const a = state("A"), b = state("B");
  b.projects[0] = { ...a.projects[0], name: "Later owner equal revision" };
  b.activeProjectId = a.projects[0].id; b.pendingPlacementsByProject = {};
  b.library[0] = { ...a.library[0], name: "Later owner library tie" };
  const tie = parsePcbLegacyWorkspace(envelope([{ id: ownerA, permissions: { [LEGACY_KEY]: a } }, { id: ownerB, permissions: { [LEGACY_KEY]: b } }], ownerA)).state;
  assert.equal(tie.projects[0].name, a.projects[0].name);
  assert.equal(tie.library.find(component => component.id === a.library[0].id)?.name, "Later owner library tie");
  b.projects[0].updatedAt = "2026-11-12T02:00:00.000Z";
  b.updatedAt = "2026-11-12T02:00:00.000Z";
  b.projects[0].name = "Newer shared revision";
  b.library.push(...BUILT_IN_COMPONENTS);
  let result = parsePcbLegacyWorkspace(envelope([{ id: ownerA, permissions: { [LEGACY_KEY]: a } }, { id: ownerB, permissions: { [LEGACY_KEY]: b } }], ownerA)).state;
  assert.equal(result.projects[0].name, "Newer shared revision");
  assert.equal(result.library.filter(component => component.source === "built-in").length, BUILT_IN_COMPONENTS.length);
  a.remoteDeletions!.projects = [a.projects[0].id]; a.remoteDeletions!.library = [a.library[0].id];
  result = parsePcbLegacyWorkspace(envelope([{ id: ownerA, permissions: { [LEGACY_KEY]: a } }, { id: ownerB, permissions: { [LEGACY_KEY]: b } }], ownerA)).state;
  assert.equal(result.projects.length, 0);
  assert.equal(result.activeProjectId, null);
  assert.equal(result.library.some(component => component.id === a.library[0].id), false);
  assert.deepEqual(result.pendingPlacementsByProject, {});
});

const valid = () => envelope(records(), ownerA);
const invalid: Array<[string, (input: ReturnType<typeof valid>) => unknown]> = [
  ["null", () => null], ["future version", input => ({ ...input, schemaVersion: 2 })],
  ["unknown private top-level field", input => ({ ...input, templates: ["other-owner-private"] })],
  ["missing own presence", input => { const next = { ...input } as Record<string, unknown>; delete next.ownSnapshotPresent; return next; }],
  ["absent with data", input => ({ ...input, ownSnapshotPresent: false })],
  ["own JSON null", input => ({ ...input, ownSnapshot: null })],
  ["own malformed", input => ({ ...input, ownSnapshot: { projects: "invalid" } })],
  ["private field in catalog", input => ({ ...input, sharedCatalog: [{ ...input.sharedCatalog[0], templates: ["private"] }] })],
  ["malformed geometry", input => ({ ...input, sharedCatalog: [{ ...input.sharedCatalog[0], projects: [{ id: "broken" }] }] })],
  ["builtin in server shared projection", input => ({ ...input, sharedCatalog: [{ ...input.sharedCatalog[0], library: [BUILT_IN_COMPONENTS[0]] }] })],
  ["partial catalog drops own records", input => ({ ...input, sharedCatalog: [] })],
];
for (const [label, alter] of invalid) test(`invalid protected envelope fails closed: ${label}`, async () => {
  const value = alter(valid()); assert.throws(() => parsePcbLegacyWorkspace(value), PcbLegacySnapshotError);
  const f = clientFor(value); await assert.rejects(f.client.load!());
  assert.deepEqual(f.calls.map(call => call.name), ["load_pcb_designer_workspace_shared", "load_pcb_designer_legacy_workspace"]);
});

test("modern success including null is authoritative and never requests legacy data", async () => {
  for (const modern of [null, state("Modern")]) {
    const f = clientFor(valid(), { modern }); const result = await f.client.loadWithMetadata!();
    assert.equal(result.source, "modern");
    assert.equal(result.state === null, modern === null);
    assert.equal(f.calls.length, 1);
  }
  const malformed = clientFor(valid(), { modern: { projects: "malformed" } });
  await assert.rejects(malformed.client.load!()); assert.equal(malformed.calls.length, 1);
});

test("protected compatibility RPC sends no owner/account parameters and marks its source as recovery", async () => {
  const f = clientFor(valid()); const result = await f.client.loadWithMetadata!();
  assert.equal(result.source, "legacy");
  assert.deepEqual(f.calls[1], { name: "load_pcb_designer_legacy_workspace", args: {} });
});
for (const error of [
  { code: "PGRST202", message: "Could not find the function workspace.load_pcb_designer_legacy_workspace() in the schema cache" },
  { status: 401, message: "expired" }, { code: "42501", message: "actor or no PCB access" },
  { code: "P0001", message: "PCB workspace access denied" }, { status: 500, message: "temporary unavailable" },
]) test(`protected compatibility failure never falls back again: ${JSON.stringify(error)}`, async () => {
  const f = clientFor(valid(), { legacyError: error }); await assert.rejects(f.client.load!());
  assert.equal(f.calls.length, 2); assert.notEqual(f.client.getAccessSnapshot!().status, "ready");
});

test("missing session cannot enter either modern or legacy RPC", async () => {
  const f = clientFor(valid(), { session: false }); await assert.rejects(f.client.loadWithMetadata!()); assert.equal(f.calls.length, 0);
});

test("successful legacy load blocks direct writes and lock acquisition without issuing any mutation RPC", async () => {
  const f = clientFor(valid()); await f.client.load!();
  const calls = f.calls.length;
  assert.equal(await f.client.save!(state("New")), false);
  assert.equal(await f.client.deleteProject!("board-A"), false);
  assert.equal(await f.client.saveModelAsset!({} as never), false);
  assert.deepEqual(await f.client.acquireProjectLock!({ projectId: "board-A", projectName: "Synthetic" }), { available: true, acquired: false, lock: null });
  assert.equal(f.calls.length, calls);
});

test("missing lock RPCs fail closed and never report an unlocked editor or successful release", async () => {
  const calls: string[] = [];
  const database = { rpc: async (name: string) => { calls.push(name); return { data: null, error: { code: "PGRST202", message: `Could not find the function workspace.${name}(p_user_id) in the schema cache` } }; } } as unknown as PcbAccountDatabase;
  const auth = { getSession: async () => ({ data: { session: { access_token: "synthetic", expires_at: 4_102_444_800, user: { id: "auth-not-system-id" } } }, error: null }) };
  const client = createPcbAccountRemoteClient(database, ownerA, "own-tab", auth);
  await assert.rejects(client.acquireProjectLock!({ projectId: "board-A", projectName: "Synthetic" }));
  await assert.rejects(client.loadProjectLock!("board-A"));
  assert.equal(await client.releaseProjectLock!("board-A"), false);
  assert.deepEqual(calls, ["acquire_pcb_designer_project_lock", "load_pcb_designer_project_lock", "release_pcb_designer_project_lock"]);
});

function guardedSourceFixture() {
  const legacy: PcbRemoteLoadResult = { source: "legacy", state: state("Legacy"), ownSnapshotPresent: true };
  const modern: PcbRemoteLoadResult = { source: "modern", state: state("Modern") };
  let load: () => Promise<PcbRemoteLoadResult> = async () => legacy;
  let session: PcbSession | null = { access_token: "synthetic", expires_at: 4_102_444_800, user: { id: "synthetic-auth-A" } };
  const listeners = new Set<(event: string, session: PcbSession | null) => void>();
  const auth: PcbSessionSource = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; },
  };
  const writes: string[] = [];
  const client = guardPcbRemoteClient({
    load: async () => { throw new Error("Metadata-capable clients must not use their untagged loader"); },
    loadWithMetadata: () => load(),
    save: async () => { writes.push("save"); return true; },
    deleteProject: async () => { writes.push("delete"); return true; },
    saveModelAsset: async () => { writes.push("model"); return true; },
  }, auth);
  return { client, writes, legacy, modern,
    load: (next: () => Promise<PcbRemoteLoadResult>) => { load = next; },
    session: (id: string | null, event?: string) => {
      session = id ? { access_token: "synthetic", expires_at: 4_102_444_800, user: { id } } : null;
      if (event) listeners.forEach(listener => listener(event, session));
    },
    writeAll: () => Promise.all([client.save!(state("Draft")), client.deleteProject!("board-Draft"), client.saveModelAsset!({} as never)]),
  };
}

test("generic guard load uses verified source mode: legacy blocks all writes, modern null restores them", async () => {
  const f = guardedSourceFixture();
  assert.deepEqual(await f.client.load!(), f.legacy.state);
  assert.deepEqual(await f.writeAll(), [false, false, false]);
  assert.deepEqual(f.writes, []);
  f.load(async () => ({ source: "modern", state: null }));
  assert.equal(await f.client.load!(), null);
  assert.deepEqual(await f.writeAll(), [true, true, true]);
  assert.deepEqual(f.writes, ["save", "delete", "model"]);
});

for (const staleSource of ["legacy", "modern"] as const) test(`generic guard load ignores stale ${staleSource} mode after a newer verified load`, async () => {
  const f = guardedSourceFixture();
  const unsubscribe = f.client.subscribeAccess!(() => undefined);
  let resolve!: (result: PcbRemoteLoadResult) => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const delayed = new Promise<PcbRemoteLoadResult>(done => { resolve = done; });
  f.load(() => { started(); return delayed; });
  const oldRequest = f.client.load!();
  const rejected = assert.rejects(oldRequest);
  try {
    await began;
    f.session(null, "SIGNED_OUT");
    f.session("synthetic-auth-A", "SIGNED_IN");
    f.load(async () => staleSource === "legacy" ? f.modern : f.legacy);
    await f.client.load!();
    resolve(staleSource === "legacy" ? f.legacy : f.modern);
    await rejected;
    const allowed = staleSource === "legacy";
    assert.deepEqual(await f.writeAll(), [allowed, allowed, allowed]);
    assert.equal(f.writes.length, allowed ? 3 : 0);
  } finally { unsubscribe(); }
});

test("generic guard load cannot change legacy mode when actor changes without a subscription", async () => {
  const f = guardedSourceFixture(); await f.client.load!();
  let resolve!: (result: PcbRemoteLoadResult) => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const delayed = new Promise<PcbRemoteLoadResult>(done => { resolve = done; });
  f.load(() => { started(); return delayed; });
  const oldRequest = f.client.load!(); const rejected = assert.rejects(oldRequest);
  await began;
  f.session("synthetic-auth-B"); resolve(f.modern); await rejected;
  assert.equal(f.client.getAccessSnapshot!().status, "denied");
  f.session("synthetic-auth-A"); f.client.retryAccess!();
  assert.deepEqual(await f.writeAll(), [false, false, false]);
  assert.deepEqual(f.writes, []);
  f.load(async () => f.modern); await f.client.load!();
  assert.deepEqual(await f.writeAll(), [true, true, true]);
});

test("generic guard retains the untagged load API for clients without metadata", async () => {
  const value = state("Plain"); let loads = 0;
  const client = guardPcbRemoteClient({ load: async () => { loads++; return value; }, save: async () => true }, {
    getSession: async () => ({ data: { session: { access_token: "synthetic", expires_at: 4_102_444_800, user: { id: "synthetic-auth" } } }, error: null }),
  });
  assert.equal(client.loadWithMetadata, undefined);
  assert.deepEqual(await client.load!(), value);
  assert.equal(loads, 1);
  assert.equal(await client.save!(value), true);
});
