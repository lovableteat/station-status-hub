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

test("large code snippets cannot stretch the line-number grid beyond the editor viewport", async () => {
  const editor = await read("../src/components/tools/CodeStorageManager.tsx");

  assert.match(
    editor,
    /data-testid="code-editor-viewport"[\s\S]*?className="grid h-\[336px\] min-h-0 grid-cols-\[3\.25rem_minmax\(0,1fr\)\] overflow-hidden"/,
  );
  assert.match(
    editor,
    /data-testid="code-editor-line-numbers"[\s\S]*?className="m-0 h-full min-h-0 overflow-hidden/,
  );
  assert.match(
    editor,
    /id="code_content"[\s\S]*?className="h-full min-h-0 min-w-0 resize-none overflow-auto/,
  );
  assert.doesNotMatch(editor, /max-h-\[336px\]/);
  assert.doesNotMatch(editor, /resize-y/);
});
