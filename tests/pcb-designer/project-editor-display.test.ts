import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const railSource = await read("src/components/pcb-designer/PcbLeftRail.tsx");
const editorCssSource = await read("src/components/pcb-designer/pcb-designer.css");

test("shows the current content editor above the project list", () => {
  assert.match(railSource, /useUser\(\)/);
  assert.match(railSource, /目前內容編輯者/);
  assert.match(railSource, /editorName/);
  assert.match(railSource, /workspace\.hasUnsavedChanges/);
  assert.match(railSource, /pcb-project-editor-strip/);
});

test("keeps project cards structured with status and a dedicated action row", () => {
  assert.match(railSource, /projectStatusLabels/);
  assert.match(railSource, /pcb-project-card-heading/);
  assert.match(railSource, /pcb-project-card-meta/);
  assert.match(railSource, /pcb-project-actions/);
  assert.match(editorCssSource, /\.pcb-project-editor-strip\s*\{/);
  assert.match(editorCssSource, /\.pcb-project-current-badge,\s*\.pcb-project-status\s*\{/);
  assert.match(editorCssSource, /\.pcb-project-actions\s*\{/);
});
