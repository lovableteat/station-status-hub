# PCB Designer 協作問題修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 L10 獨立模板、STP/STEP 元件模型、Top/Bottom 跨 2D/3D 同步、多元件移動與禁制區複製，並把驗證後的結果推送到 `main`。

**Architecture:** 以 `PcbWorkspaceState` 作為唯一編輯來源，將「新元件放置層」與「目前檢視層」拆成兩個狀態；2D 與 3D 共用同一組可見物件與選取資料。核心編輯行為放在純函式中，UI 只負責手勢、提示與 dispatch；STEP mesh 透過模型資產儲存層管理，專案狀態只保存 metadata。

**Tech Stack:** React 18、TypeScript、Vite、React Three Fiber、Three.js、既有 `occt-import-js` STEP parser、Node `node:test`、localStorage、IndexedDB。

## Global Constraints

- L10 先做獨立內建模板／專案，不改名、不合併、不覆蓋既有 L6 專案。
- `activeLayer` 僅控制新元件放置層；`visibleLayer` 控制 2D 與 3D 顯示過濾。
- 群組移動必須是單一 undo/redo 交易；鎖定元件不得移動。
- STEP mesh 不直接塞入專案 JSON；失去資產時顯示 fallback 與重新匯入提示。
- 保持既有匯出格式、遠端同步相容；舊版資料缺少新欄位時使用安全預設值。
- 每項新核心行為先寫會失敗的測試，再寫最小實作。

---

### Task 1: 擴充 PCB domain model 與 L10 內建模板

**Files:**
- Modify: `src/components/pcb-designer/types.ts`
- Modify: `src/components/pcb-designer/core/workspaceTypes.ts`
- Modify: `src/components/pcb-designer/defaults.ts`
- Modify: `src/components/pcb-designer/core/storage.ts`
- Modify: `src/components/pcb-designer/core/validation.ts`
- Test: `tests/pcb-designer/defaults.test.ts`
- Test: `tests/pcb-designer/workspace-state.test.ts`
- Test: `tests/pcb-designer/storage.test.ts`

**Interfaces:**
- Produce `PcbModelAssetMetadata`, `PcbModelAsset`, `PcbVisibleLayer`, `selectedObjects`, and `visibleLayer` state fields.
- Produce reducer actions `selection/toggle`, `selection/clear-group`, and `view/layer`.
- Preserve `selection` as the primary inspector selection for current consumers.

- [ ] **Step 1: Write failing domain tests**

```ts
test("ships an isolated built-in L10 design template", async () => {
  const { BUILT_IN_TEMPLATES } = await import("../../src/components/pcb-designer/defaults.ts");
  const template = BUILT_IN_TEMPLATES.find((item) => item.name === "L10 Design");
  assert.ok(template);
  assert.equal(template.isBuiltIn, true);
  assert.notEqual(template.project.name, "微控制器板專案");
});

test("hydrates legacy PCB state with all-layer view and empty model metadata", async () => {
  const { createWorkspaceState } = await import("../../src/components/pcb-designer/core/workspace.ts");
  const legacy = structuredClone(seedStateWithoutNewFields);
  const state = createWorkspaceState(legacy, true);
  assert.equal(state.visibleLayer, "all");
  assert.deepEqual(state.selectedObjects, []);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node.exe --test tests/pcb-designer/defaults.test.ts tests/pcb-designer/workspace-state.test.ts tests/pcb-designer/storage.test.ts`

Expected: failures report that `L10 Design`, `visibleLayer`, or `selectedObjects` are missing.

- [ ] **Step 3: Implement the minimal model and migration**

Add the new fields as optional on persisted records, normalize them when creating/hydrating workspace state, and add the L10 template by cloning the existing valid project shape with an L10-specific name/description. Extend validation so invalid layer values or malformed model metadata are rejected without invalidating older records that do not contain those fields.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node.exe --test tests/pcb-designer/defaults.test.ts tests/pcb-designer/workspace-state.test.ts tests/pcb-designer/storage.test.ts`

Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add src/components/pcb-designer/types.ts src/components/pcb-designer/core/workspaceTypes.ts src/components/pcb-designer/defaults.ts src/components/pcb-designer/core/storage.ts src/components/pcb-designer/core/validation.ts tests/pcb-designer/defaults.test.ts tests/pcb-designer/workspace-state.test.ts tests/pcb-designer/storage.test.ts
git commit -m "feat: add PCB layer and L10 design state"
```

### Task 2: Implement group movement and keepout duplication in pure editor logic

**Files:**
- Modify: `src/components/pcb-designer/core/editor.ts`
- Modify: `src/components/pcb-designer/core/workspaceTypes.ts`
- Modify: `src/components/pcb-designer/core/workspace.ts`
- Modify: `src/components/pcb-designer/hooks/usePcbEditorActions.ts`
- Test: `tests/pcb-designer/editor-actions.test.ts`
- Test: `tests/pcb-designer/workspace-state.test.ts`

**Interfaces:**
- Produce `moveComponents(project, instanceIds, delta, bypassSnap): GroupMoveResult`.
- Produce `duplicateKeepout(project, id, offset): KeepoutDuplicateResult`.
- Produce `duplicateSelected()` from `usePcbEditorActions` and a reducer transaction for history.

- [ ] **Step 1: Write failing core tests**

```ts
test("moves multiple unlocked components as one snapped transaction", () => {
  const result = editorModule.moveComponents(project, ["A", "B"], { x: 7.2, y: 4.1 }, false);
  assert.equal(result.ok, true);
  assert.deepEqual(result.project.components.map(({ x, y }) => ({ x, y })), [
    { x: 12, y: 14 },
    { x: 22, y: 24 },
  ]);
});

test("duplicates a keepout with a new identity and legal offset", () => {
  const result = editorModule.duplicateKeepout(project, "keepout-1", { x: 1, y: 1 });
  assert.equal(result.ok, true);
  assert.notEqual(result.keepout.id, "keepout-1");
  assert.equal(result.project.keepouts.length, 2);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node.exe --test tests/pcb-designer/editor-actions.test.ts tests/pcb-designer/workspace-state.test.ts`

Expected: failures report missing `moveComponents` and `duplicateKeepout` behavior.

- [ ] **Step 3: Implement minimal immutable operations**

Clone the project once, reject missing IDs and invalid deltas, calculate one snapped delta, preflight every selected component against board bounds, collisions, keepouts, and locked state, then commit all components together. For keepout duplication, generate a fresh ID, offset by one grid, clamp only when a legal position exists, and return the original project unchanged on failure.

- [ ] **Step 4: Add reducer and hook actions**

Add an editor action that dispatches one `project/commit` with the group result. Add `selection/duplicate` for keepouts and selected components, preserve the selected copy, and ensure `history/undo` restores both the document and pending selection state.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `node.exe --test tests/pcb-designer/editor-actions.test.ts tests/pcb-designer/workspace-state.test.ts`

Expected: all group-move, lock, boundary, duplicate, undo, and redo tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/pcb-designer/core/editor.ts src/components/pcb-designer/core/workspaceTypes.ts src/components/pcb-designer/core/workspace.ts src/components/pcb-designer/hooks/usePcbEditorActions.ts tests/pcb-designer/editor-actions.test.ts tests/pcb-designer/workspace-state.test.ts
git commit -m "feat: support PCB group moves and keepout copies"
```

### Task 3: Wire visible layers and multi-selection into the 2D/3D workspace

**Files:**
- Modify: `src/components/pcb-designer/PcbToolbar.tsx`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/PcbCanvas.tsx`
- Modify: `src/components/pcb-designer/Pcb3DCanvas.tsx`
- Modify: `src/components/pcb-designer/PcbInspector.tsx`
- Modify: `src/components/pcb-designer/hooks/usePcbWorkspace.ts`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Test: `tests/pcb-designer/editor-contract.test.ts`
- Test: `tests/pcb-designer/workspace-integration.test.ts`

**Interfaces:**
- Consume `visibleLayer`, `selectedObjects`, `moveComponents`, and `duplicateSelected` from the workspace API.
- Produce toolbar controls labelled `全部`, `Top`, and `Bottom` with `aria-pressed` state.

- [ ] **Step 1: Write failing UI contract tests**

```ts
test("exposes independent placement and visible-layer controls", () => {
  const toolbar = read("src/components/pcb-designer/PcbToolbar.tsx");
  assert.match(toolbar, /全部/);
  assert.match(toolbar, /visibleLayer/);
  assert.match(toolbar, /activeLayer/);
});

test("uses the shared visible layer in both 2D and 3D renderers", () => {
  const canvas2d = read("src/components/pcb-designer/PcbCanvas.tsx");
  const canvas3d = read("src/components/pcb-designer/Pcb3DCanvas.tsx");
  assert.match(canvas2d, /visibleLayer/);
  assert.match(canvas3d, /visibleLayer/);
  assert.match(canvas2d, /selectedObjects/);
});
```

- [ ] **Step 2: Run the focused contract tests and verify RED**

Run: `node.exe --test tests/pcb-designer/editor-contract.test.ts tests/pcb-designer/workspace-integration.test.ts`

Expected: failures report no visible-layer controls and no shared group-selection contract.

- [ ] **Step 3: Implement shared view and selection state**

Expose `visibleLayer`, `selectedObjects`, `toggleObjectSelection`, `clearObjectSelection`, and `setVisibleLayer` from `usePcbWorkspace`. Update `PcbCanvas` to ignore objects outside the filter, use Ctrl/Cmd pointer selection, and record the selected component IDs at drag start. Commit one group move on pointer release. Update `Pcb3DCanvas` to apply the same filter and selection list while preserving the same coordinate transform and layer-side placement.

- [ ] **Step 4: Add toolbar and inspector affordances**

Keep the existing Top/Bottom placement buttons. Add a separate visible-layer group with `全部`, `Top`, and `Bottom`; add a selection count and a `複製` button for keepouts in the inspector. Add Ctrl/Cmd+D handling through the existing keyboard shortcut path.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `node.exe --test tests/pcb-designer/editor-contract.test.ts tests/pcb-designer/workspace-integration.test.ts tests/pcb-designer/editor-actions.test.ts`

Expected: all visible-layer, 2D/3D synchronization, selection, and copy contracts pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/pcb-designer/PcbToolbar.tsx src/components/pcb-designer/PcbDesignerWorkspace.tsx src/components/pcb-designer/PcbCanvas.tsx src/components/pcb-designer/Pcb3DCanvas.tsx src/components/pcb-designer/PcbInspector.tsx src/components/pcb-designer/hooks/usePcbWorkspace.ts src/components/pcb-designer/pcb-designer.css tests/pcb-designer/editor-contract.test.ts tests/pcb-designer/workspace-integration.test.ts
git commit -m "feat: sync PCB layers and multi-selection across views"
```

### Task 4: Add STEP model assets and render them in PCB 3D

**Files:**
- Create: `src/components/pcb-designer/core/modelAssets.ts`
- Modify: `src/components/pcb-designer/types.ts`
- Modify: `src/components/pcb-designer/core/storage.ts`
- Modify: `src/components/pcb-designer/PcbLeftRail.tsx`
- Modify: `src/components/pcb-designer/PcbInspector.tsx`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/Pcb3DCanvas.tsx`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Test: `tests/pcb-designer/file-workflows.test.ts`
- Test: `tests/pcb-designer/storage.test.ts`
- Test: `tests/pcb-designer/editor-contract.test.ts`

**Interfaces:**
- Produce `PCB_MODEL_FILE_ACCEPT`, `isStepModelFile(file)`, `toPcbModelAssetMetadata(model)`, and an `IndexedDbModelAssetStore` with `put/get/delete`.
- Consume the existing `importStepModel(file)` parser from `src/components/data-center/stepImport.ts`.

- [ ] **Step 1: Write failing asset and contract tests**

```ts
test("accepts STP and STEP files but rejects unrelated extensions", async () => {
  const { isStepModelFile } = await import("../../src/components/pcb-designer/core/modelAssets.ts");
  assert.equal(isStepModelFile(new File([], "board.stp")), true);
  assert.equal(isStepModelFile(new File([], "board.step")), true);
  assert.equal(isStepModelFile(new File([], "board.glb")), false);
});

test("exposes a PCB STP import affordance and 3D model fallback", () => {
  const workspace = read("src/components/pcb-designer/PcbDesignerWorkspace.tsx");
  const canvas = read("src/components/pcb-designer/Pcb3DCanvas.tsx");
  assert.match(workspace, /stp|step/i);
  assert.match(canvas, /modelAssetId|重新匯入/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node.exe --test tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/storage.test.ts tests/pcb-designer/editor-contract.test.ts`

Expected: failures report missing STP acceptance, model metadata, and 3D fallback contracts.

- [ ] **Step 3: Implement model metadata and IndexedDB adapter**

Add a versioned asset record containing ID, file name, dimensions, axis, parts, and typed-array payloads converted to plain arrays. Implement an IndexedDB adapter with an in-memory fallback for unavailable browser environments. Extend state validation/migration so a missing or deleted asset never invalidates a project.

- [ ] **Step 4: Wire import and assignment UI**

Add an `匯入 STP/STEP` file input to the selected component inspector. Require an editable component selection, parse asynchronously, show a loading state, display dimensions/part count on success, save metadata plus the asset, and update the selected component. On failure, keep the previous component unchanged and show the parser error.

- [ ] **Step 5: Render model assets with a safe fallback**

Render stored model parts as Three.js `BufferGeometry` meshes at the component position, rotation, layer side, and board coordinate transform. If the asset cannot be loaded, keep the current procedural box and render an accessible `重新匯入 3D 模型` hint rather than throwing from the scene.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `node.exe --test tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/storage.test.ts tests/pcb-designer/editor-contract.test.ts`

Expected: all model file, persistence migration, import affordance, and fallback tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/components/pcb-designer/core/modelAssets.ts src/components/pcb-designer/types.ts src/components/pcb-designer/core/storage.ts src/components/pcb-designer/PcbLeftRail.tsx src/components/pcb-designer/PcbInspector.tsx src/components/pcb-designer/PcbDesignerWorkspace.tsx src/components/pcb-designer/Pcb3DCanvas.tsx src/components/pcb-designer/pcb-designer.css tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/storage.test.ts tests/pcb-designer/editor-contract.test.ts
git commit -m "feat: import STEP models into PCB 3D"
```

### Task 5: Full regression, build, and main delivery

**Files:**
- Modify: none unless verification exposes a regression in the changed files.
- Test: `tests/pcb-designer/*.test.ts`
- Test: `tests/pcb-designer/workspace-integration.test.ts`

- [ ] **Step 1: Run changed-area verification**

Run: `node.exe --test tests/pcb-designer/*.test.ts`

Expected: all new and existing PCB tests pass. The baseline had two unrelated integration assertions on the current `main`; if they still fail, report their exact paths and keep them separate from the feature result.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: Vite exits with code 0 and produces `dist` without TypeScript or module-resolution errors.

- [ ] **Step 3: Run focused lint inspection**

Run: `npm.cmd exec eslint -- src/components/pcb-designer tests/pcb-designer`

Expected: no new lint errors in changed PCB files. Existing repository-wide lint errors outside this area are not part of this task.

- [ ] **Step 4: Inspect diff and worktree**

Run: `git diff --check; git status --short --branch; git log --oneline -6`

Expected: no whitespace errors, only intentional commits, and a clean worktree after committing.

- [ ] **Step 5: Push the feature branch as a backup**

```powershell
git push origin HEAD:codex/pcb-collaboration-fixes
```

- [ ] **Step 6: Push the verified commit history to main**

```powershell
git push origin HEAD:main
```

- [ ] **Step 7: Verify GitHub Pages deployment**

Run: `gh run list --repo lovableteat/station-status-hub --workflow main.yml --branch main --limit 1 --json status,conclusion,headSha,url`

Expected: a completed successful run whose `headSha` equals `git rev-parse HEAD`; verify the live PCB bundle contains `L10 Design`, `全部`, `Top`, `Bottom`, and `匯入 STP/STEP`.
