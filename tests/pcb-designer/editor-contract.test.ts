import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

const canvasSource = await read("src/components/pcb-designer/PcbCanvas.tsx");
const workspaceSource = await read("src/components/pcb-designer/PcbDesignerWorkspace.tsx");
const hookSource = await read("src/components/pcb-designer/hooks/usePcbWorkspace.ts");
const editorHookSource = await read("src/components/pcb-designer/hooks/usePcbEditorActions.ts");
const combinedHookSource = `${hookSource}\n${editorHookSource}`;
const railSource = await read("src/components/pcb-designer/PcbLeftRail.tsx");
const inspectorSource = await read("src/components/pcb-designer/PcbInspector.tsx");
const toolbarSource = await read("src/components/pcb-designer/PcbToolbar.tsx");
const pngExportSource = await read("src/components/pcb-designer/core/pngExport.ts");
const editorCssSource = await read("src/components/pcb-designer/pcb-designer.css");
const persistenceSource = await read("src/components/pcb-designer/hooks/usePcbPersistence.ts");
const presenceSource = await read("src/components/pcb-designer/hooks/usePcbProjectPresence.ts");
const collaboratorsSource = await read("src/components/pcb-designer/PcbCollaborators.tsx");
const canvas3dSource = await read("src/components/pcb-designer/Pcb3DCanvas.tsx");
const runtimeBoundarySource = await read("src/components/common/AppRuntimeBoundary.tsx");

test("exposes an interactive SVG canvas with pointer, wheel, and drop contracts", () => {
  assert.match(canvasSource, /<svg[\s\S]*data-pcb-canvas/);
  assert.match(canvasSource, /onPointerDown/);
  assert.match(canvasSource, /onPointerMove/);
  assert.match(canvasSource, /onPointerUp/);
  assert.match(canvasSource, /onWheel/);
  assert.match(canvasSource, /onDrop/);
  assert.match(canvasSource, /clientPointToBoard/);
  assert.match(canvasSource, /setPointerCapture/);
  assert.match(canvasSource, /event\.button === 1[\s\S]{0,180}beginPan/);
  assert.match(canvasSource, /snapPoint/);
  assert.match(canvasSource, /workspace\.tool === ["']measure["']\s*\?\s*["']measurement["']/);
});

test("renders PCB layers in the required stable order", () => {
  assert.match(
    canvasSource,
    /data-layer=["']grid["'][\s\S]*data-layer=["']board["'][\s\S]*data-layer=["']keepouts["'][\s\S]*data-layer=["']measurements["'][\s\S]*data-layer=["']components["'][\s\S]*data-layer=["']selection-handles["'][\s\S]*data-layer=["']tool-draft["'][\s\S]*data-layer=["']drc-overlay["']/,
  );
});

test("makes library cards draggable and routes click and drop through one placement action", () => {
  assert.match(railSource, /draggable=\{workspace\.canMutate\}/);
  assert.match(railSource, /dataTransfer\.setData/);
  assert.match(railSource, /onStartPlacement\(component\.id\)/);
  assert.match(canvasSource, /workspace\.placeLibraryComponent/);
  assert.match(canvasSource, /data-placement-valid/);
  assert.match(canvasSource, /exact:\s*true/);
});

test("placement actions reject document-locked mutations before reporting success", () => {
  assert.match(
    combinedHookSource,
    /placeLibraryComponent[\s\S]{0,450}!state\.canEdit \|\| state\.documentLocked/,
  );
  assert.match(
    combinedHookSource,
    /autoPlacePending[\s\S]{0,300}!state\.canEdit \|\| state\.documentLocked/,
  );
});

test("reports placement search limits truthfully and batches BOM auto-placement", () => {
  assert.match(editorHookSource, /MAX_AUTO_PLACE_ITEMS/);
  assert.match(editorHookSource, /MAX_AUTO_PLACE_COLLISION_TESTS/);
  assert.match(editorHookSource, /pendingPlacements\.slice\(0,\s*MAX_AUTO_PLACE_ITEMS\)/);
  assert.match(editorHookSource, /batch\.length \* worstCaseObstacles/);
  assert.match(editorHookSource, /deferred/);
  assert.match(editorHookSource, /search-limit/);
  assert.match(railSource, /result\.deferred/);
});

test("keeps all four tools mutually exclusive and accessible", () => {
  for (const tool of ["select", "pan", "measure", "keepout"]) {
    assert.match(toolbarSource, new RegExp(`tool === ["']${tool}["']`));
  }
  assert.match(toolbarSource, /aria-label=\{label\}/);
  assert.match(toolbarSource, /TooltipContent[\s\S]*\{label\}/);
  assert.match(toolbarSource, /onResetView/);
});

test("wires keyboard editing while skipping editable controls", () => {
  assert.match(combinedHookSource, /addEventListener\(["']keydown["']/);
  assert.match(combinedHookSource, /input,\s*textarea,\s*select/);
  assert.match(combinedHookSource, /contenteditable/);
  assert.match(combinedHookSource, /Delete|Backspace/);
  assert.match(combinedHookSource, /key === ["']l["']/);
  assert.match(
    combinedHookSource,
    /key === ["']l["'][\s\S]{0,180}document\/toggle-lock/,
  );
  assert.match(combinedHookSource, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
  assert.match(combinedHookSource, /history\/undo/);
  assert.match(combinedHookSource, /history\/redo/);
  assert.match(combinedHookSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(editorHookSource, /key === ["']v["'] \|\| key === ["']h["']/);
  assert.match(editorHookSource, /key === ["']m["'] \|\| key === ["']k["']/);
  assert.match(editorHookSource, /key === ["']r["'][\s\S]{0,120}rotateSelected/);
  assert.match(editorHookSource, /addEventListener\(["']keyup["']/);
  assert.match(canvasSource, /event\.key === ["']Escape["'][\s\S]{0,220}onPlacementCancel/);
  assert.match(workspaceSource, /key\.toLocaleLowerCase\(\) !== ["']s["']/);
  assert.match(editorHookSource, /shortcutRef\.current/);
  assert.match(editorHookSource, /window\.addEventListener\(["']keydown["'], onKeyDown\)[\s\S]{0,500}\}, \[\]\);/);
});

test("keeps recovery and high-frequency canvas input under user control", () => {
  assert.doesNotMatch(
    runtimeBoundarySource,
    /componentDidCatch[\s\S]{0,700}setTimeout\([\s\S]{0,120}replaceWithCacheBuster/,
  );
  assert.match(canvasSource, /requestAnimationFrame/);
  assert.match(canvasSource, /queuePointerPreview/);
  assert.match(canvasSource, /queuedZoomRef/);
  assert.match(canvasSource, /placementRotation/);
  assert.match(canvasSource, /rotation:\s*placementRotation/);
  assert.match(canvasSource, /event\.stopImmediatePropagation\(\)/);
});

test("saves only on explicit action and warns before abandoning dirty work", () => {
  assert.doesNotMatch(persistenceSource, /PCB_(?:LOCAL|REMOTE)_SAVE_DELAY_MS/);
  assert.doesNotMatch(persistenceSource, /setTimeout/);
  assert.match(persistenceSource, /saveNow[\s\S]{0,500}repositoryRef\.current\.save/);
  assert.match(persistenceSource, /beforeunload/);
  assert.match(persistenceSource, /hasUnsavedChanges/);
  assert.match(workspaceSource, /手動儲存模式（Ctrl\+S）/);
  assert.match(workspaceSource, /尚未儲存/);
  assert.doesNotMatch(workspaceSource, /toLocaleTimeString/);
});

test("shows same-project editors and tracks their editing context", () => {
  assert.match(presenceSource, /pcb_project_presence:\$\{projectId\}/);
  assert.match(presenceSource, /presenceState/);
  assert.match(presenceSource, /dirty/);
  assert.match(presenceSource, /viewMode/);
  assert.match(collaboratorsSource, /同案編輯者/);
  assert.match(collaboratorsSource, /編輯中，尚未儲存/);
  assert.match(workspaceSource, /usePcbProjectPresence/);
  assert.match(workspaceSource, /<PcbCollaborators/);
});

test("provides a lazy interactive 3D PCB view without replacing the 2D editor", () => {
  assert.match(workspaceSource, /lazy\(\(\) => import\(["']\.\/Pcb3DCanvas\.tsx["']\)/);
  assert.match(workspaceSource, /viewMode === ["']2d["'][\s\S]{0,500}<PcbCanvas/);
  assert.match(workspaceSource, /<Pcb3DCanvas/);
  assert.match(canvas3dSource, /<Canvas/);
  assert.match(canvas3dSource, /OrbitControls/);
  assert.match(canvas3dSource, /project\.components\.map/);
  assert.match(canvas3dSource, /project\.keepouts\.map/);
  assert.match(canvas3dSource, /workspace\.selectObject/);
  assert.match(canvas3dSource, /重設視角/);
});

test("makes existing canvas objects keyboard-selectable", () => {
  assert.match(canvasSource, /type KeyboardEvent as ReactKeyboardEvent/);
  assert.match(canvasSource, /event\.key === ["']Enter["'] \|\| event\.key === ["'] ["']/);
  assert.match(canvasSource, /role=["']button["']/);
  assert.match(canvasSource, /tabIndex=\{0\}/);
  assert.match(canvasSource, /selectObject\(\{ kind: ["']component["']/);
  assert.match(canvasSource, /selectObject\(\{ kind: ["']keepout["']/);
  assert.match(canvasSource, /selectObject\(\{ kind: ["']measurement["']/);
  assert.match(editorCssSource, /\[role=["']button["']\]:focus-visible/);
});

test("keeps measurement selection compact without a native SVG focus ring", () => {
  assert.match(canvasSource, /className=["']pcb-measurement-object["']/);
  assert.match(canvasSource, /className=["']pcb-measurement-hit-target["'][\s\S]{0,350}pointerEvents=["']stroke["']/);
  assert.match(canvasSource, /event\.preventDefault\(\)[\s\S]{0,160}selectObject\(\{ kind: ["']measurement["']/);
  assert.match(canvasSource, /selectedMeasurement[\s\S]{0,800}strokeDasharray/);
  assert.match(editorCssSource, /pcb-measurement-object:focus[\s\S]{0,180}outline:\s*none\s*!important/);
});

test("disables inspector mutation controls while a component is locked", () => {
  assert.match(inspectorSource, /const componentDisabled = disabled \|\| component\.locked/);
  assert.match(inspectorSource, /disabled=\{!workspace\.canMutate \|\| component\.locked\}/);
  assert.match(editorHookSource, /if \(!source \|\| source\.locked\) return false/);
});

test("provides complete board, selection, DRC, and PNG workflows", () => {
  assert.match(inspectorSource, /rotateSelected/);
  assert.match(inspectorSource, /deleteSelected/);
  assert.match(inspectorSource, /centerDrcIssue/);
  assert.match(inspectorSource, /runDrc/);
  assert.match(inspectorSource, /component[\s\S]*keepout[\s\S]*measurement/i);
  assert.match(editorHookSource, /centerDrcIssue[\s\S]{0,1200}zoom\/set/);
  assert.match(workspaceSource, /exportPcbSvgAsPng/);
  assert.match(workspaceSource, /includeGrid/);
  assert.match(toolbarSource, /exportIncludesGrid/);
  assert.match(toolbarSource, /onExportIncludesGridChange/);
  assert.match(pngExportSource, /viewBox[\s\S]{0,220}board\.width[\s\S]{0,120}board\.height/);
  assert.match(canvasSource, /data-grid-surface[\s\S]{0,180}display=\{project\.board\.showGrid/);
  assert.match(pngExportSource, /includeGrid[\s\S]{0,380}data-grid-surface[\s\S]{0,120}removeAttribute\(["']display["']\)/);
  assert.match(canvasSource, /const strokeWidth = Math\.max\(project\.board\.width,\s*project\.board\.height\) \/ 700/);
  assert.match(canvasSource, /<style>[\s\S]{0,500}\.pcb-svg-label[\s\S]{0,300}font-family/);
  assert.match(workspaceSource, /<PcbCanvas/);
  assert.match(canvasSource, /kind:\s*["']keepout-move["']/);
  assert.match(canvasSource, /cursorPoint[\s\S]*toFixed/);
  assert.match(canvasSource, /drc-overlay[\s\S]*translate\([\s\S]*rotate\(/);
  assert.match(editorCssSource, /max-width:\s*1279px[\s\S]*pcb-left-drawer,[\s\S]*visibility:\s*hidden[\s\S]*is-open[\s\S]*visibility:\s*visible/);
  assert.match(workspaceSource, /手動儲存模式（Ctrl\+S）/);
  assert.doesNotMatch(workspaceSource, /toLocaleTimeString/);
  assert.match(workspaceSource, /onRunDrc=\{\(\) => \{[\s\S]{0,120}runDrc\(\)[\s\S]{0,120}setOpenDrawer\(["']right["']\)/);
});
