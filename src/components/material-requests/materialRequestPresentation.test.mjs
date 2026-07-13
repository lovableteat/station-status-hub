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
}).outputText;
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
