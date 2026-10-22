import assert from "node:assert/strict";
import test from "node:test";

const objectUrls: string[] = [];
(globalThis as { URL: typeof URL }).URL.createObjectURL ??= ((blob: Blob) => { const url = `blob:test/${objectUrls.length}-${blob.size}`; objectUrls.push(url); return url; }) as typeof URL.createObjectURL;
(globalThis as { URL: typeof URL }).URL.revokeObjectURL ??= (() => {}) as typeof URL.revokeObjectURL;

const adapterModule = await import(new URL("../../src/components/test-plan/core/memoryAdapter.ts", import.meta.url).href);
const repositoryModule = await import(new URL("../../src/components/test-plan/core/repository.ts", import.meta.url).href);
const { createMemoryTestPlanAdapter } = adapterModule as typeof import("../../src/components/test-plan/core/memoryAdapter.ts");
const { createTestPlanRepository } = repositoryModule as typeof import("../../src/components/test-plan/core/repository.ts");

const identity = { ownerId: "demo-admin", displayName: "Operator 7", username: "operator7" };

test("seeds a personal space for the demo account plus pinned and other users with their own files", async () => {
  const adapter = createMemoryTestPlanAdapter(identity);
  const spaces = await adapter.listSpaces(null);
  const mine = spaces.find((space) => space.ownerId === "demo-admin");
  assert.ok(mine?.isPersonal, "the demo account owns a personal space");
  assert.equal(mine?.name, "Operator 7");
  assert.ok(spaces.some((space) => space.ownerRole === "admin" && space.ownerId !== "demo-admin"), "an administrator space is pinned");
  assert.ok(spaces.some((space) => space.ownerRole === "engineer"), "other users appear in the picker");
  const files = await adapter.listFiles();
  assert.ok(files.length >= 12);
  assert.ok(files.every((file) => spaces.some((space) => space.id === file.spaceId)));
  assert.ok(files.every((file) => file.storagePath.startsWith(`${file.spaceId}/`)));
  const folders = await adapter.listFolders(mine!.id);
  assert.ok(folders.length >= 3);
  assert.ok(files.some((file) => file.folderId && folders.some((folder) => folder.id === file.folderId)));
});

test("simulated uploads report monotonic progress and become downloadable records", async () => {
  const adapter = createMemoryTestPlanAdapter(identity);
  const repository = createTestPlanRepository(adapter);
  const [mine] = (await adapter.listSpaces(null)).filter((space) => space.ownerId === "demo-admin");
  const file = new File([new Uint8Array(2400)], "report.txt", { type: "text/plain" });
  const seen: number[] = [];
  const result = await repository.uploadFiles({
    ownerId: "demo-admin", projectId: null, spaceId: mine.id, folderId: null, files: [file],
    onProgress: (progress) => seen.push(progress.uploadedBytes),
  });
  assert.equal(result.failures.length, 0);
  assert.ok(seen.length >= 20);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.equal(seen.at(-1), 2400);
  const uploaded = (await adapter.listFiles(mine.id)).find((record) => record.originalName === "report.txt");
  assert.ok(uploaded);
  const blob = await adapter.downloadObject(uploaded!.storagePath);
  assert.equal(blob.size, 2400);
  const urls = await repository.getFileDownloadUrls([uploaded!]);
  assert.match(urls.get(uploaded!.id) ?? "", /^blob:/);
});

test("folder deletion removes descendants and queues storage cleanup for the owner", async () => {
  const adapter = createMemoryTestPlanAdapter(identity);
  const [mine] = (await adapter.listSpaces(null)).filter((space) => space.ownerId === "demo-admin");
  const parent = await adapter.createFolder({ spaceId: mine.id, parentId: null, name: "parent", createdBy: "demo-admin" });
  const child = await adapter.createFolder({ spaceId: mine.id, parentId: parent.id, name: "child", createdBy: "demo-admin" });
  const record = await adapter.createFile({ spaceId: mine.id, folderId: child.id, originalName: "nested.bin", storagePath: `${mine.id}/nested/nested.bin`, mimeType: null, extension: "bin", category: "other", fileSize: 3, uploadedBy: "demo-admin" });
  await adapter.deleteFolder(parent.id);
  assert.ok(!(await adapter.listFolders(mine.id)).some((folder) => folder.id === child.id));
  assert.ok(!(await adapter.listFiles(mine.id)).some((file) => file.id === record.id));
  assert.deepEqual(await adapter.listCleanupPaths("demo-admin"), [record.storagePath]);
  await adapter.completeCleanupPaths("demo-admin", [record.storagePath]);
  assert.deepEqual(await adapter.listCleanupPaths("demo-admin"), []);
});
