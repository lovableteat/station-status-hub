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
      projectId: "project-1",
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
  failFolderName?: string;
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
      async listSpaces(projectId?: string | null) {
        operations.push(`list-spaces:${projectId}`);
        return records.spaces.filter((space) => !projectId || space.projectId === projectId);
      },
      async listFolders(spaceId?: string) {
        operations.push(`list-folders:${spaceId}`);
        return records.folders.filter((folder) => !spaceId || folder.spaceId === spaceId);
      },
      async listFiles(spaceId?: string) {
        operations.push(`list-files:${spaceId}`);
        return records.files.filter((file) => !spaceId || file.spaceId === spaceId);
      },
      async createSpace(input: Record<string, unknown>) {
        operations.push(`create-space:${input.ownerId}`);
        const space = {
          id: `space-${records.spaces.length + 1}`,
          projectId: input.projectId === null ? null : String(input.projectId),
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
      async deleteSpace(spaceId: string, ownerId: string, projectId: string) {
        operations.push(`delete-space:${spaceId}:${ownerId}:${projectId}`);
        records.files
          .filter((file) => file.spaceId === spaceId)
          .forEach((file) => cleanupPaths.push(file.storagePath));
      },
      async createFolder(input: Record<string, unknown>) {
        operations.push(`create-folder:${String(input.parentId)}:${String(input.name)}`);
        if (input.name === options.failFolderName) throw new Error("folder failed");
        const folder = {
          id: `folder-${records.folders.length + 1}`,
          spaceId: String(input.spaceId),
          parentId: input.parentId ? String(input.parentId) : null,
          name: String(input.name),
          createdBy: String(input.createdBy),
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
        };
        records.folders.push(folder);
        return folder;
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

test("loads only the active project's spaces and activates the requested or first available space", async () => {
  const fake = createAdapter();
  fake.records.spaces.push({
    ...fake.records.spaces[0],
    id: "other-space",
    projectId: "project-2",
  });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const loaded = await repository.loadWorkspace("owner-1", "project-1", "missing");

  assert.equal(loaded.activeSpaceId, "space-1");
  assert.deepEqual(
    loaded.spaces.map((space: { id: string }) => space.id),
    ["space-1"],
  );
  assert.ok(fake.operations.includes("list-spaces:project-1"));
  assert.ok(fake.operations.includes("list-folders:space-1"));
});

test("creating the first personal space returns an immediately activatable record", async () => {
  const fake = createAdapter();
  fake.records.spaces.length = 0;
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const space = await repository.createSpace("owner-1", "project-1", {
    name: "Power board",
    description: "EVT files",
    color: "#38bdf8",
  });

  assert.equal(space.ownerId, "owner-1");
  assert.equal(space.name, "Power board");
});

test("all-files library preserves nested legacy files from multiple projects without a write", async () => {
  const fake = createAdapter();
  fake.records.spaces.push({...fake.records.spaces[0], id: "space-2", projectId: "project-2"});
  fake.records.files.push({...fake.records.files[0], id: "file-2", spaceId: "space-2", storagePath: "owner-1/project-2/space-2/original.brd"});
  const before = structuredClone(fake.records);
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const loaded = await repository.loadWorkspace("owner-1", null, null);
  assert.equal(loaded.activeSpaceId, null);
  assert.equal(loaded.spaces.length, 2);
  assert.deepEqual(loaded.files.map((file: { id: string }) => file.id), ["file-1", "file-2"]);
  assert.equal(loaded.folders.length, 2);
  assert.deepEqual(fake.records, before);
  assert.ok(fake.operations.every(operation => operation.startsWith("list-")));
  const selected = await repository.loadWorkspace("owner-1", null, "space-2");
  assert.equal(selected.activeSpaceId, "space-2");
  assert.deepEqual(selected.files.map((file: { id: string }) => file.id), ["file-2"]);
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
    projectId: "project-1",
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
    projectId: "project-1",
    spaceId: "space-1",
    folderId: null,
    files: [new File(["bad"], "bad.step", { type: "model/step" })],
  });

  assert.ok(
    fake.operations.some((operation) =>
      operation.startsWith("queue-cleanup:owner-1:owner-1/project-1/space-1/")),
  );
});

test("keeps an empty browser MIME type as null metadata", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);

  const result = await repository.uploadFiles({
    ownerId: "owner-1",
    projectId: "project-1",
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
    projectId: "project-1",
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

  await repository.deleteSpace("owner-1", "space-1", "project-1");

  assert.deepEqual(fake.operations.slice(-4), [
    "delete-space:space-1:owner-1:project-1",
    "list-cleanup:owner-1",
    `remove:${fake.records.files[0].storagePath}`,
    `complete-cleanup:owner-1:${fake.records.files[0].storagePath}`,
  ]);
});

function folderFile(path: string, contents = "data") {
  const file = new File([contents], path.split("/").at(-1) || "file.md");
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

const folderUploadTarget = {
  ownerId: "owner-1", projectId: "project-1", spaceId: "space-1", folderId: "folder-b", preservePaths: true,
};

test("folder upload preserves its root and nested paths beneath the selected folder, including over 20 files", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const files = Array.from({ length: 25 }, (_, index) => folderFile(`Release/docs/file-${index}.md`));
  files.push(folderFile("Release/pcb/file-0.md"));
  const result = await repository.uploadFiles({ ...folderUploadTarget, files });
  assert.equal(result.uploaded.length, 26);
  assert.equal(result.failures.length, 0);
  const root = fake.records.folders.find(folder => folder.name === "Release")!;
  assert.equal(root.parentId, "folder-b");
  const docs = fake.records.folders.find(folder => folder.name === "docs")!;
  const pcb = fake.records.folders.find(folder => folder.name === "pcb")!;
  assert.equal(docs.parentId, root.id);
  assert.equal(pcb.parentId, root.id);
  assert.ok(result.uploaded.slice(0, 25).every(file => file.folderId === docs.id));
  assert.equal(result.uploaded.at(-1)?.folderId, pcb.id);
});

test("folder upload rejects unsafe or ambiguous relative paths before any reads or writes", async () => {
  for (const path of ["Release/../file.md", "/Release/file.md", "C:/Release/file.md", "Release//file.md", "Release\\file.md", "Release/./file.md", "Release/\u0000/file.md", `${"x".repeat(121)}/file.md`, "file.md"]) {
    const fake = createAdapter();
    const repository = repositoryModule.createTestPlanRepository(fake.adapter);
    await assert.rejects(repository.uploadFiles({ ...folderUploadTarget, files: [folderFile("Release/good.md"), folderFile(path)] }), /路徑/);
    assert.deepEqual(fake.operations, [], path);
  }
});

test("folder upload rejects duplicate paths and file-folder collisions before writes", async () => {
  for (const paths of [["Release/docs/a.md", "Release/docs/A.md"], ["Release/docs", "Release/docs/a.md"]]) {
    const fake = createAdapter();
    const repository = repositoryModule.createTestPlanRepository(fake.adapter);
    await assert.rejects(repository.uploadFiles({ ...folderUploadTarget, files: paths.map(path => folderFile(path)) }), /衝突/);
    assert.deepEqual(fake.operations, []);
  }
});

test("folder upload reuses existing hierarchy and refuses existing file and folder collisions", async () => {
  const fake = createAdapter();
  fake.records.folders[0].name = "Release";
  fake.records.folders[1].name = "docs";
  fake.records.folders.push({ ...fake.records.folders[1], id: "nested-folder", parentId: "folder-b", name: "nested" });
  const before = structuredClone(fake.records.files[0]);
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const result = await repository.uploadFiles({ ...folderUploadTarget, folderId: null, files: [folderFile("Release/docs/board.brd"), folderFile("Release/docs/new.md"), folderFile("Release/docs/nested")] });
  assert.equal(result.uploaded.length, 1);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0].message, /同名/);
  assert.deepEqual(fake.records.files[0], before);
  assert.equal(fake.operations.some(operation => operation.startsWith("create-folder:")), false);
  assert.equal(fake.operations.some(operation => operation.startsWith("upload:board.brd:")), false);
});

test("folder upload reports exact failed paths, keeps successful files and retries only failures", async () => {
  const fake = createAdapter({ failInsertName: "bad.md" });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const good = folderFile("Release/docs/good.md", "good");
  const bad = folderFile("Release/docs/bad.md", "bad");
  const progress: { completed: number; uploadedBytes: number }[] = [];
  const result = await repository.uploadFiles({ ...folderUploadTarget, files: [good, bad], onProgress: value => progress.push(value) });
  assert.equal(result.uploaded.length, 1);
  assert.equal(result.failures[0].fileName, "Release/docs/bad.md");
  assert.deepEqual(result.failedFiles, [bad]);
  assert.equal(progress.at(-1)?.completed, 2);
  assert.equal(progress.at(-1)?.uploadedBytes, good.size);
  fake.adapter.createFile = async input => {
    const file = { ...fake.records.files[0], ...input, id: "recovered" };
    fake.records.files.push(file);
    return file;
  };
  const retried = await repository.uploadFiles({ ...folderUploadTarget, files: result.failedFiles });
  assert.equal(retried.uploaded.length, 1);
  assert.equal(retried.failures.length, 0);
  assert.equal(fake.operations.filter(operation => operation.startsWith("upload:good.md:")).length, 1);
});

test("folder creation failure does not flatten files or prevent an unrelated subtree upload", async () => {
  const fake = createAdapter({ failFolderName: "broken" });
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const result = await repository.uploadFiles({ ...folderUploadTarget, files: [folderFile("Release/broken/a.md"), folderFile("Release/good/b.md")] });
  assert.equal(result.failures[0].fileName, "Release/broken/a.md");
  assert.equal(result.uploaded.length, 1);
  assert.equal(fake.operations.some(operation => operation.startsWith("upload:a.md:")), false);
  const target = fake.records.folders.find(folder => folder.name === "good")!;
  assert.equal(result.uploaded[0].folderId, target.id);
});

test("folder upload refuses a target folder from another space before writing", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  await assert.rejects(repository.uploadFiles({ ...folderUploadTarget, folderId: "missing", files: [folderFile("Release/a.md")] }), /目標資料夾/);
  assert.equal(fake.operations.some(operation => operation.startsWith("create-") || operation.startsWith("upload:")), false);
});

test("folder upload reports blocked and oversized files without creating empty folders", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const large = folderFile("Release/large.md");
  Object.defineProperty(large, "size", { value: 1024 ** 3 + 1 });
  const result = await repository.uploadFiles({ ...folderUploadTarget, files: [folderFile("Release/program.exe"), large] });
  assert.equal(result.uploaded.length, 0);
  assert.match(result.failures[0].message, /安全性/);
  assert.match(result.failures[1].message, /1 GiB/);
  assert.equal(result.failedFiles.length, 2);
  assert.deepEqual(fake.operations, []);
});

test("folder upload keeps the 1 GiB batch budget and identifies the exact rejected path among duplicate basenames", async () => {
  const fake = createAdapter();
  const repository = repositoryModule.createTestPlanRepository(fake.adapter);
  const files = ["Release/a/same.md", "Release/b/same.md", "Release/c/same.md"].map(path => {
    const file = folderFile(path);
    Object.defineProperty(file, "size", { value: 500 * 1024 ** 2 });
    return file;
  });
  const result = await repository.uploadFiles({ ...folderUploadTarget, files });
  assert.equal(result.uploaded.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].fileName, "Release/c/same.md");
  assert.match(result.failures[0].message, /1 GiB/);
  assert.deepEqual(result.failedFiles, [files[2]]);
  for (const [index, name] of ["a", "b"].entries()) {
    const folder = fake.records.folders.find(folder => folder.name === name)!;
    assert.equal(result.uploaded[index].folderId, folder.id);
    assert.notEqual(folder.parentId, "folder-b");
  }
  assert.equal(fake.records.folders.some(folder => folder.name === "c"), false);
  const retry = await repository.uploadFiles({ ...folderUploadTarget, files: result.failedFiles });
  assert.equal(retry.uploaded.length, 1);
  assert.equal(retry.failures.length, 0);
  assert.equal(fake.operations.filter(operation => operation.startsWith("upload:same.md:")).length, 3);
  const retriedFolder = fake.records.folders.find(folder => folder.name === "c")!;
  assert.equal(retry.uploaded[0].folderId, retriedFolder.id);
});
