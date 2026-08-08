import assert from "node:assert/strict";
import test from "node:test";
import {
  createPcbAccountRemoteClient,
  isDatabaseUserId,
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
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let permissions = structuredClone(options.permissions ?? {});
  const database: PcbAccountDatabase = {
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
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { permissions }, error: null };
                },
              };
            },
          };
        },
        update(values) {
          return {
            async eq() {
              permissions = structuredClone(values.permissions);
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };

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
