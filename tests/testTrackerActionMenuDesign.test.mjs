import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
  import.meta.url
);
const completeUrl = new URL(
  "../src/components/test-tracker/SystemCompleteButton.tsx",
  import.meta.url
);
const editUrl = new URL(
  "../src/components/test-tracker/SystemEditDialog.tsx",
  import.meta.url
);
const resetUrl = new URL(
  "../src/components/test-tracker/SystemResetDialog.tsx",
  import.meta.url
);
const managerUrl = new URL(
  "../src/components/test-tracker/SystemManager.tsx",
  import.meta.url
);

test("machine action popover uses a clear grouped command menu", async () => {
  const [table, complete, edit, reset, manager] = await Promise.all([
    readFile(tableUrl, "utf8"),
    readFile(completeUrl, "utf8"),
    readFile(editUrl, "utf8"),
    readFile(resetUrl, "utf8"),
    readFile(managerUrl, "utf8"),
  ]);

  assert.match(table, /data-ui="tracker-action-menu"/);
  assert.match(table, />\s*機台操作\s*</);
  assert.match(table, /\{system\.system_name\}/);
  assert.match(table, /data-ui="tracker-action-menu-primary"/);
  assert.match(table, /data-ui="tracker-action-menu-danger"/);
  assert.match(table, /<SystemCompleteButton[\s\S]*?variant="menu"/);
  assert.match(table, /<SystemEditDialog[\s\S]*?variant="menu"/);
  assert.match(table, /<SystemResetDialog[\s\S]*?variant="menu"/);
  assert.match(table, /<SystemDeleteButton[\s\S]*?variant="menu"/);

  assert.match(complete, /variant\?: "default" \| "menu"/);
  assert.match(complete, /"完成機台"/);
  assert.match(edit, /variant\?: "button" \| "icon" \| "menu"/);
  assert.match(edit, />\s*編輯機台資料\s*</);
  assert.match(reset, /variant\?: "default" \| "menu"/);
  assert.match(reset, /"重置進度"/);
  assert.match(manager, /variant\?: "default" \| "menu"/);
});
