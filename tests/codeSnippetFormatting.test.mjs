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

test("large code snippets stay inside a viewport-bounded editor dialog", async () => {
  const editor = await read("../src/components/tools/CodeStorageManager.tsx");
  const dialogClassName = editor.match(/<DialogContent\s+className="([^"]+)"/)?.[1] || "";

  assert.match(
    editor,
    /<DialogContent[\s\S]*?className="!flex h-\[min\(920px,calc\(100dvh-1\.5rem\)\)\] w-\[calc\(100vw-1\.5rem\)\] max-w-5xl flex-col overflow-hidden p-0/,
  );
  assert.match(
    editor,
    /data-testid="code-editor-form"[\s\S]*?className="flex min-h-0 flex-1 flex-col"/,
  );
  assert.match(
    editor,
    /data-testid="code-editor-form-scroll"[\s\S]*?className="min-h-0 flex-1 space-y-4 overflow-y-auto/,
  );
  assert.match(
    editor,
    /data-testid="code-editor-viewport"[\s\S]*?className="grid h-\[clamp\(240px,42dvh,360px\)\] min-h-0 grid-cols-\[3\.25rem_minmax\(0,1fr\)\] overflow-hidden"/,
  );
  assert.match(
    editor,
    /data-testid="code-editor-line-numbers"[\s\S]*?className="m-0 h-full min-h-0 overflow-hidden/,
  );
  assert.match(
    editor,
    /id="code_content"[\s\S]*?className="h-full min-h-0 min-w-0 resize-none overflow-auto/,
  );
  assert.match(
    editor,
    /<DialogFooter className="shrink-0 border-t/,
  );
  assert.doesNotMatch(dialogClassName, /overflow-y-auto/);
  assert.doesNotMatch(editor, /resize-y/);
});
