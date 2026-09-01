import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql",
  import.meta.url,
);
const adminPanelUrl = new URL("../src/components/admin/AdminPanel.tsx", import.meta.url);
const performancePrivacyMigrationUrl = new URL(
  "../supabase/migrations/20260901120000_scope_performance_reviews_to_managers.sql",
  import.meta.url,
);
const performanceManagerMigrationUrl = new URL(
  "../supabase/migrations/20260901130000_assign_performance_managers.sql",
  import.meta.url,
);

const readMigration = () => readFile(migrationUrl, "utf8");

test("repair creates all missing tables directly in workspace", async () => {
  const sql = await readMigration();

  for (const table of [
    "performance_reviews",
    "test_project_system_fields",
    "test_system_field_values",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists workspace\\.${table}`, "i"));
  }

  assert.match(sql, /alter type public\.page_permission\s+add value if not exists 'performance_view'/i);
  assert.match(sql, /alter type public\.page_permission\s+add value if not exists 'performance_edit'/i);
});

test("repair removes anonymous access to sensitive account and API-key tables", async () => {
  const sql = await readMigration();

  assert.match(sql, /revoke all on table workspace\.system_users from anon/i);
  assert.match(sql, /revoke all on table workspace\.api_keys from anon/i);
  assert.doesNotMatch(
    sql,
    /grant[^;]+on(?: table)? workspace\.(?:system_users|api_keys)[^;]+to anon/i,
  );
  assert.match(
    sql,
    /grant select\s*\([\s\S]*?username[\s\S]*?\)\s*on workspace\.system_users\s*to authenticated/i,
  );
  assert.doesNotMatch(sql, /grant select\s*\([\s\S]*?password_hash/i);
});

test("repair uses authenticated permission-aware RLS for repaired feature tables", async () => {
  const sql = await readMigration();

  assert.match(sql, /create or replace function workspace\.current_user_can_workspace/i);
  assert.match(sql, /users\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /create policy performance_reviews_read[\s\S]*?to authenticated/i);
  assert.match(sql, /current_user_can_workspace\('performance', 'view'\)/i);
  assert.match(sql, /create policy api_keys_read[\s\S]*?to authenticated/i);
  assert.match(sql, /current_user_can_workspace\('ai-chat', 'view'\)/i);
  assert.match(sql, /create policy test_project_system_fields_write[\s\S]*?to authenticated/i);
  assert.match(sql, /current_user_can_workspace\('station-status', 'edit'\)/i);
});

test("performance review RLS limits manager rows to administrators or assigned supervisors", async () => {
  const sql = await readFile(performancePrivacyMigrationUrl, "utf8");

  assert.match(sql, /drop policy if exists performance_reviews_read/i);
  assert.match(
    sql,
    /performance_reviews_read[\s\S]*?current_user_can_workspace\('performance', 'view'\)[\s\S]*?employee_id = workspace\.current_system_user_id\(\)::text/i,
  );
  assert.match(
    sql,
    /performance_reviews_read[\s\S]*?current_user_can_workspace\('performance', 'edit'\)[\s\S]*?reviewer_name/i,
  );
  assert.match(sql, /lower\(coalesce\(current_user\.display_name/i);
  assert.match(sql, /lower\(coalesce\(current_user\.username/i);
  assert.match(sql, /create policy performance_reviews_update[\s\S]*?with check/i);
});

test("performance manager assignment is explicit and protects private fields", async () => {
  const sql = await readFile(performanceManagerMigrationUrl, "utf8");

  assert.match(sql, /current_user_is_performance_manager/i);
  assert.match(sql, /performanceManager/);
  assert.match(sql, /create trigger guard_performance_review_self_update/i);
  assert.match(sql, /new\.manager_feedback is distinct from old\.manager_feedback/i);
  assert.match(sql, /Only an assigned performance manager can edit manager assessment fields/i);
  assert.match(
    sql,
    /performance_reviews_read[\s\S]*?current_user_is_performance_manager\(\)[\s\S]*?current_user_can_workspace\('performance', 'edit'\)/i,
  );
});

test("metadata repair is additive, conflict safe, and leaves operational rows untouched", async () => {
  const sql = await readMigration();

  for (const key of ["bom_90", "ubuntu_version", "cuda_version", "include_in_dashboard"]) {
    assert.match(sql, new RegExp(`'${key}'`, "i"));
  }
  assert.match(sql, /on conflict \(project_id, field_key\) do nothing/i);
  assert.match(sql, /on conflict \(field_id, system_id\) do nothing/i);
  assert.doesNotMatch(sql, /update\s+workspace\.test_progress/i);
  assert.doesNotMatch(sql, /update\s+workspace\.issues/i);
  assert.doesNotMatch(sql, /update\s+workspace\.system_users\s+set\s+password_hash/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

test("admin account list explicitly selects only safe system-user columns", async () => {
  const source = await readFile(adminPanelUrl, "utf8");
  const systemUserLoad = source.match(
    /const loadSystemUsers[\s\S]*?if \(data\) setSystemUsers\(data\);/,
  )?.[0];

  assert.ok(systemUserLoad, "expected the system-user load query");
  assert.doesNotMatch(systemUserLoad, /\.select\(['"]\*['"]\)/);
  assert.match(systemUserLoad, /SYSTEM_USER_SAFE_COLUMNS/);
  assert.doesNotMatch(systemUserLoad, /password_hash/);
  assert.match(source, /const SYSTEM_USER_SAFE_COLUMNS = \[/);
  for (const column of [
    "id",
    "username",
    "display_name",
    "role",
    "status",
    "permissions",
    "auth_user_id",
    "last_seen_at",
  ]) {
    assert.match(source, new RegExp(`['"]${column}['"]`));
  }
});
