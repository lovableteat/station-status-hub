import assert from "node:assert/strict";
import test from "node:test";

const selection = await import(new URL("../../src/components/test-plan/core/selection.ts", import.meta.url).href);
const tree = await import(new URL("../../src/components/test-plan/core/tree.ts", import.meta.url).href);
const preview = await import(new URL("../../src/components/test-plan/core/preview.ts", import.meta.url).href);
const transfers = await import(new URL("../../src/components/test-plan/core/transfers.ts", import.meta.url).href);
const repositoryModule = await import(new URL("../../src/components/test-plan/core/repository.ts", import.meta.url).href);

const ordered = ["a", "b", "c", "d", "e"];
const keys = (state: { keys: ReadonlySet<string> }) => [...state.keys].sort();

test("click, Ctrl+click and Shift+click follow File Explorer", () => {
  let state = selection.clickSelection(selection.EMPTY_SELECTION, ordered, "b");
  assert.deepEqual(keys(state), ["b"]);
  state = selection.clickSelection(state, ordered, "d", { extend: true });
  assert.deepEqual(keys(state), ["b", "c", "d"], "Shift selects from the anchor");
  assert.equal(state.anchor, "b");
  state = selection.clickSelection(state, ordered, "a", { extend: true });
  assert.deepEqual(keys(state), ["a", "b"], "a new Shift range replaces the old one from the same anchor");
  state = selection.clickSelection(state, ordered, "e", { toggle: true });
  assert.deepEqual(keys(state), ["a", "b", "e"]);
  state = selection.clickSelection(state, ordered, "a", { toggle: true });
  assert.deepEqual(keys(state), ["b", "e"], "Ctrl+click removes");
  state = selection.clickSelection(state, ordered, "c", { toggle: true, extend: true });
  assert.deepEqual(keys(state), ["a", "b", "c", "e"], "Ctrl+Shift adds the range from the last Ctrl+clicked anchor");
  assert.deepEqual(keys(selection.clickSelection(state, ordered, "d")), ["d"], "a plain click selects one");
});

test("arrow keys move focus, Shift extends, Ctrl+A selects all and pruning drops hidden rows", () => {
  let state = selection.moveSelection(selection.EMPTY_SELECTION, ordered, "next");
  assert.equal(state.focus, "a");
  state = selection.moveSelection(state, ordered, "next", { extend: true });
  state = selection.moveSelection(state, ordered, "next", { extend: true });
  assert.deepEqual(keys(state), ["a", "b", "c"]);
  state = selection.moveSelection(state, ordered, "last");
  assert.deepEqual(keys(state), ["e"]);
  state = selection.moveSelection(state, ordered, "next");
  assert.equal(state.focus, "e", "the last row stays focused");
  state = selection.selectAll(state, ordered);
  assert.equal(state.keys.size, 5);
  state = selection.pruneSelection(state, ["a", "c"]);
  assert.deepEqual(keys(state), ["a", "c"]);
  assert.equal(state.focus, null, "the focused row was filtered out");
  assert.equal(selection.pruneSelection(state, ["a", "c"]), state, "an unchanged selection keeps its identity");
});

test("right-click keeps a multi-selection that contains the item", () => {
  const state = selection.selectAll(selection.EMPTY_SELECTION, ordered);
  assert.equal(selection.contextSelection(state, "c").keys.size, 5);
  assert.deepEqual(keys(selection.contextSelection(selection.singleSelection("a"), "c")), ["c"]);
});

test("type-ahead jumps to the next matching name", () => {
  const rows = [{ key: "1", name: "Alpha" }, { key: "2", name: "beta" }, { key: "3", name: "Apple" }];
  assert.equal(selection.typeAheadMatch(rows, "1", "a"), "3", "a repeated letter cycles");
  assert.equal(selection.typeAheadMatch(rows, "1", "al"), "1");
  assert.equal(selection.typeAheadMatch(rows, null, "B"), "2");
  assert.equal(selection.typeAheadMatch(rows, "1", "z"), null);
});

test("sorting can be reversed while folders stay first", () => {
  const stamp = "2026-10-01T00:00:00.000Z";
  const folders = [{ id: "f1", spaceId: "s", parentId: null, name: "Folder", createdBy: "o", createdAt: stamp, updatedAt: stamp }];
  const files = ["rev2.pdf", "rev10.pdf", "rev1.pdf"].map((name, index) => ({
    id: `file-${index}`, spaceId: "s", folderId: null, originalName: name, storagePath: name, mimeType: null,
    extension: "pdf", category: "document", fileSize: index * 10, description: null, uploadedBy: "o", createdAt: stamp, updatedAt: stamp,
  }));
  const names = (reverse: boolean) => tree.filterAndSortEntries(folders, files, { query: "", category: "all", sort: "name", reverse })
    .map((entry: { kind: string; name?: string; originalName?: string }) => entry.kind === "folder" ? entry.name : entry.originalName);
  assert.deepEqual(names(false), ["Folder", "rev1.pdf", "rev2.pdf", "rev10.pdf"], "natural numeric order");
  assert.deepEqual(names(true), ["Folder", "rev10.pdf", "rev2.pdf", "rev1.pdf"]);
  assert.equal(tree.TEST_PLAN_SORT_DIRECTION.newest, "desc");
  assert.equal(tree.TEST_PLAN_SORT_DIRECTION.name, "asc");
});

test("a folder subtree covers nested folders only", () => {
  const folders = [
    { id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "d", parentId: null },
  ];
  assert.deepEqual([...tree.collectFolderSubtree(folders, "a")].sort(), ["a", "b", "c"]);
  assert.equal(tree.collectFolderSubtree(folders, null).size, 5, "the root covers every folder plus the root itself");
});

test("SVG, spreadsheets and zip files get a safe preview kind", () => {
  const kind = (originalName: string, mimeType: string | null = null) => preview.getTestPlanPreviewKind({ originalName, mimeType, extension: originalName.split(".").pop() ?? "" });
  assert.equal(kind("flow.svg", "image/svg+xml"), "svg");
  assert.equal(kind("BOM.xlsx"), "sheet");
  assert.equal(kind("legacy.XLS"), "sheet");
  assert.equal(kind("photos.zip"), "archive");
  assert.equal(kind("matrix.csv"), "text", "CSV stays plain text");
  assert.equal(kind("rack.step"), "unsupported");
  assert.ok(preview.TEST_PLAN_PREVIEW_LIMITS.svg < preview.TEST_PLAN_PREVIEW_LIMITS.sheet);
});

test("a multi-file download into one folder never overwrites an existing file", async () => {
  assert.equal(transfers.numberedFileName("report.pdf", 0), "report.pdf");
  assert.equal(transfers.numberedFileName("report.pdf", 2), "report (2).pdf");
  assert.equal(transfers.numberedFileName("README", 1), "README (1)");
  const existing = new Set(["report.pdf", "report (1).pdf"]);
  const written: Record<string, number[]> = {};
  const directory = {
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!options?.create && !existing.has(name)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      existing.add(name);
      return { async createWritable() { written[name] = []; return { async write(chunk: Uint8Array) { written[name].push(...chunk); }, async close() {}, async abort() {} }; } };
    },
  };
  const sink = await transfers.openDirectorySink(directory, "report.pdf");
  await sink.write(new Uint8Array([1, 2]));
  await sink.close();
  assert.deepEqual(written, { "report (2).pdf": [1, 2] });
  assert.equal(await transfers.pickDownloadDirectory(), null, "no folder picker outside a supporting browser");
});

test("the personal-space token opens the signed-in user's own space", async () => {
  const stamp = "2026-10-01T00:00:00.000Z";
  const spaces = [
    { id: "other", projectId: null, ownerId: "someone", isPersonal: true, name: "Other", description: null, color: "#000", createdAt: stamp, updatedAt: stamp },
    { id: "mine", projectId: null, ownerId: "me", isPersonal: true, name: "Me", description: null, color: "#000", createdAt: stamp, updatedAt: stamp },
  ];
  const listed: (string | undefined)[] = [];
  const adapter = {
    listSpaces: async () => spaces,
    listFolders: async (spaceId?: string) => { listed.push(spaceId); return []; },
    listFiles: async () => [],
    listCleanupPaths: async () => [],
  };
  const repository = repositoryModule.createTestPlanRepository(adapter);
  const loaded = await repository.loadWorkspace("me", null, repositoryModule.TEST_PLAN_PERSONAL_SPACE);
  assert.equal(loaded.activeSpaceId, "mine");
  assert.deepEqual(listed, ["mine"], "only the personal space is loaded, not every file in the library");
  const fallback = await repository.loadWorkspace("nobody", null, repositoryModule.TEST_PLAN_PERSONAL_SPACE);
  assert.equal(fallback.activeSpaceId, null, "without a personal space the library falls back to 所有檔案");
});
