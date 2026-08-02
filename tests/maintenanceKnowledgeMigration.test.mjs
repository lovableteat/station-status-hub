import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260803120000_add_maintenance_knowledge_search.sql",
  import.meta.url,
);

test("maintenance knowledge search is authenticated and permission checked", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create extension if not exists pg_trgm/i);
  assert.match(sql, /create or replace function public\.search_maintenance_knowledge/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /public\.current_system_user_id\(\)/i);
  assert.match(sql, /workspaceAccess,station-status/i);
  assert.match(sql, /workspaceAccess,ai-chat/i);
  assert.match(sql, /revoke all on function public\.search_maintenance_knowledge/i);
  assert.match(sql, /grant execute on function public\.search_maintenance_knowledge[\s\S]*to authenticated/i);
});

test("maintenance knowledge search validates scope and result size", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /char_length\(v_query\) > 500/i);
  assert.match(sql, /cardinality\(p_project_ids\) > 50/i);
  assert.match(sql, /greatest\(1, least\(coalesce\(p_limit, 16\), 20\)\)/i);
  assert.match(sql, /projects\.id = any\(p_project_ids\)/i);
  assert.match(sql, /projects\.is_archived = false/i);
});

test("maintenance knowledge search composes every supported live source", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const sourceType of ["project", "machine", "station", "progress", "issue", "asset"]) {
    assert.match(sql, new RegExp(`'${sourceType}'::text\\s+as source_type`, "i"));
  }

  for (const table of [
    "test_projects",
    "test_systems",
    "test_flow_stations",
    "test_flow_items",
    "station_contents",
    "test_progress",
    "issues",
    "test_project_tool_assignments",
    "test_project_code_assignments",
    "test_project_command_assignments",
  ]) {
    assert.match(sql, new RegExp(`public\\.${table}`, "i"));
  }
});

test("maintenance ranking supports machine codes, Chinese fuzzy matches, and routes", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /lower\(chunks\.exact_key\) = v_query_lower/i);
  assert.match(sql, /position\(v_query_lower in lower\(chunks\.search_text\)\)/i);
  assert.match(sql, /extensions\.similarity/i);
  assert.match(sql, /regexp_split_to_table/i);
  assert.match(sql, /jsonb_build_object\('system'/i);
  assert.match(sql, /jsonb_build_object\('station'/i);
  assert.match(sql, /jsonb_build_object\('openIssue'/i);
  assert.match(sql, /jsonb_build_object\('assetView'/i);
});
