import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { MATERIAL_CE_FIELDS } from "../src/components/material-requests/materialUploadContract.mjs";

const sourceUrl = new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const uploadGuide = await readFile(new URL("../src/components/material-requests/MaterialUploadGuideDialog.tsx", import.meta.url), "utf8");

test("template download uses the shared accessible button colors and preserves the native download", () => {
  const guide = uploadGuide;
  const button = guide.match(/<Button\b([^>]*)>\s*<a href=\{templateUrl\} download="CE_BOM_交付格式\.xlsx">/)?.[1];

  assert.ok(button, "template download must remain a native link inside Button");
  assert.match(button, /\basChild\b/);
  assert.doesNotMatch(button, /\b(?:bg|text|hover:bg)-(?:cyan|slate)-\d/);
  assert.match(button, /\bshrink-0\b/);
  assert.match(guide, /import\.meta\.env\.BASE_URL\}material-upload-template\.xlsx/);
  assert.match(guide, /<Download\b/);
});

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
    /<td data-material-cell="material"[\s\S]*?<\/td>[\s\S]*?<td data-material-cell="refDes"/,
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
  assert.match(cellBlock, /min-h-\[40px\]/);
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
const rowBlock = source.slice(source.indexOf("const MaterialGroupRow = memo("), source.indexOf("function CompactAlternativeRows("));
const alternativeBlock = source.slice(source.indexOf("function CompactAlternativeRows("), source.indexOf("function BomTableColorDialog("));
const readWidths = (name) => JSON.parse(source.match(new RegExp(`const ${name} = (\\[[^;]+\\]);`))[1]);

test("material table removes specification from headers, filters, primary and alternative rows", () => {
  assert.doesNotMatch(`${tableBlock}${rowBlock}`, /規格 \/ 備註|filterKey="specification"|group\.partSpec/);
  assert.doesNotMatch(alternativeBlock, /record\.partSpec|record\.remark/);
  assert.equal((rowBlock.match(/<td\b/g) ?? []).length, 12);
  assert.equal((alternativeBlock.match(/<td\b/g) ?? []).length, 12);
  assert.doesNotMatch(source, /specification: ColumnFilterSelection|specification: null|case "specification"/);
});

test("material column geometry and fixed actions match the twelve columns", () => {
  assert.deepEqual(readWidths("DEFAULT_COLUMN_WIDTHS"), [96, 92, 260, 160, 260, 210, 190, 180, 160, 180, 220, 130]);
  assert.deepEqual(readWidths("MIN_COLUMN_WIDTHS"), [80, 76, 200, 120, 180, 170, 150, 140, 140, 140, 180, 110]);
  assert.deepEqual(readWidths("MAX_COLUMN_WIDTHS"), [148, 108, 520, 360, 520, 460, 420, 360, 320, 360, 420, 260]);
  assert.equal((tableBlock.match(/column\.key === "actions"/g) ?? []).length, 2);
  assert.doesNotMatch(source, /colSpan=\{1[01]\}/);
  assert.match(source, /colSpan=\{visibleColumnCount\}/);
});

test("old ten and eleven-column widths preserve their columns when phase out and Symbol are added", () => {
  const loadBlock = source.slice(source.indexOf("function loadColumnWidths()"), source.indexOf("function clampBomTrackerPageCount("));
  const load = new Function("window", "DEFAULT_COLUMN_WIDTHS", "MIN_COLUMN_WIDTHS", "MAX_COLUMN_WIDTHS", "COLUMN_WIDTHS_SESSION_KEY", `${loadBlock}; return loadColumnWidths();`);
  const run = (stored) => load({ sessionStorage: { getItem: () => JSON.stringify(stored) } }, readWidths("DEFAULT_COLUMN_WIDTHS"), readWidths("MIN_COLUMN_WIDTHS"), readWidths("MAX_COLUMN_WIDTHS"), "fixture");
  const legacy = [97, 93, 261, 161, 261, 211, 191, 181, 251, 221, 131];
  const oldTen = legacy.filter((_, index) => index !== 8);
  const current = [...oldTen.slice(0, 7), 180, 160, ...oldTen.slice(7)];
  assert.deepEqual(run(legacy), current);
  assert.deepEqual(run(oldTen), current);
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
  assert.match(source, /specification: record\.partSpec,/);
  assert.doesNotMatch(source, /specification: record\.partSpec \|\|/);
  const exportSource = await readFile(new URL("../src/components/material-requests/materialRequestExport.ts", import.meta.url), "utf8");
  assert.match(exportSource, /料件規格（Part Spec）/);
  assert.match(exportSource, /row\.specification/);
});


test("material field help reads the same meanings and instructions as the CE workbook", () => {
  const start = source.indexOf("const MATERIAL_CE_HELP_BY_HEADER =");
  const end = source.indexOf("function CompactHoverValue(", start);
  const compiledHelp = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const help = new Function("MATERIAL_CE_FIELDS", `${compiledHelp}; return MATERIAL_FIELD_HELP;`)(MATERIAL_CE_FIELDS);
  const mapping = { name: "Name", qty: "Qty", refDes: "Ref Des", manufacturerPartNumber: "Manufacturer Part Number", manufacturer: "Manufacturer", sourcingStatus: "Sourcing Status", virtualAlternative: "虛擬料號", partNumber: "實體料號", symbolStatus: "Symbol", partName: "Part Name", partSpec: "Part Spec", schematicPart: "Schematic_Part", pcbFootprint: "PCB_Footprint", partUsageStatus: "零件狀態", phaseOutStatus: "phase out" };
  for (const [key, header] of Object.entries(mapping)) {
    const field = MATERIAL_CE_FIELDS.find(field => field.header === header);
    assert.equal(help[key].header, header);
    assert.ok(help[key].description.includes(field.meaning));
    assert.ok(help[key].description.includes(field.requirement));
    assert.equal(help[key].example, field.example);
  }
  assert.match(help.refGroup.description, /不是 CE Excel 欄位/);
  assert.match(help.manufacturerPartNumberAlt.description, /舊檔.*新 CE Excel 沒有/);
  assert.match(source, /label="內部分組（網站）"/);
  assert.doesNotMatch(source, /No Footprint|尚未建立實體料號/);
  assert.match(source, /實體料號未提供/);
});


test("phase out and Symbol have their own main and candidate cells rather than being hidden in combined status", () => {
  assert.match(rowBlock, /columns\.phaseOut &&/);
  assert.match(rowBlock, /data-material-cell="phaseOut"[^>]*><PhaseOutStatus record=\{statusRecord\}/);
  assert.match(rowBlock, /data-material-cell="symbol"[^>]*><SymbolBuildStatus record=\{statusRecord\}/);
  assert.match(alternativeBlock, /columns\.phaseOut &&/);
  assert.match(alternativeBlock, /<PhaseOutStatus record=\{record\}/);
  assert.match(alternativeBlock, /columns\.symbol &&/);
  assert.match(alternativeBlock, /<SymbolBuildStatus record=\{record\}/);
  const combined = rowBlock.slice(rowBlock.indexOf("{columns.status &&"), rowBlock.indexOf("{columns.tracking &&"));
  assert.doesNotMatch(combined, /SymbolBuildStatus|PhaseOutStatus/);
  assert.match(source, /field="phaseOutStatus" htmlFor="material-phase-out" label="phase out（零件狀態）"/);
  assert.match(source, /field="partUsageStatus" htmlFor="material-part-usage" label="零件狀態"/);
});
