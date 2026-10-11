import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

test("material search controls are contained by the material table card", () => {
  const cardStart = source.indexOf('data-testid="material-table-card"');
  const headingStart = source.indexOf("<h2", cardStart);
  const headingEnd = source.indexOf("料號總表", headingStart);
  const toolbarStart = source.indexOf('data-testid="material-table-toolbar"');
  const tableStart = source.indexOf('data-testid="material-table-scroll"');

  assert.ok(cardStart >= 0, "material table card marker is missing");
  assert.ok(headingStart > cardStart && headingEnd > headingStart, "material table heading is missing");
  assert.ok(toolbarStart > headingEnd, "search toolbar must appear directly below the material table heading");
  assert.ok(toolbarStart > cardStart, "search toolbar must be inside the material table card");
  assert.ok(tableStart > toolbarStart, "search toolbar must appear above the material table");
});

test("material overview uses a compact command center with inline summaries", async () => {
  assert.match(source, /data-material-zone="overview"/);
  assert.match(source, /data-material-zone="command-center"/);
  assert.match(source, /data-material-zone="collaboration"/);
  assert.match(source, /data-material-zone="actions"/);
  assert.match(source, /data-material-zone="bom-workspace"/);
  assert.match(source, /data-material-zone="page-progress"/);
  assert.match(source, /data-material-zone="summary-filters"/);
  assert.doesNotMatch(source, />常用操作</);
});

test("compact hover previews stay on one line", () => {
  const compactHoverBlock = source.match(/function CompactHoverValue\([\s\S]*?\r?\n}\r?\n\r?\nfunction/)?.[0] ?? "";

  assert.match(compactHoverBlock, /data-testid="compact-hover-trigger"/);
  assert.match(compactHoverBlock, /className="[^"]*inline-flex[^"]*items-center[^"]*"/);
  assert.match(
    source,
    /data-testid="compact-hover-preview"[^>]*className=\{cn\("block min-w-0 flex-1 truncate whitespace-nowrap"/,
  );
});

test("REF DES previews show one value before the remaining item count", () => {
  const refDesBlocks = [...source.matchAll(/<CompactHoverValue\s+label="REF DES"[\s\S]*?\/>/g)]
    .map((match) => match[0]);

  assert.ok(refDesBlocks.length >= 2, "expected REF DES previews for primary and alternative rows");
  refDesBlocks.forEach((block) => assert.match(block, /maxItems=\{1\}/));
});

test("material vendor cells keep relation metadata inside the hover card", () => {
  const identityBlock = source.match(
    /function MaterialIdentityHover\([\s\S]*?\r?\n}\r?\n\r?\nfunction MaterialFieldLabel/,
  )?.[0] ?? "";
  const primaryCellBlock = source.match(
    /<td className="relative overflow-hidden[\s\S]*?<\/td>\r?\n\s*<td className="border-r border-blue-400\/10 px-4 py-3 align-middle"/,
  )?.[0] ?? "";

  assert.match(identityBlock, /data-testid="material-identity-trigger"/);
  assert.match(identityBlock, /data-testid="material-primary-name"/);
  assert.match(identityBlock, /data-testid="material-primary-vendor"/);
  assert.match(identityBlock, />REF DES</);
  assert.match(identityBlock, />MPN</);
  assert.match(primaryCellBlock, /<MaterialIdentityHover/);
  assert.doesNotMatch(primaryCellBlock, /group\.displayRef/);
  assert.doesNotMatch(primaryCellBlock, /個 MPN/);
});

test("material hover cards expose searchable, scrollable, and explicit copy controls", () => {
  const compactHoverBlock = source.match(
    /function CompactHoverValue\([\s\S]*?\r?\n}\r?\n\r?\nfunction MaterialIdentityHover/,
  )?.[0] ?? "";
  const identityBlock = source.match(
    /function MaterialIdentityHover\([\s\S]*?\r?\n}\r?\n\r?\nfunction MaterialFieldLabel/,
  )?.[0] ?? "";

  assert.match(compactHoverBlock, /data-testid="compact-hover-content"/);
  assert.match(compactHoverBlock, /data-testid="compact-hover-search"/);
  assert.match(compactHoverBlock, /data-testid="compact-hover-copy-all"/);
  assert.match(compactHoverBlock, /<ScrollArea/);
  assert.match(identityBlock, /data-testid="material-identity-metrics"/);
  assert.match(identityBlock, /data-testid="material-identity-ref-list"/);
  assert.match(identityBlock, /data-testid="material-identity-mpn-list"/);
  assert.match(identityBlock, /<ScrollArea/);
});

test("material identity hover shows module metadata once", () => {
  const identityBlock = source.match(
    /function MaterialIdentityHover\([\s\S]*?\r?\n}\r?\n\r?\nfunction MaterialFieldLabel/,
  )?.[0] ?? "";

  assert.equal((identityBlock.match(/模組：/g) ?? []).length, 1);
});

test("tracking table summaries remain compact instead of stretching material rows", () => {
  const cellBlock = source.match(
    /function TrackingHistoryCell\([\s\S]*?\r?\n}\r?\n\r?\nfunction TrackingHistoryDialog/,
  )?.[0] ?? "";

  assert.match(cellBlock, /data-testid="tracking-history-cell"/);
  assert.match(cellBlock, /min-h-\[54px\]/);
  assert.doesNotMatch(cellBlock, /h-14 w-1\.5/);
  assert.doesNotMatch(cellBlock, /line-clamp-2/);
});

test("tracking dialog separates current status, update form, history, and footer actions", () => {
  assert.match(source, /data-testid="tracking-current-summary"/);
  assert.match(source, /data-testid="tracking-compose-panel"/);
  assert.match(source, /data-testid="tracking-history-panel"/);
  assert.match(source, /data-testid="tracking-dialog-footer"/);
  assert.match(source, /onPaste=\{handleImagePaste\}/);
});

const tableStart = source.indexOf('data-testid="material-table-scroll"');
const tableBlock = source.slice(tableStart, source.indexOf("</table>", tableStart));
const alternativeBlock = source.slice(source.indexOf("function CompactAlternativeRows("), source.indexOf("function BomTableColorDialog("));
const readWidths = (name) => JSON.parse(source.match(new RegExp(`const ${name} = (\\[[^;]+\\]);`))[1]);

test("material table removes specification from headers, filters, primary and alternative rows", () => {
  assert.doesNotMatch(tableBlock, /規格 \/ 備註|filterKey="specification"|group\.partSpec/);
  assert.doesNotMatch(alternativeBlock, /record\.partSpec|record\.remark/);
  assert.equal((tableBlock.match(/<td\b/g) ?? []).length, 10);
  assert.equal((alternativeBlock.match(/<td\b/g) ?? []).length, 10);
  assert.doesNotMatch(source, /specification: ColumnFilterSelection|specification: null|case "specification"/);
});

test("material column geometry and fixed actions match the remaining ten columns", () => {
  assert.deepEqual(readWidths("DEFAULT_COLUMN_WIDTHS"), [96, 92, 260, 160, 260, 210, 190, 180, 220, 130]);
  assert.deepEqual(readWidths("MIN_COLUMN_WIDTHS"), [80, 76, 200, 120, 180, 170, 150, 140, 180, 110]);
  assert.deepEqual(readWidths("MAX_COLUMN_WIDTHS"), [148, 108, 520, 360, 520, 460, 420, 360, 420, 260]);
  assert.equal((tableBlock.match(/columnIndex === 9/g) ?? []).length, 2);
  assert.doesNotMatch(source, /colSpan=\{11\}/);
  assert.match(source, /colSpan=\{10\}/);
});

test("old eleven-column widths drop only the removed specification width", () => {
  const loadBlock = source.slice(source.indexOf("function loadColumnWidths()"), source.indexOf("function clampBomTrackerPageCount("));
  const load = new Function("window", "DEFAULT_COLUMN_WIDTHS", "MIN_COLUMN_WIDTHS", "MAX_COLUMN_WIDTHS", "COLUMN_WIDTHS_SESSION_KEY", `${loadBlock}; return loadColumnWidths();`);
  const run = (stored) => load({ sessionStorage: { getItem: () => JSON.stringify(stored) } }, readWidths("DEFAULT_COLUMN_WIDTHS"), readWidths("MIN_COLUMN_WIDTHS"), readWidths("MAX_COLUMN_WIDTHS"), "fixture");
  const legacy = [97, 93, 261, 161, 261, 211, 191, 181, 251, 221, 131];
  const current = legacy.filter((_, index) => index !== 8);
  assert.deepEqual(run(legacy), current);
  assert.deepEqual(run(current), current);
  assert.deepEqual(run(null), readWidths("DEFAULT_COLUMN_WIDTHS"));
});

test("restored material filters discard removed or invalid conditions without losing current filters", () => {
  const start = source.indexOf('if (parsed.columnFilters && typeof parsed.columnFilters === "object")');
  const block = source.slice(start, source.indexOf("if (parsed.availability", start));
  const empty = { material: null, refDes: null, mpn: null, internal: null, virtualAlternative: null, trackingStatus: null };
  let restored;
  new Function("parsed", "EMPTY_COLUMN_FILTERS", "FILTER_KEYS", "setColumnFilters", block)(
    { columnFilters: { material: ["IC", 42], trackingStatus: ["處理中"], specification: ["obsolete"], unknown: ["hidden"], internal: "invalid" } },
    empty, Object.keys(empty), (value) => { restored = value; },
  );
  assert.deepEqual(restored, { ...empty, material: ["IC"], trackingStatus: ["處理中"] });
  new Function("parsed", "EMPTY_COLUMN_FILTERS", "FILTER_KEYS", "setColumnFilters", block)(
    { columnFilters: { material: ["IC"], internal: [42], virtualAlternative: [] } },
    empty, Object.keys(empty), (value) => { restored = value; },
  );
  assert.deepEqual(restored, { ...empty, material: ["IC"] });
});

test("specification data remains available in the material form and exports", async () => {
  assert.match(source, /htmlFor="material-spec" label="料件規格"/);
  assert.match(source, /specification: record\.partSpec \|\| group\.partSpec \|\| group\.partName/);
  const exportSource = await readFile(new URL("../src/components/material-requests/materialRequestExport.ts", import.meta.url), "utf8");
  assert.match(exportSource, /規格 \/ 備註/);
  assert.match(exportSource, /row\.specification/);
});
