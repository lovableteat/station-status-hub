import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const railSource = await read("src/components/pcb-designer/PcbLeftRail.tsx");
const editorCssSource = await read("src/components/pcb-designer/pcb-designer.css");

test("shows the active board once with its persisted editor state", () => {
  assert.doesNotMatch(railSource, /useUser\(\)/);
  assert.match(railSource, /最後編輯者/);
  assert.match(railSource, /lastEditedBy/);
  assert.match(railSource, /lastSavedEditor/);
  assert.match(railSource, /lastSavedProjectId/);
  assert.match(railSource, /workspace\.hasUnsavedChanges/);
  assert.match(railSource, /pcb-current-project-card/);
  assert.match(railSource, /pcb-project-editor-state/);
  assert.match(railSource, /projects\.filter\(\(project\) => project\.id !== workspace\.activeProject\.id\)/);
});

test("stamps the active board with the account that explicitly saved it", () => {
  assert.match(railSource, /const activeEditorName/);
  assert.match(railSource, /workspace\.lastSavedProjectId === workspace\.activeProject\.id/);
  assert.match(railSource, /workspace\.lastSavedEditor \?\? workspace\.activeProject\.lastEditedBy/);
  assert.match(editorCssSource, /\.pcb-current-project-card\s*\{/);
});

test("keeps secondary boards compact and moves low-frequency actions into one menu", () => {
  assert.match(railSource, /projectStatusLabels/);
  assert.match(railSource, /pcb-project-list-heading/);
  assert.match(railSource, /pcb-project-compact-heading/);
  assert.match(railSource, /pcb-project-compact-meta/);
  assert.match(railSource, /DropdownMenu/);
  assert.match(railSource, /MoreHorizontal/);
  assert.match(editorCssSource, /\.pcb-project-list-heading\s*\{/);
  assert.match(editorCssSource, /\.pcb-project-compact-item\s*\{/);
  assert.match(editorCssSource, /\.pcb-current-project-actions\s*\{/);
});
