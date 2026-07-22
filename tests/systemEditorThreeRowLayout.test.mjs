import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorSourceUrl = new URL(
  "../src/components/test-tracker/SystemEditDialog.tsx",
  import.meta.url
);

test("system editor uses three full-width information rows", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /data-testid="system-editor-three-row-layout"/);
  assert.match(source, /data-testid="system-editor-basic-row"/);
  assert.match(source, /data-testid="system-editor-address-row"/);
  assert.match(source, /data-testid="system-editor-software-row"/);
  assert.doesNotMatch(
    source,
    /data-testid="system-editor-three-row-layout"[\s\S]{0,180}lg:grid-cols-/
  );
});

test("network addresses scale to three columns without changing persistence", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /data-testid="system-editor-address-grid"/);
  assert.match(
    source,
    /data-testid="system-editor-address-grid"[\s\S]{0,220}2xl:grid-cols-3/
  );
  assert.match(source, /test_project_address_fields/);
  assert.match(source, /test_system_address_values/);
});

test("project-shared address labels explain shared definitions and private values", async () => {
  const source = await readFile(editorSourceUrl, "utf8");

  assert.match(source, /aria-label="什麼是專案共用位址欄位？"/);
  assert.match(
    source,
    /欄位名稱與類型會套用到同一專案的所有機台，但每台機台會各自保存自己的位址值，不會互相覆蓋。/
  );
  assert.match(source, /<TooltipContent/);
});
