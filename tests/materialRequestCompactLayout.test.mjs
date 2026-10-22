import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { MATERIAL_CE_FIELDS } from "../src/components/material-requests/materialUploadContract.mjs";

const source = (await readFile(new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const storageSource = (await readFile(new URL("../src/components/material-requests/materialBomStorage.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
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
const alternativeBlock = slice("function CompactAlternativeRows(", "function BomTableColorDialog(");
const desktopHeader = slice('data-material-zone="overview"', 'data-testid="material-table-card"');
const toolbar = slice('data-testid="material-table-toolbar"', 'data-testid="material-mobile-cards"');
const filterRow = slice("</ResizableHeader>", "</thead>");
const COLUMN_KEYS = [
  "item", "name", "qty", "refDes", "mpn", "manufacturer", "sourcingStatus", "virtual", "physical",
  "partName", "partSpec", "schematicPart", "footprint", "phaseOut", "partUsage", "actions",
];

test("the table mirrors the CE workbook: its 14 item columns in workbook order, between the website columns, with no 標記 column", () => {
  assert.ok(!presentation.MATERIAL_TABLE_COLUMNS.some((column) => ["marked", "status", "tracking"].includes(column.key)));
  assert.equal(presentation.MATERIAL_TABLE_COLUMNS.at(-1).label, "狀態追蹤 / 更新");
  assert.deepEqual(presentation.MATERIAL_TABLE_COLUMNS.map((column) => column.key), COLUMN_KEYS);
  const workbookHeaders = MATERIAL_CE_FIELDS.map((field) => field.header).filter((header) => header !== "Level");
  assert.deepEqual(presentation.MATERIAL_TABLE_COLUMNS.filter((column) => column.ceHeader).map((column) => column.ceHeader), workbookHeaders);
  presentation.MATERIAL_TABLE_COLUMNS.filter((column) => column.ceHeader).forEach((column) => assert.equal(column.label, column.ceHeader));
  assert.deepEqual(
    presentation.MATERIAL_TABLE_COLUMNS.filter((column) => column.locked).map((column) => column.key),
    ["name", "actions"],
  );
});

test("hidden column preferences drop unknown, locked, and duplicate keys", () => {
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(["refDes", "name", "nope", "refDes", 7, "virtual", "symbol"]), ["refDes", "virtual"]);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns("refDes"), []);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(null), []);
});

test("the table width only counts visible columns", () => {
  const widths = COLUMN_KEYS.map((_, index) => 100 + index);
  const total = widths.reduce((sum, width) => sum + width, 0);
  assert.equal(presentation.getMaterialTableWidth(widths, []), total);
  assert.equal(presentation.getMaterialTableWidth(widths, ["refDes", "virtual"]), total - widths[3] - widths[7]);
  assert.equal(presentation.getMaterialTableWidth(widths, ["unknown"]), total);
});

test("every main-row and alternative-row cell follows the column list and its visibility flag", () => {
  for (const key of COLUMN_KEYS) {
    assert.match(rowBlock, new RegExp(`\\{columns\\.${key} && \\($`, "m"), `cell ${key} must be toggleable`);
    assert.match(rowBlock, new RegExp(`data-material-cell="${key}"`));
    assert.match(alternativeBlock, new RegExp(`\\{columns\\.${key} && `), `alternative cell ${key} must be toggleable`);
  }
  assert.equal((rowBlock.match(/<td\b/g) ?? []).length, 16);
  assert.equal((alternativeBlock.match(/<td\b/g) ?? []).length, 16);
  assert.match(rowBlock, /data-material-cell="actions"[\s\S]*?data-material-cell="tracking"[\s\S]*?<TrackingHistoryCell/, "tracking lives inside the sticky update cell");
  assert.match(source, /data-testid="material-column-visibility"/);
  assert.match(source, /HIDDEN_COLUMNS_KEY = "station-status-hub:material-hidden-columns:v1"/);
  assert.match(source, /colSpan=\{visibleColumnCount\}/);
});

test("the second header row shows the workbook meaning, or the filter where one exists", () => {
  assert.match(filterRow, /MATERIAL_TABLE_COLUMN_MEANING\[column\.key\]/);
  assert.match(filterRow, /MATERIAL_COLUMN_FILTER_KEYS\[column\.key\]/);
  const filterKeys = slice("const MATERIAL_COLUMN_FILTER_KEYS", "};");
  for (const [key, filterKey] of [["name", "material"], ["qty", "qty"], ["refDes", "refDes"], ["mpn", "mpn"], ["manufacturer", "manufacturer"], ["sourcingStatus", "sourcingStatus"], ["virtual", "virtualAlternative"], ["physical", "internal"], ["partName", "partName"], ["partSpec", "partSpec"], ["schematicPart", "schematicPart"], ["footprint", "footprint"], ["phaseOut", "phaseOut"], ["partUsage", "partUsage"], ["actions", "trackingStatus"]]) {
    assert.match(filterKeys, new RegExp(`${key}: "${filterKey}"`));
  }
  assert.match(source, /MATERIAL_CE_HELP_BY_HEADER\.get\(column\.ceHeader\)\?\.meaning/);
});

test("main rows are memoised and keep every cell to one or two short lines", () => {
  assert.match(source, /const MaterialGroupRow = memo\(function MaterialGroupRow\(/);
  assert.match(source, /const rowActions = useMemo<MaterialRowActions>/);
  assert.match(source, /const MATERIAL_CELL_CLASS = "border-r border-white\/20 px-2 py-1\.5 align-middle"/);
  assert.doesNotMatch(rowBlock, /py-3|line-clamp|<br \/>|主料 Remark:|個 MPN/);
  const identityBlock = slice("function MaterialIdentityHover(", "function MaterialFieldLabel(");
  assert.match(identityBlock, /data-testid="material-primary-name"\s+className="block min-w-0 flex-1 whitespace-normal break-words/, "the Name column shows the whole name");
  assert.doesNotMatch(identityBlock, /line-clamp-2 text-\[15px\]/);
  assert.match(rowBlock, /<MaterialSourceText value=\{statusRecord\.manufacturer\} label="Manufacturer" \/>/);
  assert.match(rowBlock, /<MaterialSourceText value=\{partSpec\} label="Part Spec" \/>/);
  assert.match(rowBlock, /<PartUsageStatus record=\{statusRecord\} \/>/);
});

test("expanded alternative rows do not repeat the group star or the main row's live editors", () => {
  assert.doesNotMatch(alternativeBlock, /onToggleMarked|<Star\b/);
  assert.match(alternativeBlock, /record\.id === primaryTxRecordId \?/);
  assert.match(alternativeBlock, /record\.id === primaryTrackingRecordId \?/);
  assert.match(rowBlock, /aria-expanded=\{hasAlternatives \? expanded : undefined\}/);
  assert.match(source, /adjacentIndex = MATERIAL_TABLE_COLUMNS\.findIndex\(/);
  assert.match(source, /const REF_COLLATOR = new Intl\.Collator\(undefined, \{ numeric: true \}\)/);
  assert.match(source, /const markedFilterSet = showMarkedOnly \? markedGroupKeySet : null/);
});

test("the 虛擬料號 confirm dialog only mounts while confirming", () => {
  const editorBlock = slice("function InlineVirtualAlternativeEditor(", "function TrackingHistoryCell(");
  assert.match(editorBlock, /\{confirmOpen && \(\s*<Dialog open onOpenChange/);
});

test("duplicate controls were merged: one clear, one page-progress entry, delete only inside BOM management", () => {
  assert.doesNotMatch(desktopHeader, /刪除 BOM|逐頁勾選|我的標記|頁數進度<\/Button>|收合頁數設定/);
  assert.equal((desktopHeader.match(/data-material-zone="page-progress"/g) ?? []).length, 1);
  assert.doesNotMatch(toolbar, /條件邏輯|尚未套用搜尋|aria-label=\{isSearchPending \? "搜尋中" : "搜尋"\}/);
  assert.equal((toolbar.match(/全部清除/g) ?? []).length, 1);
  assert.doesNotMatch(filterRow, />清除</);
  assert.doesNotMatch(filterRow, /showMarkedOnly|column\.key === "marked"/);
  assert.doesNotMatch(toolbar, /columnVisibility\.marked|只看我的標記/);
  assert.doesNotMatch(source, /function AlternativeRows\(|function SummaryTile\(|saveQuickBomPageTracker|pageTrackerPanelCollapsed/);
  const bomManager = slice("function BomManagerDialog(", "function MaterialRecordDialog(");
  assert.match(bomManager, />刪除</);
  assert.doesNotMatch(bomManager, /BOM ID<\/p>|歷史 BOM 清單/);
});

test("dialogs and popovers use the page theme tokens instead of their own fixed colours", () => {
  const dialogBlocks = [
    slice("function CompactHoverValue(", "function MaterialFieldLabel("),
    slice("function TrackingHistoryDialog(", "function PhaseOutStatus("),
    slice("function BomPageTrackerDialog(", "function MaterialRecordDialog("),
    slice("function MaterialRecordDialog(", "type MaterialColumnVisibility"),
    slice("function MaterialColumnSettings(", "const MaterialGroupRow = memo("),
    slice("function BomTableColorDialog(", "export function MaterialRequestPage() {"),
    slice("  return (\n    <Popover open={open} onOpenChange={setOpen}>", "function ResizableHeader("),
  ].join("\n");
  assert.doesNotMatch(dialogBlocks, /#0[0-9a-f]{5}|bg-\[#|border-(?:cyan|sky|blue|teal|violet|fuchsia|emerald)-\d|bg-(?:cyan|sky|blue|teal|violet|fuchsia|emerald)-\d/);
  assert.match(dialogBlocks, /workspace-dialog-section/);
  assert.match(source, /const CHIP_TONES = \{/);
  const pageTracker = slice("function BomPageTrackerDialog(", "function BomManagerDialog(");
  assert.match(pageTracker, /className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-background\/40"/);
  assert.match(pageTracker, /role="group" aria-label=\{`第 \$\{page\.pageNumber\} 頁狀態`\}/);
  assert.match(slice("function MaterialRecordDialog(", "const MaterialGroupRow = memo("), /CE Excel 欄位/);
  assert.match(source, /<AlertDialogContent data-dialog-tone="danger"/);
  assert.match(source, /px-3 py-1\.5 lg:pr-28"/);
});

test("phase out stays an independent source value and the Symbol column is gone", () => {
  assert.deepEqual(presentation.MATERIAL_TABLE_COLUMNS.slice(13, 15).map((column) => [column.key, column.label]), [["phaseOut", "phase out"], ["partUsage", "零件狀態"]]);
  assert.deepEqual(presentation.normalizeHiddenMaterialColumns(["status", "symbol", "mpn"]), ["mpn"]);
  for (const raw of ["PHASEOUT", "ACTIVE", "UNDERREVIEW", "  ACTIVE  "]) assert.equal(presentation.getMaterialSourceValue(raw), raw);
  for (const empty of ["", "   ", undefined]) assert.equal(presentation.getMaterialSourceValue(empty), "未提供");
  const sourceColumns = slice("function PhaseOutStatus(", "function MaterialSourceText(");
  assert.match(sourceColumns, /getMaterialSourceValue\(record\.phaseOutStatus\)/);
  assert.doesNotMatch(sourceColumns, /symbolStatus|getMaterialBuildRequirements|getMaterialBuildRequirementLabel|symbolAvailability/);
});

test("the desktop empty state keeps the table skeleton and the standard wording", () => {
  const emptyBlock = slice("{visibleGroupRows.length === 0 && (", "</table>");
  assert.match(emptyBlock, /<tbody>/);
  assert.match(emptyBlock, />目前篩選條件沒有符合的料件</);
});

test("BOMs are grouped by project in BOM 管理 and in the header switcher", () => {
  assert.match(source, /import \{ useTestProject \} from "@\/components\/test-projects\/TestProjectProvider"/);
  assert.match(source, /const bomProjectGroups = useMemo\(\s*\(\) => groupBomWorkspacesByProject\(activeBomWorkspaces, \{ activeProjectId, activeProjectName: activeProject\?\.name, projectNames \}\)/);
  const bomManager = slice("function BomManagerDialog(", "function MaterialRecordDialog(");
  assert.match(bomManager, /projectGroups: BomProjectGroup<BomWorkspace>\[\]/);
  assert.match(bomManager, /visibleGroups\.flatMap\(\(group\) => \[/);
  assert.match(bomManager, /<div key=\{`project:\$\{group\.key\}`\}/);
  assert.doesNotMatch(bomManager, /<section key=\{group\.key\}/);
  assert.match(bomManager, /請有編輯權限的同事上傳 Excel 或指定專案/);
  assert.match(bomManager, /className="h-11 w-\[11rem\] rounded-md px-2 text-sm md:h-8"/);
  assert.match(bomManager, />目前專案</);
  assert.match(bomManager, /onAssignProject\(workspace\.id, value === UNASSIGNED_BOM_PROJECT_VALUE \? null : value\)/);
  assert.match(bomManager, /此專案還沒有 BOM/);
  assert.match(desktopHeader, /<SelectGroup key=\{group\.key\}>/);
  assert.match(desktopHeader, /<SelectLabel/);
  assert.match(desktopHeader, />非目前專案</);
  assert.match(source, /project: existingWorkspace\?\.project \?\? importProject \}/);
  assert.match(source, /saveBomWorkspaceProject\(workspaceId, nextProject, \(\) => assertBomWriteCurrent\(writeScope\)\)/);
});

test("the project row has one writer and realtime keeps the bom: prefix of workspace ids", () => {
  const saveWorkspace = storageSource.slice(storageSource.indexOf("export async function saveBomWorkspace("), storageSource.indexOf("export async function saveBomWorkspaceRecord("));
  assert.doesNotMatch(saveWorkspace, /workspace\.project/);
  assert.match(storageSource, /column_order: project \?\? \{ projectId: "", projectName: "", updatedAt: new Date\(\)\.toISOString\(\) \}/);
  assert.match(storageSource, /getBomPreferenceWorkspaceId\(key, BOM_PREFERENCE_KEY_PREFIXES\)/);
  assert.doesNotMatch(storageSource, /key\.split\(":"\)\.pop\(\)/);
  assert.match(storageSource, /loadProjectMap\(\)\.catch\(\(\) => null\)/);
  assert.match(storageSource, /export async function loadBomWorkspaceProjects\(\)/);
  assert.match(storageSource, /export async function saveBomWorkspaceArchive\(/);
  assert.match(storageSource, /column_order: archive \?\? \{ archived: false, archivedAt: "", archivedBy: "" \}/);
  assert.match(source, /if \(!existingWorkspace && importProject\) \{\s*recentLocalWorkspaceWritesRef\.current\.set\(workspaceId, Date\.now\(\)\);\s*await saveBomWorkspaceProject\(workspaceId, importProject,/);
  assert.match(source, /if \(!activeProjectId \|\| !workspaceListSettled\) return;/);
  assert.match(source, /if \(change\.recordIds\.length === 0 && change\.workspaceIds\.length > 0\) void refreshBomProjects\(\);/);
  assert.match(source, /change\.recordIds\.length === 0 && now - localWorkspaceWriteAt > 5000/);
  const compactHeader = slice('data-testid="material-mobile-command-center"', 'data-material-zone="overview"');
  assert.match(compactHeader, /activeWorkspaceProjectLabel/);
  assert.match(compactHeader, />非目前專案</);
});

test("待處理料 opens from the header actions and groups pending parts by category", () => {
  const dialogSource = () => slice("function PendingMaterialsDialog(", "const UNASSIGNED_BOM_PROJECT_VALUE");
  const actions = slice('data-material-zone="actions"', '{collaborationStatus !== "remote" && (');
  assert.match(actions, /data-testid="pending-materials-button"[\s\S]*?待處理料[\s\S]*?新增料件[\s\S]*?上傳說明\s*<\/Button>\s*<\/div>/);
  assert.match(dialogSource(), /role="tablist" aria-label="待處理料分類"/);
  const dialog = slice("function PendingMaterialsDialog(", 'const UNASSIGNED_BOM_PROJECT_VALUE');
  assert.match(dialog, /groupPendingMaterials\(groups\)/);
  assert.match(dialog, />優先處理</);
  assert.match(dialog, /onLocate\(group\)|onOpenTracking\(record\)|onOpenCreate\(group\)/);
  assert.match(source, /const pendingMaterialGroups = useMemo\(\(\) => dataset\.groups\.filter\(requiresApplication\)/);
  assert.match(source, /<PendingMaterialsDialog/);
  const dialogTokens = dialog;
  assert.doesNotMatch(dialogTokens, /bg-\[#|border-(?:cyan|sky|blue|teal|violet|fuchsia|emerald)-\d/);
});

test("column filters apply on every click instead of waiting for 確定", () => {
  const popover = slice("function ExcelFilterPopover(", "function ResizableHeader(");
  assert.doesNotMatch(popover, /draftSelectedValues|commitSelection|cancelSelection|mergeSearchSelection|>確定<|>取消</);
  assert.match(popover, /const toggleValue = \(value: string, checked: boolean\) => \{\s*apply\(/);
  assert.match(popover, /if \(event\.key === "Enter" && searchHasValue && filteredOptions\.length > 0\)/);
  for (const text of [">只留符合<", ">加入符合<", ">移除符合<", ">全選<", ">清除<", ">完成<"]) assert.ok(popover.includes(text), text);
  assert.match(popover, /onOpenAutoFocus=/);
});

test("editing an item from 待處理料 returns to the list with its tab, search and scroll kept", () => {
  assert.match(source, /onOpenCreate=\{\(group\) => \{ setPendingDialogOpen\(false\); setReturnToPending\(true\); openCreate\(group\); \}\}/);
  assert.match(source, /onOpenTracking=\{\(record\) => \{ setPendingDialogOpen\(false\); setReturnToPending\(true\); openTrackingDialog\(record\); \}\}/);
  assert.match(source, /if \(!returnToPending \|\| editorOpen \|\| trackingDialogOpen\) return;\s*setReturnToPending\(false\);\s*setPendingRestoreView\(true\);\s*setPendingDialogOpen\(true\);/);
  assert.match(source, /restoreView=\{pendingRestoreView\}/);
  const dialog = slice("function PendingMaterialsDialog(", "const UNASSIGNED_BOM_PROJECT_VALUE");
  assert.match(dialog, /if \(restoreView\) \{/);
  assert.match(dialog, /ref=\{listRef\} onScroll=/);
  assert.equal((source.match(/onClick=\{openPendingDialog\}/g) ?? []).length, 2, "the header buttons open a fresh list");
});

test("匯出報表 and 上傳說明 carry their own colours and 上傳說明 blinks", () => {
  const actions = slice('data-material-zone="actions"', '{collaborationStatus !== "remote" && (');
  assert.match(actions, /bg-info px-3[^"]*text-info-foreground[^"]*">\s*<Download[^/]*\/>匯出報表/);
  assert.match(actions, /data-testid="material-guide-button"[\s\S]{0,120}?className="material-guide-attention[^"]*bg-\[hsl\(var\(--platform-violet\)\)\]/);
});

test("pending parts keep blinking until a part number arrives or data is refreshed", () => {
  assert.match(source, /const STALE_PENDING_MS = 3 \* 24 \* 60 \* 60 \* 1000;/);
  const dialog = slice("function PendingMaterialsDialog(", "const UNASSIGNED_BOM_PROJECT_VALUE");
  assert.match(dialog, /stale \? "material-blink bg-destructive"/);
  assert.match(dialog, />逾 3 天未更新</);
  assert.match(source, /data-testid="pending-materials-button"[\s\S]{0,400}?requiredApplicationCount > 0 && "material-attention"/);
  assert.match(source, /id="material-internal-pn"[\s\S]{0,400}?placeholder:!text-warning/);
});

test("a SPEC document can be attached to a record and opened from the Part Spec cell", () => {
  const dialog = slice("function MaterialRecordDialog(", "type MaterialColumnVisibility");
  assert.match(dialog, /data-testid="material-spec-document"/);
  assert.match(dialog, /uploadMaterialSpecDocument\(\{ workspaceId, recordId: form\.id, file, uploadedBy: uploaderName \}\)/);
  assert.match(dialog, /accept=\{MATERIAL_SPEC_ACCEPT\}/);
  assert.match(dialog, /"上傳 SPEC"/);
  assert.match(rowBlock, /statusRecord\.specDocument && \(/);
  assert.match(source, /specDocument: record\.specDocument,/);
  assert.match(rowBlock, /<MaterialSourceText value=\{partSpec\} label="Part Spec" \/>/);
});

test("不建議料匯出 opens the Non PVL dialog with the SOP link, preview and both exports", async () => {
  const dialogSource = (await readFile(new URL("../src/components/material-requests/MaterialNonPvlDialog.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(dialogSource, /NON_PVL_SOP_URL = "https:\/\/sp\.pegatroncorp\.com\/plm\/FAQ\/Part\/\[PART\]%20/);
  assert.match(dialogSource, /NON_PVL_SOP_TITLE = "\[PART\] 依專案解除不建議使用料申請說明"/);
  assert.match(dialogSource, /material-non-pvl\//);
  for (const text of ["step1.png", "step6.png", "匯出 PLM 申請清單", "匯出完整明細 (.xlsx)", "料號(必填)"]) assert.ok(dialogSource.includes(text), text);
  assert.match(source, /data-testid="discouraged-export-button" onClick=\{\(\) => setNonPvlDialogOpen\(true\)\}/);
  assert.match(source, /<MaterialNonPvlDialog/);
});

test("待處理料 can turn the pending parts into per-vendor mail content", () => {
  const dialog = slice("function PendingMailDialog(", "function PendingMaterialsDialog(");
  assert.match(dialog, /buildVendorMailSections\(groups, workspaceName\)/);
  assert.match(dialog, /exportVendorMailHtml\(\{ sections, messageHtml, signatureHtml, workspaceName, exportedBy \}\)/);
  assert.match(dialog, /id="pending-mail-message"/);
  assert.match(dialog, /id="pending-mail-signature"/);
  assert.match(source, /function MailRichEditor\(/);
  assert.match(source, /contentEditable/);
  const pending = slice("function PendingMaterialsDialog(", "const UNASSIGNED_BOM_PROJECT_VALUE");
  assert.match(pending, /data-testid="pending-mail-button"[\s\S]*?信件生成/);
  assert.match(pending, /<PendingMailDialog groups=\{groups\}/);
});

test("BOM 管理 can archive a BOM and keeps archived BOMs out of the switcher and project groups", () => {
  const bomManager = slice("function BomManagerDialog(", "function MaterialRecordDialog(");
  assert.match(bomManager, />封存</);
  assert.match(bomManager, />解除封存</);
  assert.match(bomManager, /data-testid="bom-archive-section"/);
  assert.match(source, /const activeBomWorkspaces = useMemo\(\(\) => orderedBomWorkspaces\.filter\(\(workspace\) => !workspace\.archive\)/);
  assert.match(source, /groupBomWorkspacesByProject\(activeBomWorkspaces, /);
  assert.match(source, /!workspace\.archive && workspace\.project\?\.projectId === activeProjectId/);
  assert.match(source, /saveBomWorkspaceArchive\(workspaceId, nextArchive, \(\) => assertBomWriteCurrent\(writeScope\)\)/);
});
