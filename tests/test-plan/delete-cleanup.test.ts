import assert from "node:assert/strict";
import test from "node:test";
import { createTestPlanRepository, type TestPlanDataAdapter } from "../../src/components/test-plan/core/repository.ts";
import type { TestPlanFileRecord } from "../../src/components/test-plan/types.ts";

const admin = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-10-14T00:00:00Z";

function file(id: string, uploader = owner, folderId: string | null = null): TestPlanFileRecord {
  return { id, uploadedBy: uploader, folderId, spaceId: "personal-space", storagePath: `${uploader}/global/personal-space/${id}`, originalName: `${id}.txt`, extension: "txt", category: "document", fileSize: 4, mimeType: "text/plain", description: null, createdAt: stamp, updatedAt: stamp };
}

function setup(actor: string, initial: TestPlanFileRecord[]) {
  const records = new Map(initial.map(item => [item.id, item]));
  const objects = new Set(initial.map(item => item.storagePath));
  const queue = new Map<string, { ownerId: string; requestedBy: string | null }>();
  const operations: string[] = [];
  let metadataFailure = false;
  let removalFailure = false;
  const eligible = (item: { ownerId: string; requestedBy: string | null }, user: string) => item.ownerId === user || item.requestedBy === user;
  const deleteMetadata = (item: TestPlanFileRecord) => {
    records.delete(item.id);
    // Match the real BEFORE DELETE trigger: preserve uploader; claim requester.
    queue.set(item.storagePath, { ownerId: item.uploadedBy, requestedBy: actor });
  };
  const adapter = {
    async deleteFile(id: string) {
      operations.push(`delete-file:${id}`);
      if (metadataFailure) throw new Error("metadata denied");
      const item = records.get(id);
      if (!item) throw new Error("missing metadata");
      deleteMetadata(item);
    },
    async deleteFolder(id: string) {
      operations.push(`delete-folder:${id}`);
      if (metadataFailure) throw new Error("metadata denied");
      for (const item of records.values()) if (item.folderId === id) deleteMetadata(item);
    },
    async listCleanupPaths(user: string) {
      operations.push(`list-cleanup:${user}`);
      // Unlike the earlier fixture, another uploader's queue is not returned
      // unless the actor really requested that deletion.
      return [...queue].filter(([, row]) => eligible(row, user)).map(([path]) => path);
    },
    async removeObjects(paths: string[]) {
      operations.push(`remove:${paths.join(",")}`);
      if (removalFailure) throw new Error("storage unavailable");
      for (const path of paths) {
        const item = queue.get(path);
        assert.ok(item && eligible(item, actor), "Storage authorization follows owner/requester");
        assert.ok(![...records.values()].some(item => item.storagePath === path), "Live metadata must never be cleaned by queue authorization");
        objects.delete(path);
      }
    },
    async completeCleanupPaths(user: string, paths: string[]) {
      operations.push(`complete-cleanup:${user}:${paths.join(",")}`);
      for (const path of paths) {
        const item = queue.get(path);
        assert.ok(item && eligible(item, user));
        assert.ok(!objects.has(path), "Do not acknowledge queued objects until physical removal succeeds");
        queue.delete(path);
      }
    },
    async listSpaces() { return []; },
    async listFolders() { return []; },
    async listFiles() { return [...records.values()]; },
  };
  return { adapter: adapter as unknown as TestPlanDataAdapter, records, objects, queue, operations,
    setMetadataFailure(value: boolean) { metadataFailure = value; },
    setRemovalFailure(value: boolean) { removalFailure = value; },
  };
}

test("admin deletion cleans another uploader's object using the recorded requester and leaves unrelated queue entries alone", async () => {
  const item = file("cody-file");
  const state = setup(admin, [item]);
  const unrelated = `${third}/global/other/unrelated`;
  state.queue.set(unrelated, { ownerId: third, requestedBy: third });
  state.objects.add(unrelated);
  const result = await createTestPlanRepository(state.adapter).deleteFile(admin, item);
  assert.deepEqual(result, { cleanupPending: false });
  assert.equal(state.records.has(item.id), false);
  assert.equal(state.objects.has(item.storagePath), false);
  assert.equal(state.queue.has(item.storagePath), false);
  assert.equal(state.queue.has(unrelated), true);
  assert.equal(state.objects.has(unrelated), true);
  assert.deepEqual(state.operations.slice(0, 2), [`delete-file:${item.id}`, `list-cleanup:${admin}`]);
});

test("a personal-space owner can finish cleanup of an administrator's delegated upload", async () => {
  const item = file("delegated", admin);
  const state = setup(owner, [item]);
  const repository = createTestPlanRepository(state.adapter);
  state.setRemovalFailure(true);
  assert.deepEqual(await repository.deleteFile(owner, item), { cleanupPending: true });
  assert.deepEqual(state.queue.get(item.storagePath), { ownerId: admin, requestedBy: owner });
  assert.equal(state.records.size, 0);
  assert.ok(state.objects.has(item.storagePath));
  state.setRemovalFailure(false);
  await repository.loadWorkspace(owner, null, null);
  assert.equal(state.objects.size, 0);
  assert.equal(state.queue.size, 0);
});

test("folder deletion cleans every cascaded file even when uploaders differ", async () => {
  const items = [file("one", owner, "folder"), file("two", admin, "folder"), file("three", third, "folder"), file("keep", owner, "other-folder")];
  const state = setup(admin, items);
  const result = await createTestPlanRepository(state.adapter).deleteFolder(admin, "folder");
  assert.deepEqual(result, { cleanupPending: false });
  assert.deepEqual([...state.records.keys()], ["keep"]);
  assert.deepEqual([...state.objects], [items[3].storagePath]);
  assert.equal(state.queue.size, 0);
});

test("physical cleanup failures retain the queue without turning committed metadata deletion into a failed action", async () => {
  const item = file("retry");
  const state = setup(admin, [item]);
  const repository = createTestPlanRepository(state.adapter);
  state.setRemovalFailure(true);
  const result = await repository.deleteFile(admin, item);
  assert.deepEqual(result, { cleanupPending: true });
  assert.equal(state.records.size, 0);
  assert.ok(state.objects.has(item.storagePath));
  assert.equal(state.queue.size, 1);
  assert.ok(!state.operations.some(operation => operation.startsWith("complete-cleanup:")));
  state.setRemovalFailure(false);
  const refreshed = await repository.loadWorkspace(admin, null);
  assert.equal(refreshed.files.length, 0);
  assert.equal(state.objects.size, 0);
  assert.equal(state.queue.size, 0);
  assert.equal(state.operations.filter(operation => operation.startsWith("delete-file:")).length, 1);
});

test("folder cleanup failures also return pending and preserve all queued objects for retry", async () => {
  const items = [file("one", owner, "folder"), file("two", third, "folder")];
  const state = setup(admin, items);
  state.setRemovalFailure(true);
  assert.deepEqual(await createTestPlanRepository(state.adapter).deleteFolder(admin, "folder"), { cleanupPending: true });
  assert.equal(state.records.size, 0);
  assert.equal(state.queue.size, 2);
  assert.equal(state.objects.size, 2);
});

test("metadata failures still reject and never remove physical objects or acknowledge cleanup", async () => {
  for (const kind of ["file", "folder"]) {
    const item = file("protected", owner, "folder");
    const state = setup(admin, [item]);
    state.setMetadataFailure(true);
    const repository = createTestPlanRepository(state.adapter);
    await assert.rejects(kind === "file" ? repository.deleteFile(admin, item) : repository.deleteFolder(admin, "folder"), /metadata denied/);
    assert.equal(state.records.size, 1);
    assert.equal(state.objects.size, 1);
    assert.equal(state.queue.size, 0);
    assert.equal(state.operations.length, 1);
  }
});
