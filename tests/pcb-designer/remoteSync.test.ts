import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePcbRemoteState,
  PcbRemoteSyncCoordinator,
  syncPcbRemote,
} from "../../src/components/pcb-designer/core/remoteSync.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";

function state(name: string): PcbSaveState {
  const project = createBlankProject(name);
  return { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("skips queued stale generations before they issue remote writes", async () => {
  const writes: string[] = [];
  const statuses: string[] = [];
  const coordinator = new PcbRemoteSyncCoordinator(async (next) => {
    writes.push(next.projects[0].name);
    return true;
  }, (status) => statuses.push(status));

  coordinator.schedule(state("older"));
  coordinator.schedule(state("newer"));
  await coordinator.flush();

  assert.deepEqual(writes, ["newer"]);
  assert.deepEqual(statuses, ["synced"]);
});

test("serializes an in-flight old write behind the latest state and ignores stale completion status", async () => {
  const first = deferred<boolean>();
  const second = deferred<boolean>();
  const writes: string[] = [];
  const statuses: string[] = [];
  const coordinator = new PcbRemoteSyncCoordinator(async (next) => {
    writes.push(next.projects[0].name);
    return next.projects[0].name === "older" ? first.promise : second.promise;
  }, (status) => statuses.push(status));

  coordinator.schedule(state("older"));
  await Promise.resolve();
  coordinator.schedule(state("newer"));
  first.resolve(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, ["older", "newer"]);
  assert.deepEqual(statuses, []);
  second.resolve(true);
  await coordinator.flush();

  assert.deepEqual(statuses, ["synced"]);
});

test("does not publish a remote completion after disposal", async () => {
  const completion = deferred<boolean>();
  const statuses: string[] = [];
  const coordinator = new PcbRemoteSyncCoordinator(() => completion.promise, (status) => statuses.push(status));

  coordinator.schedule(state("draft"));
  await Promise.resolve();
  coordinator.dispose();
  completion.resolve(true);
  await coordinator.flush();

  assert.deepEqual(statuses, []);
});

test("reserving a debounced newer generation suppresses an old in-flight synced status", async () => {
  const oldCompletion = deferred<boolean>();
  const newCompletion = deferred<boolean>();
  const writes: string[] = [];
  const statuses: string[] = [];
  const coordinator = new PcbRemoteSyncCoordinator(async (next) => {
    writes.push(next.projects[0].name);
    return next.projects[0].name === "old" ? oldCompletion.promise : newCompletion.promise;
  }, (status) => statuses.push(status));

  const oldGeneration = coordinator.reserve();
  coordinator.commit(oldGeneration, state("old"));
  await Promise.resolve();
  const newGeneration = coordinator.reserve();
  oldCompletion.resolve(true);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(writes, ["old"]);
  assert.deepEqual(statuses, []);

  coordinator.commit(newGeneration, state("new"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  newCompletion.resolve(true);
  await coordinator.flush();

  assert.deepEqual(writes, ["old", "new"]);
  assert.deepEqual(statuses, ["synced"]);
});

test("remote sync deletes only explicit tombstones and preserves unrelated rows", async () => {
  const upsertOptions: Array<{ onConflict: string; defaultToNull: boolean }> = [];
  const tables = {
    pcb_designer_projects: new Set(["deleted-project", "unrelated-project"]),
    pcb_designer_templates: new Set(["deleted-template", "unrelated-template"]),
    pcb_designer_library: new Set(["deleted-component", "unrelated-component"]),
  };
  const client = {
    from(table: keyof typeof tables) {
      return {
        async upsert(
          rows: Array<{ id: string }>,
          options: { onConflict: string; defaultToNull: boolean },
        ) {
          upsertOptions.push(options);
          rows.forEach((row) => tables[table].add(row.id));
          return { error: null };
        },
        async select() {
          return { data: [...tables[table]].map((id) => ({ id })), error: null };
        },
        delete() {
          return {
            async in(_column: string, ids: string[]) {
              ids.forEach((id) => tables[table].delete(id));
              return { error: null };
            },
          };
        },
      };
    },
  };
  const next: PcbSaveState = {
    ...state("current"),
    remoteDeletions: {
      projects: ["deleted-project"],
      templates: ["deleted-template"],
      library: ["deleted-component"],
    },
  };

  assert.equal(await syncPcbRemote(client, next), true);
  assert.deepEqual([...tables.pcb_designer_projects], ["unrelated-project", next.projects[0].id]);
  assert.deepEqual([...tables.pcb_designer_templates], ["unrelated-template"]);
  assert.deepEqual([...tables.pcb_designer_library], ["unrelated-component"]);
  assert.deepEqual(upsertOptions, Array.from({ length: 3 }, () => ({
    onConflict: "owner_id,id",
    defaultToNull: false,
  })));
});

test("merges every teammate project even when the local account snapshot is newer", () => {
  const local = state("Local project");
  const remote = state("Shared teammate project");
  local.updatedAt = "2026-08-13T12:00:00.000Z";
  local.projects[0].updatedAt = local.updatedAt;
  remote.updatedAt = "2026-08-13T11:00:00.000Z";
  remote.projects[0].updatedAt = remote.updatedAt;

  const merged = mergePcbRemoteState(local, remote);

  assert.deepEqual(
    merged.projects.map((project) => project.name).sort(),
    ["Local project", "Shared teammate project"],
  );
  assert.equal(merged.activeProjectId, local.activeProjectId);
});

test("preserves the locally selected project during background reconciliation", () => {
  const local = state("Local project");
  const selected = createBlankProject("Selected local project");
  selected.id = "selected-local-project";
  selected.updatedAt = "2026-08-13T12:00:00.000Z";
  local.projects.push(selected);
  local.activeProjectId = selected.id;
  local.updatedAt = "2026-08-13T12:00:00.000Z";

  const remote = state("Remote project");
  remote.updatedAt = "2026-08-13T13:00:00.000Z";
  remote.projects[0].updatedAt = remote.updatedAt;

  const merged = mergePcbRemoteState(local, remote);

  assert.equal(merged.activeProjectId, selected.id);
  assert.ok(merged.projects.some((project) => project.id === selected.id));
});

test("server project tombstones remove stale local copies", () => {
  const local = state("Deleted elsewhere");
  const remote = state("Still shared");
  remote.remoteDeletions = {
    projects: [local.projects[0].id],
    templates: [],
    library: [],
  };

  const merged = mergePcbRemoteState(local, remote);

  assert.deepEqual(merged.projects.map((project) => project.name), ["Still shared"]);
  assert.deepEqual(merged.remoteDeletions?.projects, [local.projects[0].id]);
});

test("does not publish a fresh local seed as an extra shared project", () => {
  const blankLocal = state(createBlankProject().name);
  const remote = state("Existing team project");

  const merged = mergePcbRemoteState(blankLocal, remote);

  assert.deepEqual(merged.projects.map((project) => project.name), ["Existing team project"]);
});
