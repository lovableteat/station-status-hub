import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url), "utf8");
const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const presentation = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const slice = (from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `missing marker ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `missing marker ${to}`);
  return source.slice(start, end);
};
const rowBlock = slice("const MaterialGroupRow = memo(", "function CompactAlternativeRows(");
const desktopHeader = slice('data-material-zone="overview"', 'data-testid="material-table-card"');
const toolbar = slice('data-testid="material-table-toolbar"', 'data-testid="material-mobile-cards"');
const filterRow = slice("</ResizableHeader>", "</thead>");

test("the material table has eleven columns and only the material and action columns are locked", () => {
  assert.equal(presentation.MATERIAL_TABLE_COLUMNS.length, 11);
  assert.deepEqual(
    presentation.MATERIAL_TABLE_COLUMNS.filter((column) => column.locked).map((column) => column.key),
    ["material", "actions"],
  );
});

test("hidden column preferences drop unknown, locked, and duplicate keys", () => {
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(["refDes", "material", "nope", "refDes", 7, "tx"]), ["refDes", "tx"]);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns("refDes"), []);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(null), []);
});

test("the table width only counts visible columns", () => {
  const widths = [96, 92, 260, 160, 260, 210, 190, 180, 180, 220, 130];
  assert.equal(presentation.getMaterialTableWidth(widths, []), 1978);
  assert.equal(presentation.getMaterialTableWidth(widths, ["refDes", "tx"]), 1978 - 160 - 190);
  assert.equal(presentation.getMaterialTableWidth(widths, ["unknown"]), 1978);
});

test("every main-row cell is wrapped in its column visibility flag", () => {
  const keys = ["item", "marked", "material", "refDes", "mpn", "internal", "tx", "phaseOut", "status", "tracking", "actions"];
  for (const key of keys) {
    assert.match(rowBlock, new RegExp(`\\{columns\\.${key} && \\($`, "m"), `cell ${key} must be toggleable`);
    assert.match(rowBlock, new RegExp(`data-material-cell="${key}"`));
  }
  assert.equal((rowBlock.match(/<td\b/g) ?? []).length, 11);
  assert.match(source, /data-testid="material-column-visibility"/);
  assert.match(source, /HIDDEN_COLUMNS_KEY = "station-status-hub:material-hidden-columns:v1"/);
  assert.match(source, /colSpan=\{visibleColumnCount\}/);
});

test("main rows are memoised and keep every cell at one or two short lines", () => {
  assert.match(source, /const MaterialGroupRow = memo\(function MaterialGroupRow\(/);
  assert.match(source, /const rowActions = useMemo<MaterialRowActions>/);
  assert.match(source, /const MATERIAL_CELL_CLASS = "border-r border-blue-400\/10 px-2 py-1\.5 align-middle"/);
  assert.doesNotMatch(rowBlock, /py-3|line-clamp|<br \/>|主料 Remark:|個 MPN/);
  const identityBlock = slice("function MaterialIdentityHover(", "function MaterialFieldLabel(");
  assert.match(identityBlock, /data-testid="material-primary-name"\s+className="block truncate/);
  assert.doesNotMatch(identityBlock, /line-clamp-2 text-\[15px\]/);
});

test("expanded alternative rows do not repeat the group star or the main row's live editors", () => {
  const alternativeBlock = slice("function CompactAlternativeRows(", "function BomTableColorDialog(");
  assert.doesNotMatch(alternativeBlock, /onToggleMarked|<Star\b/);
  assert.match(alternativeBlock, /record\.id === primaryTxRecordId \?/);
  assert.match(alternativeBlock, /record\.id === primaryTrackingRecordId \?/);
  assert.equal((alternativeBlock.match(/<td\b/g) ?? []).length, 11);
  assert.match(rowBlock, /aria-expanded=\{hasAlternatives \? expanded : undefined\}/);
  assert.match(source, /adjacentIndex = MATERIAL_TABLE_COLUMNS\.findIndex\(/);
  assert.match(source, /const REF_COLLATOR = new Intl\.Collator\(undefined, \{ numeric: true \}\)/);
  assert.match(source, /const markedFilterSet = showMarkedOnly \? markedGroupKeySet : null/);
});

test("the TX confirm dialog only mounts while confirming", () => {
  const editorBlock = slice("function InlineVirtualAlternativeEditor(", "function TrackingHistoryCell(");
  assert.match(editorBlock, /\{confirmOpen && \(\s*<Dialog open onOpenChange/);
});

test("duplicate controls were merged: one clear, one page-progress entry, delete only inside BOM management", () => {
  assert.doesNotMatch(desktopHeader, /刪除 BOM|逐頁勾選|我的標記|頁數進度<\/Button>|收合頁數設定/);
  assert.equal((desktopHeader.match(/data-material-zone="page-progress"/g) ?? []).length, 1);
  assert.doesNotMatch(toolbar, /條件邏輯|尚未套用搜尋|aria-label=\{isSearchPending \? "搜尋中" : "搜尋"\}/);
  assert.equal((toolbar.match(/全部清除/g) ?? []).length, 1);
  assert.doesNotMatch(filterRow, />清除</);
  assert.match(filterRow, /aria-pressed=\{showMarkedOnly\}/);
  assert.doesNotMatch(source, /function AlternativeRows\(|function SummaryTile\(|saveQuickBomPageTracker|pageTrackerPanelCollapsed/);
  const bomManager = slice("function BomManagerDialog(", "function MaterialRecordDialog(");
  assert.match(bomManager, />刪除</);
  assert.doesNotMatch(bomManager, /BOM ID<\/p>|歷史 BOM 清單/);
});

test("the desktop empty state keeps the table skeleton and the standard wording", () => {
  const emptyBlock = slice("{visibleGroupRows.length === 0 && (", "</table>");
  assert.match(emptyBlock, /<tbody>/);
  assert.match(emptyBlock, />目前篩選條件沒有符合的料件</);
});


test("phase out remains visible and stale hidden Symbol preferences are discarded", () => {
  assert.deepEqual(presentation.MATERIAL_TABLE_COLUMNS.slice(7, 9).map(column => [column.key, column.label]), [["phaseOut", "phase out（零件狀態）"], ["status", "狀態"]]);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(["status", "symbol", "mpn"]), ["status", "mpn"]);
  assert.equal(presentation.getMaterialTableWidth([96, 92, 260, 160, 260, 210, 190, 180, 180, 220, 130], ["phaseOut", "symbol"]), 1798);
});

test("phase out source values remain unmodified without Symbol inference", () => {
  for (const raw of ["PHASEOUT", "ACTIVE", "UNDERREVIEW", "  ACTIVE  "]) assert.equal(presentation.getMaterialSourceValue(raw), raw);
  for (const empty of ["", "   ", undefined]) assert.equal(presentation.getMaterialSourceValue(empty), "未提供");
  const sourceColumns = slice("function PhaseOutStatus(", "function StatusPill(");
  assert.match(sourceColumns, /getMaterialSourceValue\(record\.phaseOutStatus\)/);
  assert.doesNotMatch(sourceColumns, /symbolStatus|getMaterialBuildRequirements|getMaterialBuildRequirementLabel|symbolAvailability/);
});
