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
const modelAssetsSource = await read("src/components/pcb-designer/core/modelAssets.ts");
const viewSyncSource = await read("src/components/pcb-designer/core/viewSync.ts");

test("surfaces shared visible-layer controls and selection utilities through the workspace shell", () => {
  assert.match(hookSource, /const setVisibleLayer = useCallback/);
  assert.match(hookSource, /dispatch\(\{ type: "view\/layer", layer \}\)/);
  assert.match(hookSource, /const toggleObjectSelection = useCallback/);
  assert.match(hookSource, /dispatch\(\{ type: "selection\/toggle", objectId \}\)/);
  assert.match(hookSource, /const clearObjectSelection = useCallback/);
  assert.match(hookSource, /dispatch\(\{ type: "selection\/clear-group" \}\)/);
  assert.match(hookSource, /visibleLayer:\s*state\.visibleLayer/);
  assert.match(hookSource, /selectedObjects:\s*state\.selectedObjects/);
  assert.match(hookSource, /setVisibleLayer,/);
  assert.match(hookSource, /toggleObjectSelection,/);
  assert.match(hookSource, /clearObjectSelection,/);
  assert.match(workspaceSource, /visibleLayer=\{workspace\.visibleLayer\}/);
  assert.match(workspaceSource, /selectedObjects=\{workspace\.selectedObjects\}/);
  assert.match(workspaceSource, /onVisibleLayerChange=\{workspace\.setVisibleLayer\}/);
});

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
  assert.match(toolbarSource, /label=["']禁制區["'][\s\S]{0,180}showLabel/);
  assert.match(toolbarSource, /shortcut=["']K["']/);
});

test("adds separate visible-layer filters without replacing placement-layer controls", () => {
  assert.doesNotMatch(toolbarSource, /onNew:\s*\(\)\s*=>\s*void/);
  assert.doesNotMatch(toolbarSource, /label=["']新增專案["']/);
  assert.doesNotMatch(toolbarSource, /icon=\{Plus\}/);
  assert.match(toolbarSource, /visibleLayer:\s*PcbVisibleLayer/);
  assert.match(toolbarSource, /onVisibleLayerChange:\s*\(layer:\s*PcbVisibleLayer\)\s*=>\s*void/);
  assert.match(toolbarSource, /pcb-visible-layer-switch/);
  assert.match(toolbarSource, /aria-pressed=\{visibleLayer === layer\}/);
  assert.match(toolbarSource, /onClick=\{\(\) => onVisibleLayerChange\(layer\)\}/);
  assert.match(toolbarSource, /onClick=\{\(\) => onActiveLayerChange\(layer\)\}/);
});

test("provides a complete keepout workflow with visible creation, resize, and deletion controls", () => {
  assert.match(canvasSource, /kind:\s*["']keepout-resize["']/);
  assert.match(canvasSource, /beginKeepoutResize/);
  assert.match(canvasSource, /pcb-keepout-resize-handle/);
  assert.match(canvasSource, /workspace\.updateKeepout\(interaction\.id, interaction\.preview\)/);
  assert.match(canvasSource, /拖曳四角縮放 · Delete 刪除/);
  assert.match(inspectorSource, /data-selection-kind=["']keepout["'][\s\S]{0,1800}SelectionActions/);
  assert.match(editorHookSource, /keepout\.x \+ keepout\.width > state\.activeProject\.board\.width/);
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
  assert.match(editorHookSource, /key === ["']d["'][\s\S]{0,220}duplicateSelected/);
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
  assert.match(canvas3dSource, /visibleLayer/);
  assert.match(canvas3dSource, /project\.components\.map/);
  assert.match(canvas3dSource, /componentViewStates[\s\S]{0,120}\.filter[\s\S]{0,120}\.map/);
  assert.match(canvas3dSource, /project\.keepouts\.map/);
  assert.match(canvas3dSource, /workspace\.selectObject/);
  assert.match(canvas3dSource, /重設視角/);
});

test("contains 3D runtime failures inside the PCB view", () => {
  assert.match(canvas3dSource, /class Pcb3DErrorBoundary/);
  assert.match(canvas3dSource, /fallback=\{/);
  assert.match(canvas3dSource, /WebGL|3D/);
});

test("shares 2D and 3D synchronization helpers and inspection attributes", () => {
  assert.match(viewSyncSource, /export function getPcbSelectionIds/);
  assert.match(viewSyncSource, /export function isPcbLayerVisible/);
  assert.match(viewSyncSource, /export function getPcbComponentCenter/);
  assert.match(viewSyncSource, /export function getPcbComponentViewState/);
  assert.match(viewSyncSource, /export function getPcb3DComponentTransform/);
  assert.match(canvasSource, /from "\.\/core\/viewSync\.ts"/);
  assert.match(canvas3dSource, /from "\.\/core\/viewSync\.ts"/);
  assert.match(canvasSource, /getPcbComponentViewState/);
  assert.match(canvas3dSource, /getPcbComponentViewState/);
  assert.match(canvasSource, /data-pcb-coordinate/);
  assert.match(canvasSource, /data-pcb-rotation/);
  assert.match(canvasSource, /data-pcb-layer/);
  assert.match(canvasSource, /data-pcb-selected/);
  assert.match(canvasSource, /data-pcb-board-color/);
  assert.match(canvasSource, /data-pcb-top-color/);
  assert.match(canvasSource, /data-pcb-bottom-color/);
  assert.match(canvas3dSource, /data-pcb-coordinate/);
  assert.match(canvas3dSource, /data-pcb-rotation/);
  assert.match(canvas3dSource, /data-pcb-layer/);
  assert.match(canvas3dSource, /data-pcb-selected/);
  assert.match(canvas3dSource, /data-pcb-board-color/);
  assert.match(canvas3dSource, /data-pcb-top-color/);
  assert.match(canvas3dSource, /data-pcb-bottom-color/);
});

test("lets the board inspector edit top and bottom colors separately", () => {
  assert.match(inspectorSource, /label=["']Top 色["']/);
  assert.match(inspectorSource, /label=["']Bottom 色["']/);
  assert.match(inspectorSource, /type="color"[\s\S]{0,400}layerColors/);
  assert.match(inspectorSource, /workspace\.updateBoard\(\{[\s\S]{0,160}layerColors:\s*\{[\s\S]{0,200}top:/);
  assert.match(inspectorSource, /workspace\.updateBoard\(\{[\s\S]{0,160}layerColors:\s*\{[\s\S]{0,200}bottom:/);
});

test("uses board background for all-layers and per-layer colors for filtered 2D and 3D board surfaces", () => {
  assert.match(canvasSource, /visibleLayer === ["']all["'][\s\S]{0,200}project\.board\.background/);
  assert.match(canvasSource, /visibleLayer === ["']top["'][\s\S]{0,200}project\.board\.layerColors\.top/);
  assert.match(canvasSource, /visibleLayer === ["']bottom["'][\s\S]{0,200}project\.board\.layerColors\.bottom/);
  assert.match(canvas3dSource, /visibleLayer === ["']all["'][\s\S]{0,200}project\.board\.background/);
  assert.match(canvas3dSource, /visibleLayer === ["']top["'][\s\S]{0,200}project\.board\.layerColors\.top/);
  assert.match(canvas3dSource, /visibleLayer === ["']bottom["'][\s\S]{0,200}project\.board\.layerColors\.bottom/);
});

test("supports Ctrl or Cmd multi-selection, shared layer filters, and group drag on the 2D canvas", () => {
  assert.match(canvasSource, /workspace\.visibleLayer/);
  assert.match(canvasSource, /workspace\.selectedObjects/);
  assert.match(canvasSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(canvasSource, /workspace\.toggleObjectSelection/);
  assert.match(canvasSource, /workspace\.clearObjectSelection/);
  assert.match(canvasSource, /workspace\.moveComponents/);
});

test("makes existing canvas objects keyboard-selectable", () => {
  assert.match(canvasSource, /type KeyboardEvent as ReactKeyboardEvent/);
  assert.match(canvasSource, /event\.key === ["']Enter["'] \|\| event\.key === ["'] ["']/);
  assert.match(canvasSource, /role=["']button["']/);
  assert.match(canvasSource, /tabIndex=\{0\}/);
  assert.match(canvasSource, /selectObject\([\s\S]{0,40}\{ kind: ["']component["']/);
  assert.match(canvasSource, /selectObject\([\s\S]{0,40}\{ kind: ["']keepout["']/);
  assert.match(canvasSource, /selectObject\([\s\S]{0,40}\{ kind: ["']measurement["']/);
  assert.match(editorCssSource, /\[role=["']button["']\]:focus-visible/);
});

test("keeps measurement selection compact without a native SVG focus ring", () => {
  assert.match(canvasSource, /className=["']pcb-measurement-object["']/);
  assert.match(canvasSource, /className=["']pcb-measurement-hit-target["'][\s\S]{0,350}pointerEvents=["']stroke["']/);
  assert.match(canvasSource, /event\.preventDefault\(\)[\s\S]{0,200}selectObject\([\s\S]{0,40}\{ kind: ["']measurement["']/);
  assert.match(canvasSource, /selectedMeasurement[\s\S]{0,800}strokeDasharray/);
  assert.match(editorCssSource, /pcb-measurement-object:focus[\s\S]{0,180}outline:\s*none\s*!important/);
});

test("suppresses native SVG focus halos while retaining the custom selection bounds", () => {
  assert.match(canvasSource, /className=\{`pcb-component-object/);
  assert.match(editorCssSource, /\[role=["']button["']\]:focus,[\s\S]{0,180}outline:\s*none\s*!important/);
  assert.match(editorCssSource, /pcb-component-object:focus[\s\S]{0,180}filter:\s*none/);
  assert.match(canvasSource, /data-layer=["']selection-handles["']/);
});

test("renders a component and its selection frame from the same drag geometry", () => {
  assert.match(canvasSource, /getComponentCanvasGeometry/);
  assert.match(canvasSource, /selectedComponentVisual/);
  assert.match(
    canvasSource,
    /data-selection-kind=["']component["'][\s\S]{0,220}transform=\{selectedComponentVisual\.geometry\.transform\}/,
  );
  assert.match(
    canvasSource,
    /selectedComponentVisual\?\.component\.instanceId === component\.instanceId[\s\S]{0,180}selectedComponentVisual\.geometry\.transform/,
  );
  assert.match(
    canvasSource,
    /selectedComponentVisual\.geometry\.localBounds[\s\S]{0,900}selectedComponentVisual\.geometry\.handles/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-component-object\s*\{[\s\S]{0,120}transition:\s*none/,
  );
  assert.doesNotMatch(
    canvasSource,
    /data-selection-kind=["']component["'][\s\S]{0,900}vectorEffect=/,
  );
});

test("keeps dense toolbar labels readable and stable across active and disabled states", () => {
  assert.match(
    editorCssSource,
    /\.pcb-tool-button\.is-labeled\s*\{[\s\S]{0,260}font-size:\s*12px/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-tool-button\.is-labeled kbd\s*\{[\s\S]{0,320}font-size:\s*11px/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-layer-switch button,[\s\S]{0,120}\.pcb-visible-layer-switch button\s*\{[\s\S]{0,320}font-family:\s*inherit[\s\S]{0,120}font-size:\s*12px[\s\S]{0,120}line-height:\s*1/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-layer-switch,\s*[\r\n]+\s*\.pcb-visible-layer-switch\s*\{[\s\S]{0,400}flex:\s*0 0 auto[\s\S]{0,200}white-space:\s*nowrap/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-layer-switch button,\s*[\r\n]+\s*\.pcb-visible-layer-switch button\s*\{[\s\S]{0,400}flex:\s*0 0 auto[\s\S]{0,200}min-width:\s*64px[\s\S]{0,200}white-space:\s*nowrap/,
  );
  assert.doesNotMatch(
    editorCssSource,
    /\.pcb-layer-switch button:disabled,[\s\S]{0,120}\.pcb-visible-layer-switch button:disabled[\s\S]{0,120}opacity:/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-layer-switch button\.is-active,\s*[\r\n]+\s*\.pcb-visible-layer-switch button\.is-active\s*\{[\s\S]{0,320}border-color:[\s\S]{0,200}box-shadow:/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-toolbar \.pcb-tool-button:disabled\s*\{[\s\S]{0,180}opacity:\s*1/,
  );
  assert.match(
    editorCssSource,
    /\.pcb-status-chip,[\s\S]{0,120}\.pcb-save-state,[\s\S]{0,120}\.pcb-read-only\s*\{[\s\S]{0,260}font-size:\s*11px/,
  );
});

test("disables inspector mutation controls while a component is locked", () => {
  assert.match(inspectorSource, /const componentDisabled = disabled \|\| component\.locked/);
  assert.match(inspectorSource, /disabled=\{!workspace\.canMutate \|\| component\.locked\}/);
  assert.match(editorHookSource, /if \(!source \|\| source\.locked\) return false/);
});

test("shows inspector duplication affordances for grouped selections and keepouts", () => {
  assert.match(inspectorSource, /workspace\.duplicateSelected/);
  assert.match(inspectorSource, /workspace\.selectedObjects\.length/);
  assert.match(inspectorSource, /pcb-selection-count/);
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

test("keeps STEP model metadata serializable and assignment scoped to the selected component", () => {
  assert.match(modelAssetsSource, /PCB_MODEL_FILE_ACCEPT/);
  assert.match(modelAssetsSource, /toPcbModelAssetMetadata/);
  assert.match(modelAssetsSource, /IndexedDbModelAssetStore/);
  assert.match(modelAssetsSource, /indexedDB/);
  assert.match(modelAssetsSource, /number\[\]/);
  assert.match(workspaceSource, /importStepModel/);
  assert.match(inspectorSource, /modelAssetId/);
  assert.match(inspectorSource, /workspace\.updateComponent/);
  assert.match(canvas3dSource, /modelAssetId/);
  assert.match(canvas3dSource, /procedural/);
});
