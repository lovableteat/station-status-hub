import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const railSource = await read("src/components/pcb-designer/PcbLeftRail.tsx");
const editorCssSource = await read("src/components/pcb-designer/pcb-designer.css");

test("shows the open board once, as the highlighted row of its family", () => {
  assert.doesNotMatch(railSource, /useUser\(\)/);
  assert.doesNotMatch(railSource, /pcb-current-project-card/);
  assert.match(railSource, /aria-current=\{lead\.id === activeId \? "true" : undefined\}/);
  assert.match(railSource, /aria-current=\{project\.id === activeId \? "true" : undefined\}/);
  assert.match(editorCssSource, /\.pcb-board-row\.is-current\s*\{/);
  assert.doesNotMatch(editorCssSource, /\.pcb-current-project-card\s*\{/);
});

test("stamps the open board with the account that explicitly saved it", () => {
  assert.match(railSource, /const activeEditorName/);
  assert.match(railSource, /workspace\.lastSavedProjectId === activeId/);
  assert.match(railSource, /workspace\.lastSavedEditor \?\? workspace\.activeProject\.lastEditedBy/);
  assert.match(railSource, /最後編輯者：\$\{editor\}/);
});

test("keeps each board on one compact row and moves low-frequency actions into one menu", () => {
  assert.match(railSource, /projectStatusLabels/);
  assert.match(railSource, /pcb-project-list-heading/);
  assert.match(railSource, /pcb-board-row-title/);
  assert.match(railSource, /pcb-board-row-meta/);
  assert.match(railSource, /DropdownMenu/);
  assert.match(railSource, /MoreHorizontal/);
  assert.match(railSource, /建立新版/);
  assert.match(railSource, /複製成新板子/);
  assert.match(editorCssSource, /\.pcb-project-list-heading\s*\{/);
  assert.match(editorCssSource, /\.pcb-board-row\s*\{/);
});
