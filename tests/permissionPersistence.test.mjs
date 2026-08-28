import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("permission enum adds independent flow setup permissions", async () => {
  const sql = await read("../supabase/migrations/20260715143000_add_flow_permissions.sql");
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'flow_info_view'/);
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'flow_info_edit'/);
});

test("permission updates are atomic and publish real-time changes", async () => {
  const sql = await read("../supabase/migrations/20260715143100_atomic_user_permissions.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_user_access_permissions/i);
  assert.match(sql, /DELETE FROM public\.user_page_permissions/i);
  assert.match(sql, /INSERT INTO public\.user_page_permissions/i);
  assert.match(sql, /UPDATE public\.system_users/i);
  assert.match(sql, /supabase_realtime/i);
});

test("workspace permission saves retain atomic writes behind an administrator-only RPC", async () => {
  const sql = await read("../supabase/migrations/20260828120000_repair_workspace_permission_saves.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION workspace\.set_user_access_permissions/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /workspace\.current_user_can_workspace\('user-management', 'edit'\)/);
  assert.match(sql, /DELETE FROM workspace\.user_page_permissions/i);
  assert.match(sql, /UPDATE workspace\.system_users/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION workspace\.set_user_access_permissions/i);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/i);
});

test("admin dialog stores a complete permission snapshot through the verified service", async () => {
  const source = await read("../src/components/admin/UserPermissionsDialog.tsx");
  assert.match(source, /import \{ mutateAuthAccount \} from "\.\/authAccountSync"/);
  assert.match(source, /readStoredPagePermissions/);
  assert.match(source, /profile: \{ permissions: mergedSettings \}/);
  assert.match(source, /pagePermissions: synchronizedPermissions/);
  assert.match(source, /forceVerifiedService: true/);
  assert.match(source, /Legacy page permission sync skipped/);
  assert.match(source, /function getSaveErrorMessage/);
  assert.match(source, /description: getSaveErrorMessage\(error\)/);
  assert.doesNotMatch(source, /已以本機方式儲存/);
});

test("verified account service can finish a legacy permission save", async () => {
  const source = await read("../src/components/admin/authAccountSync.ts");
  assert.match(source, /forceVerifiedService\?: boolean/);
  assert.match(
    source,
    /!REALTIME_COLLABORATION_V2_ENABLED && !options\.forceVerifiedService/,
  );
});

test("stored page permissions remain authoritative when legacy rows cannot be updated", async () => {
  const permissions = await read("../src/hooks/usePermissions.ts");
  const workspace = await read("../src/lib/workspacePermissions.ts");
  assert.match(workspace, /pagePermissions\?: Permission\[\]/);
  assert.match(workspace, /export function readStoredPagePermissions/);
  assert.match(permissions, /readStoredPagePermissions\(settings\)/);
  assert.match(permissions, /pagePermissionResult\.error && storedPermissions === null/);
});

test("flow setup mutations require the flow edit permission", async () => {
  const source = await read("../src/components/test-tracker/FlowInfo.tsx");
  assert.match(source, /canEditModule\("flow-info"\)/);
  assert.match(source, /if \(!hasFlowEditPermission/);
});

test("backend user controls require backend edit permission", async () => {
  const source = await read("../src/components/admin/AdminPanel.tsx");
  assert.match(source, /canEditModule\("users"\)/);
  assert.match(source, /disabled=\{!canEditUsers\}/);
});

test("API key mutations require API management edit permission", async () => {
  const source = await read("../src/components/api-management/ApiKeyManagement.tsx");
  assert.match(source, /canEditModule\("api-management"\)/);
  assert.match(source, /if \(!canEditApiManagement\) return;/);
});
