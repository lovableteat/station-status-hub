import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260715110000_atomic_flow_reordering.sql",
  import.meta.url,
);

test("flow reordering migration keeps station and item changes atomic", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /reorder_test_flow_stations/i);
  assert.match(sql, /reorder_test_flow_items/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /station_order\s*=\s*station_order\s*\+\s*1000000/i);
  assert.match(sql, /item_order\s*=\s*item_order\s*\+\s*1000000/i);
  assert.match(sql, /count\(distinct/i);
});
