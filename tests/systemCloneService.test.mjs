import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL(
  "../src/components/test-tracker/cloneSystemSeries.ts",
  import.meta.url
);

test("bulk clone copies safe machine metadata and L10 progress", async () => {
  const source = await readFile(serviceUrl, "utf8");

  assert.match(source, /from\("test_systems"\)[\s\S]*?\.eq\("id", sourceSystemId\)/);
  assert.match(source, /serial_number: null/);
  assert.match(source, /from\("test_progress"\)[\s\S]*?\.eq\("system_id", sourceSystemId\)/);
  assert.match(source, /assigned_to: progressRow\.assigned_to/);
  assert.match(source, /notes: progressRow\.notes/);
  assert.match(source, /progress_percent: progressRow\.progress_percent/);
  assert.match(source, /from\("dashboard_item_exclusions"\)/);
  assert.doesNotMatch(source, /actual_hours: progressRow\.actual_hours/);
  assert.doesNotMatch(source, /bmc_address: sourceSystem\.bmc_address/);
});

test("bulk clone rolls back every created machine after a child copy failure", async () => {
  const source = await readFile(serviceUrl, "utf8");

  assert.match(source, /catch \(error\)[\s\S]*?rollbackCreatedSystems\(createdSystems\)/);
  assert.match(source, /supabase\.rpc\("delete_test_system", \{ p_system_id: system\.id \}\)/);
});
