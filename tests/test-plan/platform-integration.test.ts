import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("registers Test_Plan in the maintenance navigation and lazy station route", async () => {
  const index = await source("src/pages/Index.tsx");
  const sidebar = await source("src/components/layout/Sidebar.tsx");

  assert.match(index, /const TestPlanWorkspace = React\.lazy/);
  assert.match(index, /import\("@\/components\/test-plan\/TestPlanWorkspace"\)/);
  assert.match(index, /\|\s*"test-plan"/);
  assert.match(index, /case "test-plan":[\s\S]{0,220}<PermissionGuard module="test-plan">/);
  assert.match(sidebar, /\{\s*id:\s*"test-plan",\s*label:\s*"資料儲存"/);
});

test("adds view and edit permission contracts everywhere platform permissions are declared", async () => {
  const permissions = await source("src/lib/workspacePermissions.ts");
  const databaseTypes = await source("src/integrations/supabase/types.ts");
  const migration = await source(
    "supabase/migrations/20260729160000_create_test_plan_workspace.sql",
  );

  for (const sourceText of [permissions, databaseTypes, migration]) {
    assert.match(sourceText, /test_plan_view/);
    assert.match(sourceText, /test_plan_edit/);
  }
  assert.match(permissions, /"test-plan":\s*"station-status"/);
  assert.match(permissions, /"test-plan":\s*"test_plan"/);
  assert.match(permissions, /test_plan:\s*\{[\s\S]{0,260}資料儲存/);
});

test("creates owner-scoped metadata, hierarchy guards, and a private 500 MiB bucket", async () => {
  const migration = await source(
    "supabase/migrations/20260729160000_create_test_plan_workspace.sql",
  );

  assert.match(migration, /create table if not exists public\.test_plan_spaces/i);
  assert.match(migration, /create table if not exists public\.test_plan_folders/i);
  assert.match(migration, /create table if not exists public\.test_plan_files/i);
  assert.match(migration, /references public\.system_users\s*\(id\)/i);
  assert.match(migration, /test_plan_validate_folder_parent/i);
  assert.match(migration, /test-plan-files/);
  assert.match(migration, /public\s*=\s*false/i);
  assert.match(migration, /524288000/);
  assert.match(migration, /storage\.objects/i);
  assert.match(migration, /test-plan-files-owner-write/i);
});

test("enforces authenticated owner and Test_Plan permissions in metadata and storage RLS", async () => {
  const migration = await source(
    "supabase/migrations/20260729160000_create_test_plan_workspace.sql",
  );

  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /auth_user_id/);
  assert.match(migration, /test_plan_current_system_user_id/);
  assert.match(migration, /test_plan_current_user_can/);
  assert.match(migration, /permission::text\s*=\s*'test_plan_edit'/);
  assert.match(migration, /users\.permissions\s*#>\s*'\{workspaceAccess\}'/);
  assert.match(
    migration,
    /users\.permissions\s*#>>\s*'\{workspaceAccess,station-status\}'/,
  );
  assert.match(migration, /to authenticated/i);
  assert.doesNotMatch(
    migration,
    /test_plan_(?:spaces|folders|files)[\s\S]{0,100}to anon/i,
  );
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i);
  assert.match(
    migration,
    /folder_id uuid references public\.test_plan_folders \(id\) on delete cascade/i,
  );
  assert.match(migration, /storage\.foldername\(name\)/);
});

test("latest Test_Plan access migration derives configured station access before legacy page-permission fallback", async () => {
  const migrationName =
    "20260730220000_inherit_test_plan_maintenance_access.sql";
  const migrationDirectory = new URL("supabase/migrations/", root);
  const migrationNames = await readdir(migrationDirectory);

  assert.ok(
    migrationNames.includes(migrationName),
    "the inherited Test_Plan maintenance-access migration must exist",
  );
  if (!migrationNames.includes(migrationName)) return;

  const migration = await source(`supabase/migrations/${migrationName}`);

  assert.match(
    migration,
    /create or replace function public\.test_plan_current_user_can\(action text\)/i,
  );
  assert.match(
    migration,
    /users\.permissions\s*#>>\s*'\{workspaceAccess,station-status\}'\s*in\s*\('view',\s*'edit'\)/i,
  );
  assert.match(
    migration,
    /users\.permissions\s*#>>\s*'\{workspaceAccess,station-status\}'\s*=\s*'edit'/i,
  );
  assert.match(
    migration,
    /not\s*\(\s*coalesce\(\s*users\.permissions\s*#>\s*'\{workspaceAccess\}'[\s\S]*?\?\s*'station-status'\s*\)[\s\S]*?test_plan_(?:view|edit)/i,
  );
  assert.match(migration, /grant execute on function public\.test_plan_current_user_can\(text\)/i);
});

test("latest Test_Plan sharing migration exposes spaces to permitted accounts without weakening authentication", async () => {
  const migration = await source(
    "supabase/migrations/20260731183000_share_test_plan_spaces.sql",
  );
  const adapter = await source(
    "src/components/test-plan/core/supabaseAdapter.ts",
  );

  assert.match(migration, /test-plan-spaces-shared-read/i);
  assert.match(migration, /test_plan_current_user_can\('view'\)/i);
  assert.match(migration, /test_plan_current_user_can_access_space\(space_id, 'edit'\)/i);
  assert.match(migration, /test_plan_current_user_can_read_storage_object\(name\)/i);
  assert.match(migration, /test_plan_current_user_can_manage_storage_object\(name\)/i);
  assert.match(migration, /to authenticated/i);
  assert.doesNotMatch(migration, /to anon/i);
  assert.doesNotMatch(
    adapter,
    /\.from\("test_plan_spaces"\)[\s\S]{0,140}\.eq\("owner_id"/,
  );
});

test("admin permission editor explains inherited Test_Plan access instead of exposing an independent toggle", async () => {
  const dialog = await source(
    "src/components/admin/UserPermissionsDialog.tsx",
  );

  assert.match(dialog, /資料儲存權限會跟隨「機台維修紀錄中心」/);
  assert.match(dialog, /\.filter\(\(\[groupKey\]\)\s*=>\s*groupKey\s*!==\s*"test_plan"\)/);
});

test("admin permission saves synchronize Test_Plan rows from maintenance access for compatibility", async () => {
  const dialog = await source(
    "src/components/admin/UserPermissionsDialog.tsx",
  );

  assert.match(
    dialog,
    /const synchronizedPermissions = synchronizeWorkspacePermissions\(\s*permissions,\s*"station-status",\s*workspaceAccess\["station-status"\],\s*\)/,
  );
  assert.match(dialog, /p_permissions:\s*synchronizedPermissions/);
  assert.match(
    dialog,
    /const legacyPermissions = synchronizedPermissions\.filter\(/,
  );
});

test("publishes Test_Plan labels to collaboration and offline export catalogs", async () => {
  const collaboration = await source(
    "src/components/collaboration/CollaborationCenter.tsx",
  );
  const adminCollaboration = await source(
    "src/components/collaboration/AdminCollaborationPanel.tsx",
  );
  const siteExport = await source("src/utils/siteArchiveExport.ts");

  assert.match(collaboration, /"test-plan":\s*"資料儲存"/);
  assert.match(adminCollaboration, /"test-plan":\s*"資料儲存"/);
  assert.match(siteExport, /\{\s*id:\s*"test-plan",\s*label:\s*"資料儲存"\s*\}/);
});

test("queues durable file cleanup before an administrator deletes an account", async () => {
  const migration = await source(
    "supabase/migrations/20260729160000_create_test_plan_workspace.sql",
  );
  const accountSync = await source(
    "supabase/functions/account-admin-sync/index.ts",
  );

  assert.match(migration, /create table if not exists public\.test_plan_account_cleanup_queue/i);
  assert.match(migration, /test_plan_queue_account_cleanup/i);
  assert.match(migration, /test_plan_storage_cleanup_queue/i);
  assert.match(migration, /test_plan_queue_file_cleanup/i);
  assert.match(
    migration,
    /before delete on public\.system_users[\s\S]{0,120}test_plan_queue_account_cleanup/i,
  );
  assert.match(accountSync, /\.from\("test_plan_account_cleanup_queue"\)/);
  assert.match(
    accountSync,
    /\.storage[\s\S]{0,120}\.from\(TEST_PLAN_STORAGE_BUCKET\)[\s\S]{0,180}\.remove\(/,
  );
  const deleteFlow = accountSync.slice(
    accountSync.indexOf('if (action === "delete")'),
  );
  const systemDeleteIndex = deleteFlow.search(
    /\.from\("system_users"\)[\s\S]{0,100}\.delete\(\)/,
  );
  assert.ok(
    systemDeleteIndex >= 0
      && systemDeleteIndex
        < deleteFlow.indexOf("await cleanupQueuedAccount(", systemDeleteIndex),
    "system account deletion must commit the cleanup queue before blob/auth cleanup",
  );
});

test("connects the repository to private Supabase storage through one guarded hook", async () => {
  const adapter = await source(
    "src/components/test-plan/core/supabaseAdapter.ts",
  );
  const hook = await source(
    "src/components/test-plan/hooks/useTestPlanWorkspace.ts",
  );

  assert.match(adapter, /\.from\(["']test_plan_spaces["']\)/);
  assert.match(adapter, /\.from\(["']test_plan_folders["']\)/);
  assert.match(adapter, /\.from\(["']test_plan_files["']\)/);
  assert.match(adapter, /\.from\(TEST_PLAN_STORAGE_BUCKET\)[\s\S]{0,120}\.upload\(/);
  assert.match(adapter, /\.from\(TEST_PLAN_STORAGE_BUCKET\)[\s\S]{0,160}\.update\(/);
  assert.match(adapter, /\.from\(TEST_PLAN_STORAGE_BUCKET\)[\s\S]{0,120}\.download\(/);
  assert.match(adapter, /\.from\(TEST_PLAN_STORAGE_BUCKET\)[\s\S]{0,120}\.remove\(/);
  assert.match(adapter, /upload\/resumable/);
  assert.match(adapter, /Tus-Resumable/);
  assert.match(adapter, /Upload-Offset/);
  assert.match(adapter, /retryDelays/);
  assert.match(adapter, /onProgress/);
  assert.match(
    adapter,
    /\.from\(["']test_plan_spaces["']\)[\s\S]{0,180}\.delete\(\)[\s\S]{0,180}\.select\(["']id["']\)/,
  );
  assert.match(
    adapter,
    /\.from\(["']test_plan_folders["']\)[\s\S]{0,180}\.delete\(\)[\s\S]{0,180}\.select\(["']id["']\)/,
  );
  assert.match(
    adapter,
    /\.from\(["']test_plan_files["']\)[\s\S]{0,180}\.delete\(\)[\s\S]{0,180}\.select\(["']id["']\)/,
  );
  assert.match(hook, /if \(!canEdit\)[\s\S]{0,120}唯讀/);
  assert.match(hook, /sessionMode === "authenticated"/);
  assert.match(hook, /資料儲存需要安全登入工作階段/);
  assert.match(hook, /mutationInFlightRef/);
  assert.match(hook, /activeSpaceIdRef\.current\s*!==\s*expectedSpaceId/);
  assert.match(hook, /requestIdRef/);
  assert.match(hook, /uploadProgress/);
  assert.match(hook, /replaceFileContents/);
});
