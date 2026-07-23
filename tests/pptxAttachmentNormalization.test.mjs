import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const helperSource = await readFile(
  new URL("../src/components/api-management/pptxAttachment.ts", import.meta.url),
  "utf8",
);
const consoleSource = await readFile(
  new URL("../src/components/api-management/ApiChatConsole.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("PowerPoint slide XML keeps page text and decodes entities", () => {
  const xml = [
    "<p:sld>",
    "<a:p><a:r><a:t>J10 &amp; </a:t></a:r><a:r><a:t>diagnostic</a:t></a:r></a:p>",
    "<a:p><a:r><a:t>Result: PASS</a:t></a:r></a:p>",
    "</p:sld>",
  ].join("");

  assert.equal(
    helperModule.extractPptxSlideText(xml),
    "J10 & diagnostic\nResult: PASS",
  );
});

test("PPTX detection accepts extension or Office MIME type", () => {
  assert.equal(helperModule.isPptxFile({ name: "report.pptx", type: "" }), true);
  assert.equal(
    helperModule.isPptxFile({
      name: "report",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    true,
  );
  assert.equal(helperModule.isPptxFile({ name: "legacy.ppt", type: "" }), false);
});

test("chat upload converts PPTX to supported text and keeps embedded images", () => {
  assert.match(consoleSource, /if \(isPptxFile\(file\)\)/);
  assert.match(consoleSource, /mimeType: "text\/plain"/);
  assert.match(consoleSource, /supplementalImages: extracted\.images/);
  assert.match(consoleSource, /attachment\.supplementalImages \?\? \[\]/);
  assert.doesNotMatch(
    consoleSource,
    /accept="[^"]*\.ppt,/,
  );
});

