import assert from "node:assert/strict";
import test from "node:test";

const repositoryModule = await import(
  new URL(
    "../../src/components/test-plan/core/repository.ts",
    import.meta.url,
  ).href,
).catch(() => ({}));

function createRecordSet() {
  const now = "2026-07-29T00:00:00.000Z";
  return {
    spaces: [{
      id: "space-1",
      ownerId: "owner-1",
      name: "Main",
      description: null,
      color: "#22d3ee",
      createdAt: now,
      updatedAt: now,
    }],
    folders: [
      {
        id: "folder-a",
        spaceId: "space-1",
        parentId: null,
        name: "A",
        createdBy: "owner-1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "folder-b",
        spaceId: "space-1",
        parentId: "folder-a",
        name: "B",
        createdBy: "owner-1",
        createdAt: now,
        updatedAt: now,
      },
    ],
    files: [{
      id: "file-1",
      spaceId: "space-1",
      folderId: "folder-b",
      originalName: "board.brd",
      storagePath: "owner-1/space-1/file-1-board.brd",
      mimeType: null,
      extension: "brd",
      category: "pcb",
      fileSize: 100,
      description: null,
      uploadedBy: "owner-1",
      createdAt: now,
      updatedAt: now,
    }],
  };
}

function createAdapter(options: {
  failInsertName?: string;
  failFirstRemove?: boolean;
} = {}) {
  const records = createRecordSet();
  const operations: string[] = [];
  const cleanupPaths: string[] = [];
  let nextFile = 2;
  let removeFailures = options.failFirstRemove ? 1 : 0;
  return {
    records,
    operations,
    adapter: {
      async listSpaces(ownerId: string) {
        operations.push(`list-spaces:${ownerId}`);
        return [...records.spaces];
      },
      async listFolders(spaceId: string) {
        operations.push(`list-folders:${spaceId}`);
        return records.folders.filter((folder) => folder.spaceId === spaceId);
      },
      async listFiles(spaceId: string) {
        operations.push(`list-files:${spaceId}`);
        return records.files.filter((file) => file.spaceId === spaceId);
      },
      async createSpace(input: Record<string, unknown>) {
        operations.push(`create-space:${input.ownerId}`);
        const space = {
          id: `space-${records.spaces.length + 1}`,
          ownerId: String(input.ownerId),
          name: String(input.name),
          description: input.description ? String(input.description) : null,
          color: String(input.color),
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
        };
        records.spaces.push(space);
        return space;
      },
      async updateSpace() {
        throw new Error("not used");
      },
      async deleteSpace(spaceId: string, ownerId: string) {
        operations.push(`delete-space:${spaceId}:${ownerId}`);
        records.files
          .filter((file) => file.spaceId === spaceId)
          .forEach((file) => cleanupPaths.push(file.storagePath));
      },
      async createFolder() {
        throw new Error("not used");
      },
      async updateFolder(folderId: string, patch: Record<string, unknown>) {
        operations.push(`update-folder:${folderId}:${String(patch.parentId)}`);
        return records.folders.find((folder) => folder.id === folderId);
      },
      async deleteFolder(folderId: string) {
        operations.push(`delete-folder:${folderId}`);
        const folderIds = new Set([folderId]);
        let expanded = true;
        while (expanded) {
          expanded = false;
          records.folders.forEach((folder) => {
            if (
              folder.parentId
              && folderIds.has(folder.parentId)
              && !folderIds.has(folder.id)
            ) {
              folderIds.add(folder.id);
              expanded = true;
            }
          });
        }
        records.files
          .filter((file) => file.folderId && folderIds.has(file.folderId))
          .forEach((file) => cleanupPaths.push(file.storagePath));
      },
      async uploadObject(path: string, file: { name: string }) {
        operations.push(`upload:${file.name}:${path}`);
      },
      async replaceObject(path: string, file: { name: string; size: number }) {
        operations.push(`replace:${file.name}:${file.size}:${path}`);
      },
      async createFile(input: Record<string, unknown>) {
        operations.push(`create-file:${String(input.originalName)}`);
        if (input.originalName === options.failInsertName) {
          throw new Error("metadata failed");
        }
        const file = {
          id: `file-${nextFile++}`,
          spaceId: String(input.spaceId),
          folderId: input.folderId ? String(input.folderId) : null,
          originalName: String(input.originalName),
          storagePath: String(input.storagePath),
          mimeType: input.mimeType ? String(input.mimeType) : null,
          extension: String(input.extension),
          category: String(input.category),
          fileSize: Number(input.fileSize),
          description: null,
          uploadedBy: String(input.uploadedBy),
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
        };
        records.files.push(file);
        return file;
      },
      async updateFile(fileId: string, patch: Record<string, unknown>) {
        operations.push(`update-file:${fileId}`);
        const file = records.files.find((candidate) => candidate.id === fileId);
        if (!file) throw new Error("missing file");
        Object.assign(file, patch, { updatedAt: "2026-07-29T01:00:00.000Z" });
        return file;
      },
      async deleteFile(fileId: string) {
        operations.push(`delete-file:${fileId}`);
        const file = records.files.find((candidate) => candidate.id === fileId);
        if (file) cleanupPaths.push(file.storagePath);
      },
      async downloadObject(path: string) {
        operations.push(`download:${path}`);
        return new Blob(["data"]);
      },
      async removeObjects(paths: string[]) {
        operations.push(`remove:${paths.join(",")}`);
        if (removeFailures > 0) {
          removeFailures -= 1;
          throw new Error("storage unavailable");
        }
      },
      async listCleanupPaths(ownerId: string) {
        operations.push(`list-cleanup:${ownerId}`);
        return [...cleanupPaths];
      },
      async queueCleanupPath(ownerId: string, path: string) {
        operations.push(`queue-cleanup:${ownerId}:${path}`);
        if (!cleanupPaths.includes(path)) cleanupPaths.push(path);
      },
      async completeCleanupPaths(ownerId: string, paths: string[]) {
        operations.push(`complete-cleanup:${ownerId}:${paths.join(",")}`);
        paths.forEach((path) => {
          const index = cleanupPaths.indexOf(path);
          if (index >= 0) cleanupPaths.splice(index, 1);
        });
      },
    },
  };
}

test("loads shared spaces and activates the requested or first available space", async () => {
  const fake = createAdapter();
  fake.records.spaces.push({
    ...fake.records.spaces[0],
    id: "other-space",
    ownerId: "owner-2",
  });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const loaded = await repository.loadWorkspace("owner-1", "missing");

  assert.equal(loaded.activeSpaceId, "space-1");
  assert.deepEqual(
    loaded.spaces.map((space: { id: string }) => space.id),
    ["space-1", "other-space"],
  );
  assert.ok(fake.operations.includes("list-spaces:owner-1"));
  assert.ok(fake.operations.includes("list-folders:space-1"));
});

test("creating the first personal space returns an immediately activatable record", async () => {
  const fake = createAdapter();
  fake.records.spaces.length = 0;
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const space = await repository.createSpace("owner-1", {
    name: "Power board",
    description: "EVT files",
    color: "#38bdf8",
  });

  assert.equal(space.ownerId, "owner-1");
  assert.equal(space.name, "Power board");
});

test("cleans an uploaded object when metadata insertion fails and continues the batch", async () => {
  const fake = createAdapter({ failInsertName: "bad.step" });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const files = [
    new File(["ok"], "ok.xlsx", { type: "application/vnd.ms-excel" }),
    new File(["bad"], "bad.step", { type: "model/step" }),
  ];

  const result = await repository.uploadFiles({
    ownerId: "owner-1",
    spaceId: "space-1",
    folderId: null,
    files,
  });

  assert.equal(result.uploaded.length, 1);
  assert.equal(result.failures.length, 1);
  const badUpload = fake.operations.find((operation) => operation.startsWith("upload:bad.step:"));
  const badPath = badUpload?.split(":").slice(2).join(":");
  assert.ok(fake.operations.includes(`remove:${badPath}`));
});

test("durably queues an uploaded object when immediate rollback cleanup fails", async () => {
  const fake = createAdapter({
    failInsertName: "bad.step",
    failFirstRemove: true,
  });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  await repository.uploadFiles({
    ownerId: "owner-1",
    spaceId: "space-1",
    folderId: null,
    files: [new File(["bad"], "bad.step", { type: "model/step" })],
  });

  assert.ok(
    fake.operations.some((operation) =>
      operation.startsWith("queue-cleanup:owner-1:owner-1/space-1/")),
  );
});

test("keeps an empty browser MIME type as null metadata", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const result = await repository.uploadFiles({
    ownerId: "owner-1",
    spaceId: "space-1",
    folderId: null,
    files: [new File(["firmware"], "controller.hex", { type: "" })],
  });

  assert.equal(result.uploaded.length, 1);
  assert.equal(fake.records.files.at(-1)?.mimeType, null);
});

test("gives same-name Unicode uploads distinct opaque ASCII storage keys", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const result = await repository.uploadFiles({
    ownerId: "owner-1",
    spaceId: "space-1",
    folderId: null,
    files: [
      new File(["first"], "測試✅.final.PDF", { type: "application/pdf" }),
      new File(["second"], "測試✅.final.PDF", { type: "application/pdf" }),
    ],
  });

  const paths = result.uploaded.map((file: { storagePath: string }) => file.storagePath);
  assert.equal(result.uploaded.length, 2);
  assert.equal(new Set(paths).size, 2);
  assert.deepEqual(
    result.uploaded.map((file: { originalName: string }) => file.originalName),
    ["測試✅.final.PDF", "測試✅.final.PDF"],
  );
  for (const path of paths) {
    assert.match(path, /^[a-zA-Z0-9._/-]+$/);
    assert.match(path, /\.pdf$/);
  }
});

test("replaces a spreadsheet in place and updates its metadata", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const originalPath = fake.records.files[0].storagePath;
  const originalFileCount = fake.records.files.length;

  const updated = await repository.replaceFileContents(
    fake.records.files[0],
    new Blob(["updated workbook"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );

  assert.equal(fake.records.files.length, originalFileCount);
  assert.equal(updated.storagePath, originalPath);
  assert.equal(updated.fileSize, 16);
  assert.equal(
    updated.mimeType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.ok(
    fake.operations.includes(`replace:board.brd:16:${originalPath}`),
  );
  assert.ok(fake.operations.includes("update-file:file-1"));
  assert.equal(
    fake.operations.some((operation) => operation.startsWith("create-file:")),
    false,
  );
});

test("rejects executable file renames before updating metadata", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  assert.throws(
    () => repository.renameFile("file-1", "payload.exe"),
    /不允許上傳/,
  );
});

test("rejects moving a folder into its descendant before writing", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  await assert.rejects(
    repository.moveFolder("folder-a", "folder-b", fake.records.folders),
    /子資料夾/,
  );
  assert.equal(fake.operations.some((operation) => operation.startsWith("update-folder")), false);
});

test("queues metadata deletion before removing the binary object", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  await repository.deleteFile("owner-1", fake.records.files[0]);

  assert.deepEqual(fake.operations.slice(-4), [
    "delete-file:file-1",
    "list-cleanup:owner-1",
    `remove:${fake.records.files[0].storagePath}`,
    `complete-cleanup:owner-1:${fake.records.files[0].storagePath}`,
  ]);
});

test("deleting a folder cleans every cascaded object through the durable queue", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  await repository.deleteFolder(
    "owner-1",
    "folder-a",
  );

  assert.deepEqual(fake.operations.slice(-4), [
    "delete-folder:folder-a",
    "list-cleanup:owner-1",
    `remove:${fake.records.files[0].storagePath}`,
    `complete-cleanup:owner-1:${fake.records.files[0].storagePath}`,
  ]);
});

test("deleting a non-active space cleans cascaded objects through the durable queue", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  await repository.deleteSpace("owner-1", "space-1");

  assert.deepEqual(fake.operations.slice(-4), [
    "delete-space:space-1:owner-1",
    "list-cleanup:owner-1",
    `remove:${fake.records.files[0].storagePath}`,
    `complete-cleanup:owner-1:${fake.records.files[0].storagePath}`,
  ]);
});
