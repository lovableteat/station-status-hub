import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("code snippets preserve pasted line breaks and indentation", async () => {
  const editor = await read("../src/components/tools/CodeStorageManager.tsx");
  const assetPreview = await read("../src/components/tools/ToolsManagement.tsx");

  assert.match(editor, /wrap="off"/);
  assert.match(editor, /spellCheck=\{false\}/);
  assert.match(editor, /onKeyDown=\{handleCodeEditorKeyDown\}/);
  assert.match(editor, /保留換行與縮排/);
  assert.match(editor, /\{codeLineCount\} 行/);
  assert.match(editor, /whitespace-pre/);
  assert.doesNotMatch(editor, /whitespace-pre-wrap/);

  assert.match(assetPreview, /whitespace-pre/);
  assert.doesNotMatch(assetPreview, /whitespace-pre-wrap/);
});
