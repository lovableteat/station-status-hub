import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./materialRequestPresentation.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace('"./materialTrackingStatus.ts"', JSON.stringify(new URL("./materialTrackingStatus.ts", import.meta.url).href));
const presentation = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

test("long table values are summarized without losing the full hover content", () => {
  const result = presentation.createCompactValueSummary(
    "C1, C2, C3, C4, C5, C6",
    { maxItems: 3 },
  );

  assert.equal(result.preview, "C1、C2、C3");
  assert.equal(result.remainingCount, 3);
  assert.equal(result.fullText, "C1、C2、C3、C4、C5、C6");
  assert.equal(result.isTruncated, true);
});

test("short values remain unchanged", () => {
  const result = presentation.createCompactValueSummary("Murata", { maxItems: 3 });

  assert.equal(result.preview, "Murata");
  assert.equal(result.remainingCount, 0);
  assert.equal(result.isTruncated, false);
});

test("the material table rightmost column can resize without an adjacent column", () => {
  assert.equal(typeof presentation.resizeMaterialColumnWidths, "function");
  assert.deepEqual(
    presentation.resizeMaterialColumnWidths({
      index: 2,
      maxWidths: [200, 200, 240],
      minWidths: [80, 80, 100],
      requestedWidth: 210,
      widths: [120, 140, 160],
    }),
    [120, 140, 210],
  );
});

test("resizing borrows width from the given visible neighbour and skips hidden columns", () => {
  assert.deepEqual(
    presentation.resizeMaterialColumnWidths({
      adjacentIndex: 2,
      index: 0,
      maxWidths: [300, 300, 300],
      minWidths: [50, 50, 50],
      requestedWidth: 140,
      widths: [100, 100, 100],
    }),
    [140, 100, 60],
  );
  assert.deepEqual(
    presentation.resizeMaterialColumnWidths({
      adjacentIndex: -1,
      index: 1,
      maxWidths: [300, 300, 300],
      minWidths: [50, 50, 50],
      requestedWidth: 180,
      widths: [100, 100, 100],
    }),
    [100, 180, 100],
  );
});

test("the sticky data update column keeps the same visual treatment as neighboring columns", () => {
  assert.equal(typeof presentation.getMaterialStickyColumnClasses, "function");

  const classes = presentation.getMaterialStickyColumnClasses();

  assert.match(classes.header, /bg-\[#0d2137\]/);
  assert.match(classes.filter, /bg-\[#10263a\]/);
  assert.match(classes.row, /bg-\[var\(--material-row-solid\)\]/);
  assert.match(classes.row, /group-hover\/material-row:bg-\[var\(--material-row-hover-solid\)\]/);
  assert.doesNotMatch(`${classes.header} ${classes.filter} ${classes.row}`, /shadow-\[/);
  assert.doesNotMatch(`${classes.header} ${classes.filter} ${classes.row}`, /\bborder-l\b/);
});

test("export scope follows active filters and defaults to all data", () => {
  assert.equal(presentation.getMaterialExportScopeLabel([]), "全部資料");
  assert.equal(
    presentation.getMaterialExportScopeLabel(["關鍵字：BF3", "狀態：待申請"]),
    "目前篩選結果（2 個條件）",
  );
});

test("clipboard image names are deterministic and keep the image extension", () => {
  const date = new Date("2026-07-13T06:30:45.000Z");

  assert.equal(
    presentation.createClipboardImageName("image/png", date),
    "clipboard-20260713-063045.png",
  );
  assert.equal(
    presentation.createClipboardImageName("image/jpeg", date),
    "clipboard-20260713-063045.jpg",
  );
});

test("page progress is clamped and converted to a stable percentage", () => {
  assert.deepEqual(presentation.getBomPageProgress(11, 48), {
    currentPage: 11,
    percentage: 23,
    totalPages: 48,
  });
  assert.deepEqual(presentation.getBomPageProgress(60, 48), {
    currentPage: 48,
    percentage: 100,
    totalPages: 48,
  });
  assert.deepEqual(presentation.getBomPageProgress(1, 0), {
    currentPage: 0,
    percentage: 0,
    totalPages: 0,
  });
});

test("startup cache is only used when the preferred BOM has renderable records", () => {
  const loaded = {
    workspaces: [{ id: "bom-a", isLoaded: true, payload: { records: [{ id: "record-1" }] } }],
  };
  const summaryOnly = {
    workspaces: [{ id: "bom-a", isLoaded: false, payload: { records: [] } }],
  };

  assert.equal(presentation.hasRenderableBomWorkspaceCache(loaded, "bom-a"), true);
  assert.equal(presentation.hasRenderableBomWorkspaceCache(summaryOnly, "bom-a"), false);
  assert.equal(presentation.hasRenderableBomWorkspaceCache(loaded, "bom-b"), false);
});

test("a late cache response never replaces a settled remote response", () => {
  const loaded = {
    workspaces: [{ id: "bom-a", isLoaded: true, payload: { records: [{ id: "record-1" }] } }],
  };

  assert.equal(presentation.shouldApplyBomWorkspaceCache({
    active: true,
    currentRequest: true,
    preferredWorkspaceId: "bom-a",
    remoteSettled: false,
    result: loaded,
  }), true);
  assert.equal(presentation.shouldApplyBomWorkspaceCache({
    active: true,
    currentRequest: true,
    preferredWorkspaceId: "bom-a",
    remoteSettled: true,
    result: loaded,
  }), false);
});

test("BOMs group under the active project first, other projects by name, unassigned last", () => {
  const workspaces = [
    { id: "w1", project: { projectId: "p-zeta", projectName: "Zeta" } },
    { id: "w2" },
    { id: "w3", project: { projectId: "p-alpha", projectName: "Alpha (old name)" } },
    { id: "w4", project: { projectId: "p-zeta", projectName: "Zeta" } },
    { id: "w5", project: null },
  ];
  const groups = presentation.groupBomWorkspacesByProject(workspaces, {
    activeProjectId: "p-alpha",
    activeProjectName: "Alpha",
    projectNames: new Map([["p-alpha", "Alpha"], ["p-zeta", "Zeta"]]),
  });

  assert.deepEqual(groups.map((group) => [group.label, group.isActive, group.workspaces.map((workspace) => workspace.id)]), [
    ["Alpha", true, ["w3"]],
    ["Zeta", false, ["w1", "w4"]],
    [presentation.UNASSIGNED_BOM_PROJECT_LABEL, false, ["w2", "w5"]],
  ]);
});

test("the active project keeps an empty group and stored names fill in for unknown projects", () => {
  const groups = presentation.groupBomWorkspacesByProject(
    [{ id: "w1", project: { projectId: "p-gone", projectName: "Archived" } }],
    { activeProjectId: "p-new", activeProjectName: "New" },
  );

  assert.deepEqual(groups.map((group) => [group.key, group.label, group.workspaces.length]), [
    ["p-new", "New", 0],
    ["p-gone", "Archived", 1],
  ]);
  assert.deepEqual(presentation.groupBomWorkspacesByProject([{ id: "w1" }]).map((group) => group.key), ["unassigned"]);
});

test("preference keys map back to the full BOM id, which itself contains a colon", () => {
  const prefixes = ["material-bom-workspace:", "material-bom-page-tracker:", "material-bom-table-color-theme:", "material-bom-project:"];
  assert.equal(presentation.getBomPreferenceWorkspaceId("material-bom-project:bom:foo.xlsx", prefixes), "bom:foo.xlsx");
  assert.equal(presentation.getBomPreferenceWorkspaceId("material-bom-page-tracker:bom:a:b", prefixes), "bom:a:b");
  assert.equal(presentation.getBomPreferenceWorkspaceId("material-bom-project:", prefixes), undefined);
  assert.equal(presentation.getBomPreferenceWorkspaceId("other:bom:foo", prefixes), undefined);
});

test("pending materials are classified by reference prefix with connectors and ICs first", () => {
  assert.equal(presentation.getPendingMaterialCategory("J12, J13"), "connector");
  assert.equal(presentation.getPendingMaterialCategory("u839"), "ic");
  for (const ref of ["R7063", "LB37", "C1", "RN5", "L2"]) assert.equal(presentation.getPendingMaterialCategory(ref), "rlc");
  for (const ref of ["D138", "FB1", "Q3", "", "123"]) assert.equal(presentation.getPendingMaterialCategory(ref), "other");
  const groups = presentation.groupPendingMaterials([
    { displayRef: "R1" }, { displayRef: "U1" }, { displayRef: "J1" }, { displayRef: "D1" }, { displayRef: "C1" },
  ]);
  assert.deepEqual(groups.map((category) => [category.key, category.priority, category.groups.map((group) => group.displayRef)]), [
    ["connector", true, ["J1"]], ["ic", true, ["U1"]], ["rlc", false, ["R1", "C1"]], ["other", false, ["D1"]],
  ]);
  assert.deepEqual(presentation.groupPendingMaterials([{ displayRef: "U9" }]).map((category) => category.key), ["ic"]);
});
