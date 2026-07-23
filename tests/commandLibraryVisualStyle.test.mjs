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

test("command library uses one focused master-detail workspace", () => {
  assert.match(commandLibrarySource, /選取指令後可直接複製或編輯/);
  assert.match(commandLibrarySource, /border-\[#2a526f\] bg-\[#071522\]/);
  assert.match(commandLibrarySource, /border-amber-200\/60 bg-amber-300/);
  assert.match(commandLibrarySource, /指令預覽/);
  assert.doesNotMatch(commandLibrarySource, /bg-(?:blue|green|purple|orange|pink|yellow)-100/);
  assert.doesNotMatch(commandLibrarySource, /text-(?:blue|green|orange)-600/);
  assert.match(toolsManagementSource, /<TabsContent value="commands"/);
});

test("command library keeps search, selection, and command actions wired", () => {
  assert.match(commandLibrarySource, /setSearchTerm\(event\.target\.value\.slice\(0, 100\)\)/);
  assert.match(commandLibrarySource, /onClick=\{\(\) => setSelectedCommand\(command\)\}/);
  assert.match(commandLibrarySource, /copyToClipboard\(activeCommand\.command\)/);
  assert.match(commandLibrarySource, /openEditor\(activeCommand\)/);
  assert.match(commandLibrarySource, /handleDelete\(activeCommand\.id\)/);
});
