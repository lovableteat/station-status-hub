import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
  import.meta.url
);

test("tracker table exposes a persistent palette control in the actions header", async () => {
  const source = await readFile(tableUrl, "utf8");

  assert.match(source, /TRACKER_TABLE_PALETTE_STORAGE_KEY/);
  assert.match(source, /aria-label="表格配色"/);
  assert.match(source, />\s*表格配色\s*</);
  assert.match(source, /window\.localStorage\.setItem\(TRACKER_TABLE_PALETTE_STORAGE_KEY/);
  assert.match(source, /深海藍/);
  assert.match(source, /石墨灰/);
  assert.match(source, /青綠/);
  assert.match(source, /高對比/);
});

test("tracker palette controls all main table surfaces", async () => {
  const source = await readFile(tableUrl, "utf8");

  assert.match(source, /--tracker-table-surface/);
  assert.match(source, /--tracker-table-header/);
  assert.match(source, /--tracker-row-even/);
  assert.match(source, /--tracker-row-odd/);
  assert.match(source, /--tracker-row-active/);
  assert.match(source, /--tracker-row-hover/);
});
