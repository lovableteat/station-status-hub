import assert from "node:assert/strict";
import test from "node:test";
import { PcbRemoteSyncCoordinator, syncPcbRemote } from "../../src/components/pcb-designer/core/remoteSync.ts";
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
    onConflict: "id",
    defaultToNull: false,
  })));
});
