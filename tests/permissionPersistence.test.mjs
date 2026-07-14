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

test("admin dialog never reports a database failure as a local success", async () => {
  const source = await read("../src/components/admin/UserPermissionsDialog.tsx");
  assert.match(source, /\.rpc\("set_user_access_permissions"/);
  assert.doesNotMatch(source, /已以本機方式儲存/);
  assert.doesNotMatch(source, /user_workspace_permissions:/);
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
