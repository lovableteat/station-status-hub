import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("project center exposes a guarded permanent delete flow", async () => {
  const provider = await read("../src/components/test-projects/TestProjectProvider.tsx");
  const scopeBar = await read("../src/components/test-projects/ProjectScopeBar.tsx");

  assert.match(provider, /supabase\.rpc\("delete_test_project"/);
  assert.match(scopeBar, /Trash2/);
  assert.match(scopeBar, /永久刪除/);
  assert.match(scopeBar, /機台、流程、測試進度、問題、工時與資料空間/);
});

test("project deletion migration removes legacy blockers and protects the RPC", async () => {
  const sql = await read(
    "../supabase/migrations/20260902110000_delete_test_projects.sql",
  );

  assert.match(sql, /create or replace function workspace\.delete_test_project/i);
  assert.match(sql, /current_user_can_workspace\('station-status', 'edit'\)/i);
  assert.match(sql, /At least one active project must be kept/i);
  for (const table of [
    "test_progress",
    "station_time_analytics",
    "station_time_records",
    "issues",
    "station_contents",
    "test_flow_items",
    "test_flow_stations",
    "test_systems",
  ]) {
    assert.match(sql, new RegExp(`delete from workspace\\.${table}`, "i"));
  }
  assert.match(sql, /delete from workspace\.test_projects/i);
  assert.match(sql, /revoke delete on table workspace\.test_projects from anon, authenticated/i);
  assert.match(sql, /grant execute on function workspace\.delete_test_project\(uuid\) to authenticated, service_role/i);
});
