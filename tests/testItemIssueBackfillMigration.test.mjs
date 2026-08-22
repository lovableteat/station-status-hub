import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const migrationPath = new URL(
  "../supabase/migrations/20260822200000_backfill_unresolved_issue_progress.sql",
  import.meta.url,
);

test("existing linked unresolved issues are backfilled to Error progress", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");

  assert.match(migration, /from\s+workspace\.issues/i);
  assert.match(migration, /status\s+in\s*\(\s*'open'\s*,\s*'in_progress'\s*\)/i);
  assert.match(migration, /on\s+conflict\s*\(\s*system_id\s*,\s*station_id\s*,\s*item_id\s*\)\s+do\s+update/i);
  assert.match(migration, /status\s*=\s*'Error'/i);
  assert.match(migration, /progress_percent\s*=\s*0/i);
  assert.match(migration, /completed_at\s*=\s*null/i);
  assert.match(migration, /null::pg_catalog\.timestamptz/i);
});
