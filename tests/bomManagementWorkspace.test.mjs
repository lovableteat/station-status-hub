import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("BOM management has a dedicated route, module entry, and workspace config", async () => {
  const [index, sidebar, workspace, permissions] = await Promise.all([
    readSource("src/pages/Index.tsx"),
    readSource("src/components/layout/Sidebar.tsx"),
    readSource("src/components/test-plan/workspaceConfig.ts"),
    readSource("src/lib/workspacePermissions.ts"),
  ]);

  assert.match(index, /BomManagementWorkspace/);
  assert.match(index, /id: "bom-management"/);
  assert.match(sidebar, /BOM 資料管理/);
  assert.match(workspace, /workspaceKind: "bom-management"/);
  assert.match(permissions, /"bom-management": "station-status"/);
});

test("BOM spaces remain isolated from Test_Plan spaces in Supabase", async () => {
  const [adapter, migration] = await Promise.all([
    readSource("src/components/test-plan/core/supabaseAdapter.ts"),
    readSource(
      "supabase/migrations/20260804131500_add_bom_management_workspace_kind.sql",
    ),
  ]);

  assert.match(adapter, /\.eq\("workspace_kind", workspaceKind\)/);
  assert.match(adapter, /workspace_kind: workspaceKind/);
  assert.match(
    migration,
    /workspace_kind in \('test-plan', 'bom-management'\)/,
  );
  assert.match(migration, /test_plan_spaces_project_kind_name_uidx/);
});
