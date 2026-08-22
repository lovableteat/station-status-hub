import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260822213000_restore_non_destructive_issue_projection.sql",
    import.meta.url,
  ),
  "utf8",
).catch(() => "");
const guardMigration = await readFile(
  new URL(
    "../supabase/migrations/20260822214500_enforce_completion_guard_and_summary_scope.sql",
    import.meta.url,
  ),
  "utf8",
).catch(() => "");

test("issue projection no longer mutates stored test progress", () => {
  assert.match(
    migration,
    /drop\s+trigger\s+if\s+exists\s+sync_unresolved_issue_to_test_progress\s+on\s+workspace\.issues/i,
  );
  assert.match(
    migration,
    /drop\s+function\s+if\s+exists\s+workspace\.sync_unresolved_issue_to_test_progress\s*\(\s*\)/i,
  );
  assert.doesNotMatch(migration, /create\s+trigger\s+sync_unresolved_issue_to_test_progress/i);
});

test("repair restores only audit-proven Done to Error backfill changes", () => {
  assert.match(migration, /from\s+workspace\.test_progress_audit\s+as\s+audit/i);
  assert.match(migration, /audit\.old_values\s*->>\s*'status'\s*=\s*'Done'/i);
  assert.match(migration, /audit\.new_values\s*->>\s*'status'\s*=\s*'Error'/i);
  assert.match(migration, /progress\.updated_at\s*=\s*audit\.created_at/i);
  assert.match(migration, /status\s*=\s*changes\.old_status/i);
  assert.match(migration, /progress_percent\s*=\s*100/i);
  assert.match(migration, /completed_at\s*=\s*changes\.old_completed_at/i);
  assert.match(migration, /audit\.created_at\s*=\s*'2026-08-22 05:20:24\.155319\+00'/i);
  assert.doesNotMatch(migration, /System01|MD-49rack/i);
});

test("system summary recalculation is scoped to the system project and flow version", () => {
  assert.match(
    migration,
    /create\s+or\s+replace\s+function\s+public\.update_system_completion_status\s*\(\s*\)/i,
  );
  assert.match(migration, /from\s+workspace\.test_systems[\s\S]*where\s+systems\.id\s*=\s*affected_system_id/i);
  assert.match(migration, /stations\.project_id\s*=\s*system_project_id/i);
  assert.match(migration, /stations\.flow_version_id\s+is\s+not\s+distinct\s+from\s+system_flow_version_id/i);
  assert.match(migration, /items\.project_id\s*=\s*system_project_id/i);
  assert.match(migration, /items\.flow_version_id\s+is\s+not\s+distinct\s+from\s+system_flow_version_id/i);
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/i);
});

test("database rejects every new Done transition while an issue is unresolved", () => {
  assert.match(guardMigration, /create\s+or\s+replace\s+function\s+workspace\.guard_test_progress_completion/i);
  assert.match(guardMigration, /new\.status\s*=\s*'Done'/i);
  assert.match(guardMigration, /issues\.status\s+in\s*\('open',\s*'in_progress'\)/i);
  assert.match(guardMigration, /message\s*=\s*'尚有問題未被解決'/i);
  assert.match(guardMigration, /before\s+insert\s+or\s+update\s+of\s+status[\s\S]*on\s+workspace\.test_progress/i);
});

test("summary start time is scoped through current-flow items", () => {
  assert.match(guardMigration, /create\s+or\s+replace\s+function\s+public\.update_system_completion_status/i);
  assert.match(guardMigration, /join\s+workspace\.test_flow_items\s+as\s+items/i);
  assert.match(guardMigration, /items\.flow_version_id\s+is\s+not\s+distinct\s+from\s+system_flow_version_id/i);
  assert.match(guardMigration, /progress\.item_id\s*=\s*items\.id/i);
});
