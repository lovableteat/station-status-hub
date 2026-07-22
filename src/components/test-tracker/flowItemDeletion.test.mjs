import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migrationSql, flowEditorSource] = await Promise.all([
  readFile(
    new URL(
      "../../../supabase/migrations/20260722160000_cascade_test_progress_item_delete.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("./FlowInfo.tsx", import.meta.url), "utf8"),
]);

test("deleting a flow item cascades only its dependent progress rows", () => {
  assert.match(migrationSql, /drop constraint if exists test_progress_item_id_fkey/i);
  assert.match(migrationSql, /foreign key \(item_id\)[\s\S]*references public\.test_flow_items\(id\)[\s\S]*on delete cascade/i);
  assert.match(migrationSql, /idx_test_progress_item_id/i);
});

test("flow item deletion is confirmed and scoped to the active draft", () => {
  assert.match(flowEditorSource, /刪除測項「\{selectedItem\.item_name\}」/);
  assert.match(flowEditorSource, /所有機台在此測項的進度紀錄會一併刪除/);
  assert.match(flowEditorSource, /from\("test_progress"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("item_id", item\.id\)/);
  assert.match(flowEditorSource, /from\("test_progress"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("item_id", item\.id\)/);
  assert.match(flowEditorSource, /from\("test_progress"\)\.insert\(progressRows\)/);
  assert.match(flowEditorSource, /\.eq\("project_id", activeProjectId\)/);
  assert.match(flowEditorSource, /\.eq\("flow_version_id", editingVersionId\)/);
  assert.match(flowEditorSource, /setSelectedItemId\(null\)/);
});
