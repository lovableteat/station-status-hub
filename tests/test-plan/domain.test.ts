import assert from "node:assert/strict";
import test from "node:test";

const filesModule = await import(
  new URL("../../src/components/test-plan/core/files.ts", import.meta.url).href,
).catch(() => ({}));
const treeModule = await import(
  new URL("../../src/components/test-plan/core/tree.ts", import.meta.url).href,
).catch(() => ({}));
const previewModule = await import(
  new URL("../../src/components/test-plan/core/preview.ts", import.meta.url).href,
).catch(() => ({}));
const overviewModule = await import(
  new URL("../../src/components/test-plan/core/overview.ts", import.meta.url).href,
).catch(() => ({}));

test("classifies browser-previewable engineering files without pretending CAD and Office are native previews", () => {
  const createFile = (originalName: string, mimeType: string | null = null) => ({
    originalName,
    mimeType,
    extension: originalName.split(".").pop() ?? "",
  });

  assert.equal(previewModule.getTestPlanPreviewKind(createFile("board-photo.PNG", "image/png")), "image");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("report.pdf", "application/pdf")), "pdf");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("notes.md", "text/markdown")), "text");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("matrix.csv", "text/csv")), "text");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("layout.brd")), "unsupported");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("enclosure.step")), "unsupported");
  assert.equal(previewModule.getTestPlanPreviewKind(createFile("plan.xlsx")), "unsupported");
});

test("never treats active SVG content as an inline image preview", () => {
  const svg = {
    originalName: "probe-result.svg",
    extension: "svg",
    mimeType: "image/svg+xml",
  };

  assert.equal(previewModule.getTestPlanPreviewKind(svg), "unsupported");
});

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

test("classifies the broader engineering document, CAD, PCB, archive, and raster matrix", () => {
  const matrix = [
    ["release-plan.ods", "spreadsheet"],
    ["qualification-report.odt", "document"],
    ["mechanical-envelope.dwg", "3d"],
    ["panel-layout.dxf", "3d"],
    ["controller.kicad_sch", "pcb"],
    ["fab-outline.gko", "pcb"],
    ["drill.drl", "pcb"],
    ["manufacturing-package.tgz", "archive"],
    ["inspection-photo.tiff", "image"],
  ] as const;

  for (const [fileName, category] of matrix) {
    assert.equal(filesModule.classifyTestPlanFile(fileName), category, fileName);
  }
});

test("accepts private engineering source, configuration, firmware, and logs", () => {
  const result = filesModule.validateTestPlanUpload([
    { name: "main.cpp", size: 1 },
    { name: "build.ps1", size: 1 },
    { name: "flash.sh", size: 1 },
    { name: "bringup.bat", size: 1 },
    { name: "board.yaml", size: 1 },
    { name: "fpga.bit", size: 1 },
    { name: "bootloader.hex", size: 1 },
    { name: "test-run.log", size: 1 },
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.valid.length, 8);
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

test("blocks OS executables, installers, drivers, and shortcut payloads", () => {
  const result = filesModule.validateTestPlanUpload([
    { name: "setup.exe", size: 1 },
    { name: "installer.msi", size: 1 },
    { name: "driver.sys", size: 1 },
    { name: "launch.scr", size: 1 },
    { name: "shortcut.lnk", size: 1 },
    { name: "mobile.apk", size: 1 },
  ]);

  assert.deepEqual(result.valid, []);
  assert.deepEqual(
    result.errors.map((error: { code: string }) => error.code),
    Array.from({ length: 6 }, () => "blocked-extension"),
  );
});

test("rejects files that would make the upload batch exceed 1 GiB", () => {
  const MiB = 1024 ** 2;
  const result = filesModule.validateTestPlanUpload([
    { name: "assembly.step", size: 400 * MiB },
    { name: "mesh.glb", size: 400 * MiB },
    { name: "render.stl", size: 400 * MiB },
  ]);

  assert.deepEqual(
    result.valid.map((file: { name: string }) => file.name),
    ["assembly.step", "mesh.glb"],
  );
  assert.match(result.errors.at(-1)?.message ?? "", /1\s*(?:GiB|GB)/i);
});

test("rejects executable extensions when an existing file is renamed", () => {
  assert.equal(filesModule.validateTestPlanFileName("safe.brd"), null);
  assert.equal(
    filesModule.validateTestPlanFileName("renamed.EXE")?.code,
    "blocked-extension",
  );
});

test("builds opaque ASCII-only keys for Unicode, emoji, and multi-dot display names", () => {
  const pdfPath = filesModule.buildStoragePath(
    "owner-1",
    "space-2",
    "測試報告✅.final.PDF",
    "object-3",
  );
  const pcbPath = filesModule.buildStoragePath(
    "owner-1",
    "space-2",
    "控制板.rev.2.KICAD_PCB",
    "object-4",
  );

  assert.equal(pdfPath, "owner-1/space-2/object-3.pdf");
  assert.equal(pcbPath, "owner-1/space-2/object-4.kicad_pcb");
  for (const path of [pdfPath, pcbPath]) {
    assert.match(path, /^[a-zA-Z0-9._/-]+$/);
    assert.doesNotMatch(path, /\.\.|#|%|\\|\/\//);
  }
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

test("derives complete category distribution for the active Test Plan space", () => {
  const files = [
    { category: "3d", originalName: "assembly.step", updatedAt: "2026-08-02T00:00:00.000Z" },
    { category: "document", originalName: "notes.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
  ];

  const summary = overviewModule.getTestPlanCategorySummary(files);

  assert.equal(summary.find((item: { category: string }) => item.category === "3d")?.count, 1);
  assert.equal(summary.find((item: { category: string }) => item.category === "image")?.count, 0);
  assert.equal(summary.reduce((total: number, item: { percentage: number }) => total + item.percentage, 0), 100);
  assert.ok(summary.every((item: { percentage: number }) => item.percentage >= 0 && item.percentage <= 100));
  assert.deepEqual(overviewModule.getTestPlanCategorySummary([]).every((item: { percentage: number }) => item.percentage === 0), true);
});

test("sorts recent Test Plan files deterministically and handles empty spaces", () => {
  const files = [
    { originalName: "zeta.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
    { originalName: "alpha.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
    { originalName: "newer.step", updatedAt: "2026-08-02T00:00:00.000Z" },
  ];

  assert.deepEqual(
    overviewModule.getRecentTestPlanFiles(files, 3).map((file: { originalName: string }) => file.originalName),
    ["newer.step", "alpha.pdf", "zeta.pdf"],
  );
  assert.deepEqual(overviewModule.getRecentTestPlanFiles([], 4), []);
});
