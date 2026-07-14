import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/api-management/apiChatPromptHelpers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helpers = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const prompts = [
  { id: "1", title: "每日異常摘要", content: "整理今日異常並依嚴重度排序" },
  { id: "2", title: "附件差異比對", content: "比較 Excel 與 PDF 的差異" },
];

test("slash command only activates while the composer contains a slash query", () => {
  assert.equal(helpers.getSlashPromptQuery("/"), "");
  assert.equal(helpers.getSlashPromptQuery("  /附件"), "附件");
  assert.equal(helpers.getSlashPromptQuery("一般問題"), null);
  assert.equal(helpers.getSlashPromptQuery("第一行\n/附件"), null);
});

test("shared prompts are searched by title and content", () => {
  assert.deepEqual(
    helpers.filterSharedPrompts(prompts, "excel").map((prompt) => prompt.id),
    ["2"],
  );
  assert.deepEqual(
    helpers.filterSharedPrompts(prompts, "摘要").map((prompt) => prompt.id),
    ["1"],
  );
});

test("mixed clipboard text is inserted at the current selection", () => {
  assert.equal(
    helpers.insertClipboardText("前段舊文字後段", "新文字", 2, 5),
    "前段新文字後段",
  );
});

test("clipboard helpers collect direct image files and embedded data images", () => {
  const image = { name: "clipboard.png", type: "image/png" };
  const items = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => image },
  ];

  assert.deepEqual(helpers.getClipboardImageFiles(items), [image]);
  assert.deepEqual(
    helpers.extractEmbeddedImageDataUrls(
      '<p>文字</p><img src="data:image/png;base64,AAAA"><img src="https://example.com/a.png">',
    ),
    ["data:image/png;base64,AAAA"],
  );
  assert.deepEqual(
    helpers.extractEmbeddedImageSources(
      '<img src="data:image/png;base64,AAAA"><img src="https://example.com/a.png">',
    ),
    ["data:image/png;base64,AAAA", "https://example.com/a.png"],
  );
});
