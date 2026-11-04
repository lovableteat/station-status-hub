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

test("shared prompt creator only uses a valid database UUID", () => {
  assert.equal(
    helpers.getSharedPromptCreatorId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(helpers.getSharedPromptCreatorId("admin"), null);
  assert.equal(helpers.getSharedPromptCreatorId(undefined), null);
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

test("mixed rich clipboard content keeps images between the surrounding paragraphs", () => {
  const composition = helpers.composeClipboardContent(
    '<p>第一段說明</p><p><img src="data:image/png;base64,AAAA"></p><p>第二段說明</p>',
    "第一段說明\n第二段說明",
    1,
  );

  assert.equal(composition, "第一段說明\n[[attachment:0]]\n第二段說明");
  assert.deepEqual(
    helpers.splitContentByAttachmentMarkers(composition),
    [
      { kind: "text", text: "第一段說明\n" },
      { attachmentIndex: 0, kind: "attachment" },
      { kind: "text", text: "\n第二段說明" },
    ],
  );
});

test("plain clipboard content stays unchanged when no image is present", () => {
  assert.equal(helpers.composeClipboardContent("<p>只有文字</p>", "只有文字", 0), "只有文字");
});

test('internal image positions never appear in editable text',()=>{
  assert.equal(helpers.stripAttachmentMarkers('[[attachment:0]]'),'');
  assert.equal(helpers.stripAttachmentMarkers('前文\n[[attachment:0]]\n後文'),'前文\n\n後文');
  assert.equal(helpers.composerOffsetToContentOffset('前文[[attachment:0]]後文',2),18);
  assert.equal(helpers.composerOffsetToContentOffset('[[attachment:0]][[attachment:1]]',0),32);
});

test('editing visible text retains hidden images and their surrounding paragraph order',()=>{
  const current='前文\n[[attachment:0]]\n後文';
  const edited=helpers.updateComposerText(helpers.updateComposerText(current,'新增前文\n\n後文'),'新增前文\n\n後文補充');
  assert.equal(helpers.stripAttachmentMarkers(edited),'新增前文\n\n後文補充');
  assert.equal(edited,'新增前文\n[[attachment:0]]\n後文補充');
  assert.equal(helpers.updateComposerText('[[attachment:0]]','這張圖說明'),'[[attachment:0]]這張圖說明');
  assert.equal(helpers.updateComposerText(current,''),'[[attachment:0]]');
  assert.equal(helpers.updateComposerText('A[[attachment:0]]B[[attachment:1]]C','AC'),'A[[attachment:0]][[attachment:1]]C');
});
