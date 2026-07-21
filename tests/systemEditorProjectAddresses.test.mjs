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

test("project address definitions can be renamed without replacing their stored values", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /handleUpdateAddressField/);
  assert.match(source, /\.from\("test_project_address_fields"\)[\s\S]*?\.update\(\{/);
  assert.match(source, /aria-label=\{`編輯 \$\{field\.label\} 位址欄位`\}/);
  assert.match(source, /位址欄位已更新/);
});

test("adding a project address persists the current machine value atomically", async () => {
  const source = await readFile(editorSourceUrl, "utf8");
  const addHandlerStart = source.indexOf("const handleAddAddressField");
  const editHandlerStart = source.indexOf("const beginAddressFieldEdit", addHandlerStart);
  const addHandler = source.slice(addHandlerStart, editHandlerStart);

  assert.match(addHandler, /newAddressValue/);
  assert.match(addHandler, /\.from\("test_system_address_values"\)[\s\S]*?\.upsert\(/);
  assert.match(addHandler, /\.from\("test_project_address_fields"\)[\s\S]*?\.delete\(\)/);
  assert.match(addHandler, /error\?\.message|valueError\.message/);
});

test("system editor presents a clear workspace and explicit full save action", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /data-testid="system-editor-workspace"/);
  assert.match(source, /data-testid="network-address-manager"/);
  assert.match(source, /新增至專案/);
  assert.match(source, /儲存全部變更/);
});
