import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableUrl = new URL("../src/components/test-tracker/TestProgressTable.tsx", import.meta.url);
const trackerUrl = new URL("../src/components/test-tracker/TestTracker.tsx", import.meta.url);
const dialogUrl = new URL("../src/components/test-tracker/SystemCloneDialog.tsx", import.meta.url);

test("each tracker row exposes sequential machine cloning", async () => {
  const [table, tracker] = await Promise.all([
    readFile(tableUrl, "utf8"),
    readFile(trackerUrl, "utf8"),
  ]);

  assert.match(table, /onCloneSystem: \(system: TrackerSystem\) => void/);
  assert.match(table, /onClick=\{\(\) => onCloneSystem\(system\)\}/);
  assert.match(table, />\s*其他功能\s*</);
  assert.match(table, />\s*複製為連號機台\s*</);
  assert.match(tracker, /<SystemCloneDialog/);
  assert.match(tracker, /sourceSystem=\{cloneSourceSystem\}/);
});

test("machine actions use one compact menu and separate destructive data controls", async () => {
  const table = await readFile(tableUrl, "utf8");

  assert.match(table, /className="w-64 overflow-hidden rounded-xl/);
  assert.match(table, />\s*機台操作\s*</);
  assert.match(table, />\s*資料管理\s*</);
  assert.match(table, /triggerVariant="menu"/);
  assert.match(table, /variant="menu"/);
  assert.match(table, />\s*複製為連號機台\s*</);
});

test("clone dialog previews the series and invokes the clone service", async () => {
  const dialog = await readFile(dialogUrl, "utf8");

  assert.match(dialog, /buildSystemSeriesNames/);
  assert.match(dialog, /cloneSystemSeries\(\{/);
  assert.match(dialog, /名稱預覽/);
  assert.match(dialog, /起始號碼/);
  assert.match(dialog, /建立數量/);
  assert.match(dialog, /複製進度並建立/);
});
