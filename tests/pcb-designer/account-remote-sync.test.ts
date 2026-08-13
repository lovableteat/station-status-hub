import assert from "node:assert/strict";
import test from "node:test";
import {
  createPcbAccountRemoteClient,
  isDatabaseUserId,
  mergePcbFallbackWorkspaces,
  PCB_REMOTE_FALLBACK_KEY,
  type PcbAccountDatabase,
} from "../../src/components/pcb-designer/core/accountRemoteSync.ts";
import { BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";

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
  rpcState?: PcbSaveState | null;
  permissions?: Record<string, unknown>;
  records?: Array<{ id: string; permissions: Record<string, unknown> }>;
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let permissions = structuredClone(options.permissions ?? {});
  const records = structuredClone(options.records ?? []);
  const database = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (!options.rpcAvailable) {
        return { data: null, error: { code: "PGRST202", message: "missing RPC" } };
      }
      return {
        data: name === "load_pcb_designer_workspace"
          ? options.rpcState ?? null
          : null,
        error: null,
      };
    },
    from() {
      return {
        select(columns: string) {
          if (columns === "id,permissions") {
            return Promise.resolve({
              data: records.length
                ? records
                : [{ id: "fallback-account", permissions }],
              error: null,
            });
          }
          return {
            eq(_column: string, id: string) {
              return {
                async maybeSingle() {
                  const record = records.find((entry) => entry.id === id);
                  return { data: { permissions: record?.permissions ?? permissions }, error: null };
                },
              };
            },
          };
        },
        update(values) {
          return {
            async eq(_column: string, id: string) {
              permissions = structuredClone(values.permissions);
              const record = records.find((entry) => entry.id === id);
              if (record) record.permissions = structuredClone(values.permissions);
              return { data: null, error: null };
            },
          };
        },
      };
    },
  } as unknown as PcbAccountDatabase;

  return {
    database,
    calls,
    getPermissions: () => permissions,
  };
}

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
    "load_pcb_designer_workspace",
  ]);
});

test("falls back to the account permission document when RPCs are not deployed", async () => {
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

test("fallback tombstones delete a project even when another account has a stale copy", () => {
  const creator = createState("Deleted team project");
  const staleTeammate = structuredClone(creator);
  const deletedId = creator.projects[0].id;
  creator.projects = [];
  creator.activeProjectId = null;
  creator.remoteDeletions = { projects: [deletedId], templates: [], library: [] };
  creator.updatedAt = "2026-08-13T14:00:00.000Z";

  const loaded = mergePcbFallbackWorkspaces([
    { id: "creator", permissions: { [PCB_REMOTE_FALLBACK_KEY]: creator } },
    { id: "teammate", permissions: { [PCB_REMOTE_FALLBACK_KEY]: staleTeammate } },
  ], "teammate");

  assert.equal(loaded?.projects.some((project) => project.id === deletedId), false);
  assert.deepEqual(loaded?.remoteDeletions?.projects, [deletedId]);
});

test("fallback clients share create and delete operations across two accounts", async () => {
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const initialA = createState("Existing project");
  const initialB = createState("Teammate draft");
  const mock = mockDatabase({
    rpcAvailable: false,
    records: [
      { id: userA, permissions: { [PCB_REMOTE_FALLBACK_KEY]: initialA } },
      { id: userB, permissions: { [PCB_REMOTE_FALLBACK_KEY]: initialB } },
    ],
  });
  const clientA = createPcbAccountRemoteClient(mock.database, userA);
  const clientB = createPcbAccountRemoteClient(mock.database, userB);
  const created = createBlankProject("Shared new project");
  const withCreated: PcbSaveState = {
    ...initialA,
    projects: [...initialA.projects, created],
    activeProjectId: created.id,
    updatedAt: created.updatedAt,
  };

  assert.equal(await clientA.save?.(withCreated), true);
  const visibleToB = await clientB.load?.();
  assert.equal(visibleToB?.projects.some((project) => project.id === created.id), true);

  assert.equal(await clientB.save?.(visibleToB!), true);
  const deletedAt = new Date(Date.parse(created.updatedAt) + 1_000).toISOString();
  const deletedByA: PcbSaveState = {
    ...withCreated,
    projects: withCreated.projects.filter((project) => project.id !== created.id),
    activeProjectId: initialA.activeProjectId,
    remoteDeletions: { projects: [created.id], templates: [], library: [] },
    updatedAt: deletedAt,
  };
  assert.equal(await clientA.save?.(deletedByA), true);

  const removedForB = await clientB.load?.();
  assert.equal(removedForB?.projects.some((project) => project.id === created.id), false);
  assert.equal(removedForB?.remoteDeletions?.projects.includes(created.id), true);
});

test("uses dedicated save RPC when available", async () => {
  const state = createState("Saved remotely");
  const mock = mockDatabase({ rpcAvailable: true });
  const client = createPcbAccountRemoteClient(
    mock.database,
    "33333333-3333-4333-8333-333333333333",
  );

  assert.equal(await client.save?.(state), true);
  assert.equal(mock.calls.at(-1)?.name, "save_pcb_designer_workspace");
  assert.equal(
    (mock.calls.at(-1)?.args.p_payload as PcbSaveState).projects[0].name,
    "Saved remotely",
  );
});

test("fallback saves preserve existing account settings", async () => {
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

  assert.equal(await client.save?.(state), true);
  assert.equal(mock.getPermissions().all, true);
  assert.deepEqual(mock.getPermissions().workspaceAccess, {
    "data-center": "edit",
  });
  assert.equal(
    (mock.getPermissions()[PCB_REMOTE_FALLBACK_KEY] as PcbSaveState)
      .projects[0].name,
    "Fallback save",
  );
});

test("accepts only database UUID account identifiers", () => {
  assert.equal(isDatabaseUserId("55555555-5555-4555-8555-555555555555"), true);
  assert.equal(isDatabaseUserId("demo-admin"), false);
  assert.equal(isDatabaseUserId(undefined), false);
});
