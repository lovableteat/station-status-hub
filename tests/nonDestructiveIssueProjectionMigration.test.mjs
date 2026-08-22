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
