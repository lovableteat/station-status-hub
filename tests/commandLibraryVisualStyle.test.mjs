import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commandLibrarySource = readFileSync(
  new URL("../src/components/tools/CommandLibrary.tsx", import.meta.url),
  "utf8",
);
const toolsManagementSource = readFileSync(
  new URL("../src/components/tools/ToolsManagement.tsx", import.meta.url),
  "utf8",
);

test("command library uses one cool accent palette with restrained semantic colors", () => {
  assert.match(commandLibrarySource, /集中搜尋、複製與維護常用操作指令/);
  assert.match(commandLibrarySource, /border-cyan-200\/30 bg-cyan-300/);
  assert.match(commandLibrarySource, /border-\[#294b63\] bg-\[#0b1b2d\]\/85/);
  assert.match(commandLibrarySource, /bg-\[linear-gradient\(145deg,#102337,#0b1929\)\]/);
  assert.doesNotMatch(commandLibrarySource, /bg-(?:blue|green|purple|orange|pink|yellow)-100/);
  assert.doesNotMatch(commandLibrarySource, /text-(?:blue|green|orange)-600/);
  assert.match(toolsManagementSource, /Terminal className="h-4 w-4 text-cyan-100"/);
});

test("command library keeps search, collapse, and command actions wired", () => {
  assert.match(commandLibrarySource, /onChange=\{\(e\) => setSearchTerm\(e\.target\.value\)\}/);
  assert.match(commandLibrarySource, /onOpenChange=\{\(\) => toggleCategory\(category\.id\)\}/);
  assert.match(commandLibrarySource, /onClick=\{\(\) => copyToClipboard\(command\.command\)\}/);
  assert.match(commandLibrarySource, /onClick=\{\(\) => setEditingCommand\(command\)\}/);
  assert.match(commandLibrarySource, /onClick=\{\(\) => handleDeleteCommand\(command\.id\)\}/);
});
