import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableSourceUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
  import.meta.url
);
const trackerSourceUrl = new URL(
  "../src/components/test-tracker/TestTracker.tsx",
  import.meta.url
);
const editorSourceUrl = new URL(
  "../src/components/test-tracker/SystemEditDialog.tsx",
  import.meta.url
);

test("machine id opens system data editor without replacing progress actions", async () => {
  const source = await readFile(tableSourceUrl, "utf8");
  const cellStart = source.indexOf('data-testid={`machine-cell-${system.id}`}');
  const serialStart = source.indexOf(
    '<div role="cell" className="truncate font-data',
    cellStart
  );
  const machineCell = source.slice(cellStart, serialStart);

  assert.match(source, /onEditSystemData: \(systemId: string\) => void/);
  assert.match(machineCell, /onClick=\{\(\) => onEditSystemData\(system\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => onSelectSystem\(system\.id\)\}/);
});

test("tracker owns one controlled system editor for the selected machine", async () => {
  const source = await readFile(trackerSourceUrl, "utf8");

  assert.match(source, /editingSystemId/);
  assert.match(source, /onEditSystemData=\{setEditingSystemId\}/);
  assert.match(source, /showTrigger=\{false\}/);
  assert.match(source, /open=\{Boolean\(editingSystem\)\}/);
});

test("system editor supports project address definitions and per-system values", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /test_project_address_fields/);
  assert.match(source, /test_system_address_values/);
  assert.match(source, /新增位址欄位/);
  assert.match(source, /同專案所有機台/);
});
