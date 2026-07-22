import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("tools page exposes each asset type as a first-level workspace", async () => {
  const page = await read("../src/components/tools/ToolsManagement.tsx");

  assert.match(page, /data-testid="asset-workspace-navigation"/);
  assert.match(page, /value="tools"/);
  assert.match(page, /value="code"/);
  assert.match(page, /value="commands"/);
  assert.match(page, /value="files"/);
  assert.doesNotMatch(page, /command-center/);
});

test("code library uses a persistent list and preview workspace", async () => {
  const editor = await read("../src/components/tools/CodeStorageManager.tsx");

  assert.match(editor, /data-testid="code-library-workspace"/);
  assert.match(editor, /程式碼預覽/);
  assert.match(editor, /選取程式碼後可直接預覽或編輯/);
  assert.doesNotMatch(editor, /@\/components\/ui\/table/);
  assert.doesNotMatch(editor, /isViewDialogOpen/);
});

test("command library uses a persistent list and preview workspace", async () => {
  const library = await read("../src/components/tools/CommandLibrary.tsx");

  assert.match(library, /data-testid="command-library-workspace"/);
  assert.match(library, /指令預覽/);
  assert.match(library, /選取指令後可直接複製或編輯/);
  assert.doesNotMatch(library, /統計資訊/);
  assert.doesNotMatch(library, /expandedCategories/);
});
