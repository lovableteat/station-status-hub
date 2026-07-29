import assert from "node:assert/strict";
import test from "node:test";

const filesModule = await import(
  new URL("../../src/components/test-plan/core/files.ts", import.meta.url).href,
).catch(() => ({}));
const treeModule = await import(
  new URL("../../src/components/test-plan/core/tree.ts", import.meta.url).href,
).catch(() => ({}));

test("classifies Office, 3D, PCB, document, image, archive, and unknown files", () => {
  assert.equal(filesModule.classifyTestPlanFile("plan.pptx"), "presentation");
  assert.equal(filesModule.classifyTestPlanFile("matrix.XLSM"), "spreadsheet");
  assert.equal(filesModule.classifyTestPlanFile("board.step"), "3d");
  assert.equal(filesModule.classifyTestPlanFile("layout.kicad_pcb"), "pcb");
  assert.equal(filesModule.classifyTestPlanFile("legacy.BRD"), "pcb");
  assert.equal(filesModule.classifyTestPlanFile("drawing.pdf"), "document");
  assert.equal(filesModule.classifyTestPlanFile("photo.webp"), "image");
  assert.equal(filesModule.classifyTestPlanFile("fab.zip"), "archive");
  assert.equal(filesModule.classifyTestPlanFile("notes.custom"), "other");
});

test("validates executable extensions, 500 MiB file size, and 20-file batches", () => {
  const MiB = 1024 ** 2;
  const result = filesModule.validateTestPlanUpload([
    { name: "safe.step", size: 500 * MiB },
    { name: "unsafe.exe", size: 20 },
    { name: "oversized.glb", size: 500 * MiB + 1 },
  ]);

  assert.deepEqual(result.valid.map((file: { name: string }) => file.name), ["safe.step"]);
  assert.match(result.errors[0].message, /不允許/);
  assert.match(result.errors[1].message, /500 MB/);

  const tooMany = filesModule.validateTestPlanUpload(
    Array.from({ length: 21 }, (_, index) => ({
      name: `file-${index}.pdf`,
      size: 1,
    })),
  );
  assert.equal(tooMany.valid.length, 20);
  assert.equal(tooMany.errors.at(-1).code, "batch-limit");
});

test("rejects executable extensions when an existing file is renamed", () => {
  assert.equal(filesModule.validateTestPlanFileName("safe.brd"), null);
  assert.equal(
    filesModule.validateTestPlanFileName("renamed.EXE")?.code,
    "blocked-extension",
  );
});

test("builds storage paths that preserve the extension without path traversal", () => {
  const path = filesModule.buildStoragePath(
    "owner-1",
    "space-2",
    "../../測試 板#1.BRD",
    "object-3",
  );

  assert.equal(path, "owner-1/space-2/object-3-測試-板-1.brd");
  assert.doesNotMatch(path, /\.\.|#|\\|\/\//);
});

test("formats byte sizes for file metadata", () => {
  assert.equal(filesModule.formatTestPlanFileSize(0), "0 B");
  assert.equal(filesModule.formatTestPlanFileSize(1024), "1.0 KB");
  assert.equal(filesModule.formatTestPlanFileSize(5 * 1024 ** 2), "5.0 MB");
});

test("builds folder breadcrumbs from root and stops safely on malformed cycles", () => {
  const folders = [
    { id: "a", name: "A", parentId: null, spaceId: "space" },
    { id: "b", name: "B", parentId: "a", spaceId: "space" },
    { id: "c", name: "C", parentId: "b", spaceId: "space" },
  ];

  assert.deepEqual(
    treeModule.buildFolderBreadcrumbs(folders, "c").map((item: { id: string }) => item.id),
    ["a", "b", "c"],
  );

  const cyclic = [
    { id: "a", name: "A", parentId: "b", spaceId: "space" },
    { id: "b", name: "B", parentId: "a", spaceId: "space" },
  ];
  assert.ok(treeModule.buildFolderBreadcrumbs(cyclic, "a").length <= 2);
});

test("detects folder self moves and descendant cycles", () => {
  const folders = [
    { id: "a", name: "A", parentId: null, spaceId: "space" },
    { id: "b", name: "B", parentId: "a", spaceId: "space" },
    { id: "c", name: "C", parentId: "b", spaceId: "space" },
  ];

  assert.equal(treeModule.isFolderDescendant(folders, "a", "a"), true);
  assert.equal(treeModule.isFolderDescendant(folders, "c", "a"), true);
  assert.equal(treeModule.isFolderDescendant(folders, null, "a"), false);
  assert.equal(treeModule.isFolderDescendant(folders, "a", "c"), false);
});

test("filters both names, keeps folders during category filters, and sorts stably", () => {
  const folders = [
    {
      id: "folder-1",
      name: "Board files",
      parentId: null,
      spaceId: "space",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  ];
  const files = [
    {
      id: "file-b",
      originalName: "z-layout.brd",
      extension: "brd",
      category: "pcb",
      fileSize: 10,
      createdAt: "2026-07-29T01:00:00.000Z",
    },
    {
      id: "file-a",
      originalName: "a-plan.xlsx",
      extension: "xlsx",
      category: "spreadsheet",
      fileSize: 20,
      createdAt: "2026-07-29T02:00:00.000Z",
    },
  ];

  const pcb = treeModule.filterAndSortEntries(folders, files, {
    query: "",
    category: "pcb",
    sort: "name",
  });
  assert.deepEqual(pcb.map((entry: { kind: string; id: string }) => `${entry.kind}:${entry.id}`), [
    "folder:folder-1",
    "file:file-b",
  ]);

  const searched = treeModule.filterAndSortEntries(folders, files, {
    query: "plan",
    category: "all",
    sort: "newest",
  });
  assert.deepEqual(searched.map((entry: { id: string }) => entry.id), ["file-a"]);
});
