import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("renders a platform-sized Test_Plan engineering file workspace", async () => {
  const workspace = await source(
    "src/components/test-plan/TestPlanWorkspace.tsx",
  );
  const styles = await source("src/components/test-plan/test-plan.css");

  assert.match(workspace, /Test_Plan/);
  assert.match(workspace, /電路板與工程資料/);
  assert.match(workspace, /PPT/);
  assert.match(workspace, /Excel/);
  assert.match(workspace, /STEP/);
  assert.match(workspace, /BRD/);
  assert.match(styles, /\.test-plan-workspace/);
  assert.match(styles, /@media \(max-width: 1023px\)/);
});

test("provides spaces, nested folders, breadcrumbs, search, filters, and both views", async () => {
  const workspace = await source(
    "src/components/test-plan/TestPlanWorkspace.tsx",
  );

  assert.match(workspace, /createSpace/);
  assert.match(workspace, /createFolder/);
  assert.match(workspace, /buildFolderBreadcrumbs/);
  assert.match(workspace, /filterAndSortEntries/);
  assert.match(workspace, /搜尋檔案與資料夾/);
  assert.match(workspace, /categoryFilter/);
  assert.match(workspace, /sort/);
  assert.match(workspace, /"grid"/);
  assert.match(workspace, /"list"/);
  assert.match(workspace, /expandedFolderIds/);
  assert.match(workspace, /aria-expanded=\{isExpanded\}/);
  assert.match(workspace, /收合 \$\{folder\.name\}/);
  assert.match(workspace, /個子資料夾/);
});

test("edits uploaded spreadsheets in place without forcing a download workflow", async () => {
  const [workspace, editor, inspector, styles] = await Promise.all([
    source("src/components/test-plan/TestPlanWorkspace.tsx"),
    source("src/components/test-plan/TestPlanSpreadsheetEditor.tsx"),
    source("src/components/test-plan/TestPlanInspector.tsx"),
    source("src/components/test-plan/test-plan.css"),
  ]);

  assert.match(workspace, /TestPlanSpreadsheetEditor/);
  assert.match(workspace, /replaceFileContents/);
  assert.match(workspace, /直接編輯 Excel/);
  assert.match(editor, /import\("xlsx"\)/);
  assert.match(editor, /import\("exceljs"\)/);
  assert.match(editor, /formattedWorksheet\.model\.merges/);
  assert.match(editor, /getFormattedCellStyle/);
  assert.match(editor, /readFormattedCellValue/);
  assert.match(editor, /cell\.value\.result/);
  assert.match(editor, /getColumnWidth/);
  assert.match(editor, /getRowHeight/);
  assert.match(editor, /原始格式/);
  assert.match(editor, /儲存回原檔/);
  assert.match(editor, /這份 Excel 還沒有儲存/);
  assert.match(editor, /ROW_PAGE_SIZE = 100/);
  assert.match(inspector, /onEditSpreadsheet/);
  assert.match(styles, /\.test-plan-sheet-grid-wrap/);
  assert.match(styles, /\.test-plan-folder-tree-toggle\.is-expanded/);
});

test("supports drag-and-drop batch upload with all engineering formats", async () => {
  const workspace = await source(
    "src/components/test-plan/TestPlanWorkspace.tsx",
  );
  const files = await source("src/components/test-plan/core/files.ts");

  assert.match(workspace, /multiple/);
  assert.match(workspace, /onDragOver/);
  assert.match(workspace, /onDrop/);
  assert.match(workspace, /uploadFiles/);
  assert.match(workspace, /uploadProgress/);
  assert.doesNotMatch(workspace, /accept=\{TEST_PLAN_FILE_ACCEPT\}/);
  assert.match(files, /\.pptx/);
  assert.match(files, /\.xlsx/);
  assert.match(files, /\.step/);
  assert.match(files, /\.brd/);
});

test("exposes real rename, move, describe, download, and delete actions", async () => {
  const workspace = await source(
    "src/components/test-plan/TestPlanWorkspace.tsx",
  );

  assert.match(workspace, /renameFolder/);
  assert.match(workspace, /moveFolder/);
  assert.match(workspace, /deleteFolder/);
  assert.match(workspace, /renameFile/);
  assert.match(workspace, /moveFile/);
  assert.match(workspace, /updateFileDescription/);
  assert.match(workspace, /downloadFile/);
  assert.match(workspace, /deleteFile/);
});

test("makes loading, empty, error, view-only, and destructive states explicit", async () => {
  const workspace = await source(
    "src/components/test-plan/TestPlanWorkspace.tsx",
  );

  assert.match(workspace, /正在載入 Test_Plan/);
  assert.match(workspace, /尚未建立空間/);
  assert.match(workspace, /唯讀/);
  assert.match(workspace, /error/);
  assert.match(workspace, /需要安全登入/);
  assert.match(workspace, /isAuthenticated/);
  assert.match(workspace, /isSpaceDrawerOpen/);
  assert.match(workspace, /aria-controls="test-plan-space-drawer"/);
  assert.match(workspace, /AlertDialog/);
  assert.match(workspace, /disabled=\{!canEdit/);
});

test("finishes the daily Test_Plan workflow with a full space form, guided start, selection, and private-file inspector", async () => {
  const [workspace, spaceDialog, inspector, styles] = await Promise.all([
    source("src/components/test-plan/TestPlanWorkspace.tsx"),
    source("src/components/test-plan/TestPlanSpaceDialog.tsx"),
    source("src/components/test-plan/TestPlanInspector.tsx"),
    source("src/components/test-plan/test-plan.css"),
  ]);

  assert.match(spaceDialog, /空間名稱/);
  assert.match(spaceDialog, /空間說明/);
  assert.match(spaceDialog, /識別色/);
  assert.match(spaceDialog, /description/);
  assert.match(spaceDialog, /color/);
  assert.match(spaceDialog, /role="alert"/);
  assert.match(spaceDialog, /資料空間未儲存/);

  assert.match(workspace, /建立空間/);
  assert.match(workspace, /資料空間建立失敗/);
  assert.match(workspace, /description: message/);
  assert.match(workspace, /建立資料夾/);
  assert.match(workspace, /上傳工程檔案/);
  assert.match(workspace, /selectedEntry/);
  assert.match(workspace, /TestPlanInspector/);
  assert.match(workspace, /MaintenanceMetricStrip/);

  assert.match(inspector, /getTestPlanPreviewKind/);
  assert.match(inspector, /downloadFile/);
  assert.match(inspector, /URL\.createObjectURL/);
  assert.match(inspector, /URL\.revokeObjectURL/);
  assert.match(inspector, /<img/);
  assert.match(inspector, /<iframe/);
  assert.match(inspector, /await blob\.text\(\)/);

  assert.match(styles, /\.test-plan-inspector/);
  assert.match(styles, /grid-template-columns:[^;]*minmax\(0,\s*1fr\)[^;]*minmax\(/);
});
