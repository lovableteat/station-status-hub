import assert from "node:assert/strict";
import test from "node:test";
import {
  createPcbAccountRemoteClient as createGuardedClient,
  isDatabaseUserId,
  type PcbAccountDatabase,
} from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { parsePcbLegacyWorkspace } from "../../src/components/pcb-designer/core/legacyWorkspace.ts";
import { envelope, LEGACY_KEY as PCB_REMOTE_FALLBACK_KEY } from "./legacy-fixtures.ts";
import { BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbModelAssetMetadata, PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const verifiedSession = {
  getSession: async () => ({
    data: { session: { access_token: "synthetic-session", expires_at: 4_102_444_800, user: { id: "synthetic-auth-id" } } },
    error: null,
  }),
};
function createPcbAccountRemoteClient(database: PcbAccountDatabase, userId: string, clientId?: string) {
  return createGuardedClient(database, userId, clientId, verifiedSession);
}

function createState(name: string): PcbSaveState {
  const project = createBlankProject(name);
  return {
    projects: [project],
    templates: [],
    library: [],
    activeProjectId: project.id,
    pendingPlacementsByProject: {},
    remoteDeletions: { projects: [], templates: [], library: [] },
    updatedAt: project.updatedAt,
  };
}

function mockDatabase(options: {
  rpcAvailable: boolean;
  sharedRpcAvailable?: boolean;
  lockedSaveError?: { code: string; message: string };
  rpcState?: PcbSaveState | null;
  permissions?: Record<string, unknown>;
  records?: Array<{ id: string; permissions: Record<string, unknown> }>;
  modelAssets?: unknown[];
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const permissions = structuredClone(options.permissions ?? {});
  const records = structuredClone(options.records ?? [{ id: "fallback-account", permissions }]);
  const database = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "load_pcb_designer_legacy_workspace") return { data: envelope(records, records[0]?.id ?? "absent"), error: null };
      if (name === "save_pcb_designer_workspace_locked" && options.lockedSaveError) return { data: null, error: options.lockedSaveError };
      if (!options.rpcAvailable || (name.endsWith("_shared") && options.sharedRpcAvailable === false)) {
        return { data: null, error: { code: "PGRST202", message: `Could not find the function workspace.${name}(p_user_id) in the schema cache` } };
      }
      return { data: name === "list_pcb_designer_model_assets" ? options.modelAssets ?? []
        : name === "load_pcb_designer_workspace_shared" ? options.rpcState ?? null
        : name === "delete_pcb_designer_project_locked" ? true : null, error: null };
    },
    from() { throw new Error("PCB must not read or update raw permissions"); },
  } as unknown as PcbAccountDatabase;
  return { database, calls, getPermissions: () => permissions };
}

const cloudMetadata: PcbModelAssetMetadata = {
  schemaVersion: 1,
  id: "step-cloud-part",
  fileName: "connector.step",
  createdAt: "2026-09-08T08:00:00.000Z",
  updatedAt: "2026-09-08T08:00:00.000Z",
  dimensions: { widthMm: 20, depthMm: 10, heightMm: 6 },
  calibratedDimensions: { widthMm: 20, depthMm: 10, heightMm: 6 },
  upAxis: "z",
  bounds: { min: [0, 0, 0], max: [20, 10, 6] },
  parts: [{ id: "body", name: "Body", vertexCount: 8, indexCount: 36 }],
};

test("lists valid cloud STEP metadata so an orphaned library entry can be rebuilt", async () => {
  const mock = mockDatabase({
    rpcAvailable: true,
    modelAssets: [cloudMetadata, { ...cloudMetadata, id: "", fileName: "broken.step" }],
  });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "11111111-1111-4111-8111-111111111111",
  );

  assert.deepEqual(await client.listModelAssets?.(), [cloudMetadata]);
  assert.equal(mock.calls.at(-1)?.name, "list_pcb_designer_model_assets");
});

test("loads a dedicated account workspace and refreshes built-in catalogs", async () => {
  const state = createState("Cloud project");
  const mock = mockDatabase({ rpcAvailable: true, rpcState: state });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "11111111-1111-4111-8111-111111111111",
  );

  const loaded = await client.load?.();

  assert.equal(loaded?.projects[0].name, "Cloud project");
  assert.equal(loaded?.templates.length, BUILT_IN_TEMPLATES.length);
  assert.ok((loaded?.library.length ?? 0) > 0);
  assert.deepEqual(mock.calls.map((call) => call.name), [
    "load_pcb_designer_workspace_shared",
  ]);
});

test("recovers through the protected legacy RPC when the modern RPC is missing", async () => {
  const fallbackState = createState("Compatibility project");
  const mock = mockDatabase({
    rpcAvailable: false,
    permissions: {
      workspaceAccess: { "data-center": "edit" },
      [PCB_REMOTE_FALLBACK_KEY]: fallbackState,
    },
  });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "22222222-2222-4222-8222-222222222222",
  );

  assert.equal((await client.load?.())?.projects[0].name, "Compatibility project");
});

test("fallback load merges every account project while keeping personal catalogs", async () => {
  const own = createState("Own project");
  const teammate = createState("Teammate project");
  own.templates = BUILT_IN_TEMPLATES;
  teammate.templates = [];
  const userId = "22222222-2222-4222-8222-222222222222";
  const mock = mockDatabase({
    rpcAvailable: false,
    records: [
      { id: userId, permissions: { [PCB_REMOTE_FALLBACK_KEY]: own } },
      { id: "99999999-9999-4999-8999-999999999999", permissions: { [PCB_REMOTE_FALLBACK_KEY]: teammate } },
    ],
  });
  const client = createPcbAccountRemoteClient(mock.database, userId);

  const loaded = await client.load?.();

  assert.deepEqual(
    loaded?.projects.map((project) => project.name).sort(),
    ["Own project", "Teammate project"],
  );
  assert.equal(loaded?.activeProjectId, own.activeProjectId);
  assert.equal(loaded?.templates.length, BUILT_IN_TEMPLATES.length);
});

test("protected legacy recovery receives teammate library records without raw permissions", async () => {
  const own = createState("Own project");
  const teammate = createState("Teammate project");
  teammate.library.push({
    id: "shared-resistor",
    name: "Shared resistor",
    type: "Resistor",
    manufacturer: "Acme",
    partNumber: "R-10K",
    width: 2,
    height: 1,
    maxHeight: 1,
    color: "#ffd166",
    source: "custom",
    createdAt: "2026-08-20T08:00:00.000Z",
  });
  const userId = "22222222-2222-4222-8222-222222222222";
  const mock = mockDatabase({
    rpcAvailable: true,
    sharedRpcAvailable: false,
    rpcState: own,
    records: [
      { id: userId, permissions: { [PCB_REMOTE_FALLBACK_KEY]: own } },
      { id: "99999999-9999-4999-8999-999999999999", permissions: { [PCB_REMOTE_FALLBACK_KEY]: teammate } },
    ],
  });
  const client = createPcbAccountRemoteClient(mock.database, userId);

  const loaded = await client.load?.();

  assert.equal(loaded?.projects.some(project => project.name === "Own project"), true);
  assert.equal(loaded?.library.some((component) => component.id === "shared-resistor"), true);
});

test("fallback tombstones delete a project even when another account has a stale copy", () => {
  const creator = createState("Deleted team project");
  const staleTeammate = structuredClone(creator);
  const deletedId = creator.projects[0].id;
  creator.projects = [];
  creator.activeProjectId = null;
  creator.remoteDeletions = { projects: [deletedId], templates: [], library: [] };
  creator.updatedAt = "2026-08-13T14:00:00.000Z";

  const loaded = parsePcbLegacyWorkspace(envelope([
    { id: "creator", permissions: { [PCB_REMOTE_FALLBACK_KEY]: creator } },
    { id: "teammate", permissions: { [PCB_REMOTE_FALLBACK_KEY]: staleTeammate } },
  ], "teammate")).state;

  assert.equal(loaded?.projects.some((project) => project.id === deletedId), false);
  assert.deepEqual(loaded?.remoteDeletions?.projects, [deletedId]);
});

test("legacy recovery cannot create or delete via unlocked compatibility writes", async () => {
  const initialA = createState("Existing project");
  const initialB = createState("Teammate draft");
  const mock = mockDatabase({ rpcAvailable: false, records: [
    { id: "account-a", permissions: { [PCB_REMOTE_FALLBACK_KEY]: initialA } },
    { id: "account-b", permissions: { [PCB_REMOTE_FALLBACK_KEY]: initialB } },
  ] });
  const client = createPcbAccountRemoteClient(mock.database, "account-a");
  assert.equal((await client.load!())?.projects.length, 2);
  assert.equal(await client.save!(initialA), false);
  assert.equal(await client.deleteProject!(initialA.activeProjectId!), false);
  assert.deepEqual(mock.calls.map(call => call.name), ["load_pcb_designer_workspace_shared", "load_pcb_designer_legacy_workspace"]);
  assert.equal((await client.load!())?.projects.length, 2);
});

test("uses the lock-verified save RPC when available", async () => {
  const state = createState("Saved remotely");
  const mock = mockDatabase({ rpcAvailable: true });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "33333333-3333-4333-8333-333333333333",
    "browser-tab-a",
  );

  assert.equal(await client.save?.(state), true);
  assert.equal(mock.calls.at(-1)?.name, "save_pcb_designer_workspace_locked");
  assert.equal(
    (mock.calls.at(-1)?.args.p_payload as PcbSaveState).projects[0].name,
    "Saved remotely",
  );
  assert.equal(mock.calls.at(-1)?.args.p_project_id, state.activeProjectId);
  assert.equal(mock.calls.at(-1)?.args.p_editor_client_id, "browser-tab-a");
});

test("never falls back to an unlocked write when another editor owns the project", async () => {
  const state = createState("Protected project");
  const mock = mockDatabase({
    rpcAvailable: true,
    lockedSaveError: { code: "P0001", message: "PCB project is locked by another editor" },
  });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "33333333-3333-4333-8333-333333333333",
    "browser-tab-b",
  );

  assert.equal(await client.save?.(state), false);
  assert.deepEqual(mock.calls.map((call) => call.name), [
    "save_pcb_designer_workspace_locked",
  ]);
});

test("deletes projects only through the active editor lock", async () => {
  const state = createState("Delete with lock");
  const mock = mockDatabase({ rpcAvailable: true });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "33333333-3333-4333-8333-333333333333",
    "browser-tab-delete",
  );

  assert.equal(await client.deleteProject?.(state.activeProjectId!), true);
  assert.equal(mock.calls.at(-1)?.name, "delete_pcb_designer_project_locked");
  assert.equal(mock.calls.at(-1)?.args.p_project_id, state.activeProjectId);
  assert.equal(mock.calls.at(-1)?.args.p_editor_client_id, "browser-tab-delete");
});

test("missing locked saves never update existing account settings", async () => {
  const state = createState("Fallback save");
  const mock = mockDatabase({
    rpcAvailable: false,
    permissions: {
      all: true,
      workspaceAccess: { "data-center": "edit" },
    },
  });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "44444444-4444-4444-8444-444444444444",
  );

  assert.equal(await client.save?.(state), false);
  assert.deepEqual(mock.calls.map(call => call.name), ["save_pcb_designer_workspace_locked"]);
  assert.equal(mock.getPermissions().all, true);
  assert.deepEqual(mock.getPermissions().workspaceAccess, {
    "data-center": "edit",
  });
  assert.equal(mock.getPermissions()[PCB_REMOTE_FALLBACK_KEY], undefined);
});

test("accepts only database UUID account identifiers", () => {
  assert.equal(isDatabaseUserId("55555555-5555-4555-8555-555555555555"), true);
  assert.equal(isDatabaseUserId("demo-admin"), false);
  assert.equal(isDatabaseUserId(undefined), false);
});
