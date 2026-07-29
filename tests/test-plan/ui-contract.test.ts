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
