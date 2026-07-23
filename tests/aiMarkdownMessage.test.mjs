import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const parserSource = await readFile(
  new URL("../src/components/api-management/markdownMessageParser.ts", import.meta.url),
  "utf8",
);
const componentSource = await readFile(
  new URL("../src/components/api-management/MarkdownMessage.tsx", import.meta.url),
  "utf8",
);
const consoleSource = await readFile(
  new URL("../src/components/api-management/ApiChatConsole.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(parserSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const parserModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("AI markdown parser recognizes tables, dividers, lists and code fences", () => {
  const blocks = parserModule.parseMarkdownBlocks([
    "## Analysis",
    "",
    "| Item | Result |",
    "| --- | :---: |",
    "| J10 | PASS |",
    "",
    "---",
    "",
    "- Check cable",
    "- Re-run test",
    "",
    "```bash",
    "lspci -vt",
    "```",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), [
    "heading",
    "table",
    "divider",
    "list",
    "code",
  ]);
  assert.deepEqual(blocks[1].headers, ["Item", "Result"]);
  assert.deepEqual(blocks[1].rows, [["J10", "PASS"]]);
  assert.equal(blocks[4].language, "bash");
  assert.equal(blocks[4].code, "lspci -vt");
});

test("AI message component provides styled tables and copyable code blocks", () => {
  assert.match(componentSource, /data-ui="ai-markdown-message"/);
  assert.match(componentSource, /<table className=/);
  assert.match(componentSource, /<hr key=\{key\}/);
  assert.match(componentSource, /navigator\.clipboard\.writeText\(code\)/);
  assert.match(componentSource, /aria-label="複製程式碼"/);
});

test("assistant messages use markdown while user messages remain literal", () => {
  assert.match(consoleSource, /<MarkdownMessage key=\{`text-\$\{segmentIndex\}`\} content=\{segment\.text\} \/>/);
  assert.match(consoleSource, /整理型回答請使用 Markdown/);
  assert.match(consoleSource, /程式碼與指令必須放在標示語言的程式碼區塊/);
});

