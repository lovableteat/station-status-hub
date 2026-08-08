# PCB Designer 同步、匯入與介面修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 PCB Designer 的 2D／3D 真正共用座標、旋轉、層級與選取狀態，同時完成 50 MB 匯入、可編輯 Top／Bottom 板色、可理解 BOM 預覽與窄版面整理。

**Architecture:** 以純函式 `core/viewSync.ts` 統一視圖投影與選取／層級規則，讓兩個畫面仍只讀同一份 workspace 專案狀態。資料模型新增可向後相容的 `board.layerColors`；檔案匯入與預覽資料在 workspace shell 組裝，模型 payload 維持在既有瀏覽器資產儲存區。UI 只保留有行為的操作並以穩定寬度與高對比狀態呈現。

**Tech Stack:** React 18, TypeScript, Vite, React Three Fiber／Three.js, Node built-in test runner, ESLint。

## Global Constraints

- 表格／元件庫匯入檔案上限精確為 `50 * 1024 * 1024` bytes，超過時讀取內容前拒絕並顯示「檔案大小超過 50 MB 上限。」。
- STP／STEP 上限精確為 `50 * 1024 * 1024` bytes，接受 `.stp` 與 `.step`。
- 2D 與 3D 必須從同一份 `PcbPlacedComponent` 欄位取得座標、旋轉、層級與選取狀態，不新增第二份視圖資料。
- STEP metadata 可序列化進專案；頂點／索引 payload 只能存放既有 IndexedDB／記憶體模型資產儲存區。
- BOM 預覽必須清楚說明「只建立左側待放置清單，不會直接放到畫布」，並最多渲染前 100 筆錯誤。
- `Top`、`Bottom`、`2D`、`3D`、`All` 文字不可被 flex 壓縮或截斷。
- production code 必須先有一個會因功能缺失而失敗的測試，再實作最小修正。
- 完成前必須通過 `npm run test:pcb`、`npm run lint`、`npm run build`，並以瀏覽器驗證實際互動與 console。

---

### Task 1: 統一 2D／3D 同步投影與選取規則

**Files:**
- Create: `src/components/pcb-designer/core/viewSync.ts`
- Create: `tests/pcb-designer/view-sync.test.ts`
- Modify: `src/components/pcb-designer/PcbCanvas.tsx`
- Modify: `src/components/pcb-designer/Pcb3DCanvas.tsx`
- Modify: `tests/pcb-designer/editor-contract.test.ts`

**Interfaces:**
- `getPcbSelectionIds(primarySelection: PcbSelection | null, selectedObjects: PcbSelection[]): string[]` returns unique object IDs including the primary selection.
- `isPcbLayerVisible(visibleLayer: PcbVisibleLayer, componentLayer: PcbPlacedComponent["layer"]): boolean` returns the shared layer-filter result.
- `getPcbComponentCenter(component: Pick<PcbPlacedComponent, "x" | "y" | "width" | "height">): { x: number; y: number }` returns the 2D center.
- `getPcb3DComponentTransform(component: Pick<PcbPlacedComponent, "x" | "y" | "width" | "height" | "rotation" | "layer">, board: Pick<PcbBoard, "width" | "height">): { position: [number, number, number]; rotation: [number, number, number] }` returns the 3D placement transform from the same board coordinates.

- [ ] **Step 1: Write the failing pure-function tests**

Add tests that assert a 100×80 board and a component at `(20, 30)` with size `10×6`, rotation `90`, top layer produce center `{ x: 25, y: 33 }`, a deterministic 3D transform, bottom layer adds the bottom flip, and duplicate primary／multi-selection IDs are returned once. Assert `all`, `top`, and `bottom` visibility rules separately.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```text
npx tsx --test tests/pcb-designer/view-sync.test.ts
```

Expected: FAIL because `core/viewSync.ts` and its exports do not exist yet.

- [ ] **Step 3: Implement the minimal shared mapping module**

Implement only the four named functions, using the existing 2D board coordinate convention and the current 3D board centering convention. Do not introduce view-specific state.

- [ ] **Step 4: Run the focused test and verify it passes**

Run `npx tsx --test tests/pcb-designer/view-sync.test.ts`; expected result is all focused tests passing.

- [ ] **Step 5: Replace duplicated canvas calculations**

Use the shared functions in both canvases for visible components and selection IDs. Add `data-pcb-coordinate`, `data-pcb-rotation`, `data-pcb-layer`, and `data-pcb-selected` to component render roots so browser QA can inspect the same state. Preserve existing pointer, drag, orbit, model fallback, and selection actions.

- [ ] **Step 6: Update contract assertions and run the PCB suite**

Add source-contract assertions for the shared module imports and data attributes, then run `npm run test:pcb`; expected result is zero failures.

- [ ] **Step 7: Commit the task**

```text
git add src/components/pcb-designer/core/viewSync.ts src/components/pcb-designer/PcbCanvas.tsx src/components/pcb-designer/Pcb3DCanvas.tsx tests/pcb-designer/view-sync.test.ts tests/pcb-designer/editor-contract.test.ts
git commit -m "fix: unify PCB 2D and 3D view synchronization"
```

### Task 2: 50 MB 匯入與可理解的 BOM 預覽

**Files:**
- Modify: `src/components/pcb-designer/core/files.ts`
- Modify: `src/components/pcb-designer/PcbDialogs.tsx`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `tests/pcb-designer/file-workflows.test.ts`
- Modify: `tests/pcb-designer/workspace-integration.test.ts`

**Interfaces:**
- Extend `PcbDialogState["import-preview"]` with `importKind: "library" | "bom"`, `totalCount: number`, and optional `placementCount: number`.
- Keep `validCount`, `errors`, and `onCommit` compatible with existing callers while changing button copy by `importKind`.

- [ ] **Step 1: Add failing file-limit and preview contract tests**

Assert `MAX_IMPORT_FILE_BYTES === 50 * 1024 * 1024`, an exactly-50-MiB file reaches parsing, a larger file rejects with `50 MB`, the workspace passes `importKind: "bom"` and `placementCount`, and the dialog source contains the BOM explanation plus a 100-error slice.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```text
npx tsx --test tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/workspace-integration.test.ts
```

Expected: FAIL on the old 5 MB constant and missing preview fields/copy.

- [ ] **Step 3: Raise the table import limit and message**

Set `MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024`; reject only `file.size > MAX_IMPORT_FILE_BYTES` and use the exact 50 MB error message. Do not read file contents before this check.

- [ ] **Step 4: Pass typed preview summaries from the workspace**

For library import, pass `importKind: "library"` and `totalCount: result.valid.length + result.errors.length`. For BOM import, pass `importKind: "bom"`, the same total count, and `placementCount: result.placementCount`. Keep commit callbacks unchanged so cancel remains non-mutating.

- [ ] **Step 5: Redesign the preview dialog**

Render separate summaries for total／valid／invalid and BOM pending placements. For BOM, show the exact explanation that the import creates the left-side pending list and does not place items directly on the canvas. Render `dialog.errors.slice(0, 100)` and show the omitted count. Use `匯入有效元件` for library and `加入待放置清單` for BOM; disable the action when `validCount === 0`.

- [ ] **Step 6: Run the focused tests and the full PCB suite**

Run `npx tsx --test tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/workspace-integration.test.ts` and then `npm run test:pcb`; expected result is zero failures.

- [ ] **Step 7: Commit the task**

```text
git add src/components/pcb-designer/core/files.ts src/components/pcb-designer/PcbDialogs.tsx src/components/pcb-designer/PcbDesignerWorkspace.tsx tests/pcb-designer/file-workflows.test.ts tests/pcb-designer/workspace-integration.test.ts
git commit -m "fix: clarify PCB imports and raise upload limit"
```

### Task 3: 可編輯 Top／Bottom 板色與向後相容資料

**Files:**
- Modify: `src/components/pcb-designer/types.ts`
- Modify: `src/components/pcb-designer/defaults.ts`
- Modify: `src/components/pcb-designer/core/validation.ts`
- Modify: `src/components/pcb-designer/core/storage.ts`
- Modify: `src/components/pcb-designer/PcbInspector.tsx`
- Modify: `src/components/pcb-designer/PcbCanvas.tsx`
- Modify: `src/components/pcb-designer/Pcb3DCanvas.tsx`
- Modify: `tests/pcb-designer/defaults.test.ts`
- Modify: `tests/pcb-designer/validation.test.ts`
- Modify: `tests/pcb-designer/editor-contract.test.ts`

**Interfaces:**
- `PcbBoard.layerColors: { top: string; bottom: string }` is required for new projects and normalized legacy projects.
- `normalizePcbSaveState` preserves existing background and supplies missing layer colors.

- [ ] **Step 1: Add failing model, validation, and inspector tests**

Assert blank projects have distinct non-empty `board.layerColors.top` and `.bottom`; a legacy valid board without `layerColors` is normalized with defaults; invalid layer colors are rejected only when present; Inspector source contains two color inputs and calls `workspace.updateBoard` with `layerColors`.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```text
npx tsx --test tests/pcb-designer/defaults.test.ts tests/pcb-designer/validation.test.ts tests/pcb-designer/editor-contract.test.ts
```

Expected: FAIL because the board type, defaults, normalization, Inspector controls, and canvas color selection do not exist.

- [ ] **Step 3: Add defaults and compatibility normalization**

Define explicit top and bottom defaults, include them in `createBlankProject`, and update board validation to accept legacy boards while validating supplied layer colors. Normalize every project board before use/export without removing `background`.

- [ ] **Step 4: Add board color editors**

In `BoardInspector`, add labeled Top 色 and Bottom 色 `input type="color"` controls. Each update must preserve the other board fields and the opposite layer color.

- [ ] **Step 5: Apply the colors to both canvases**

Use `background` for `All`; use `layerColors.top` or `.bottom` for filtered board surfaces. Keep component colors and model materials intact. Add layer color values to the canvas data attributes used by visual QA.

- [ ] **Step 6: Run the focused tests and full PCB suite**

Run the focused command, then `npm run test:pcb`; expected result is zero failures.

- [ ] **Step 7: Commit the task**

```text
git add src/components/pcb-designer/types.ts src/components/pcb-designer/defaults.ts src/components/pcb-designer/core/validation.ts src/components/pcb-designer/core/storage.ts src/components/pcb-designer/PcbInspector.tsx src/components/pcb-designer/PcbCanvas.tsx src/components/pcb-designer/Pcb3DCanvas.tsx tests/pcb-designer/defaults.test.ts tests/pcb-designer/validation.test.ts tests/pcb-designer/editor-contract.test.ts
git commit -m "feat: add editable PCB top and bottom layer colors"
```

### Task 4: 工具列刪減、層級可讀性與整合驗證

**Files:**
- Modify: `src/components/pcb-designer/PcbToolbar.tsx`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Modify: `tests/pcb-designer/editor-contract.test.ts`
- Modify: `tests/pcb-designer/workspace-integration.test.ts`

**Interfaces:**
- `PcbToolbarProps` no longer includes `onNew`; the left rail remains the only primary new-project action.
- Existing export, tool, layer, lock, zoom, and DRC callbacks remain wired.

- [ ] **Step 1: Add failing toolbar and CSS contract tests**

Assert toolbar no longer declares/renders `onNew` or `新增專案`, retains all four tool callbacks and DRC/export controls, and layer switch selectors have `white-space: nowrap`, stable minimum width, explicit active styling, and non-collapsing flex items.

- [ ] **Step 2: Run the focused test and verify failure**

Run `npx tsx --test tests/pcb-designer/editor-contract.test.ts tests/pcb-designer/workspace-integration.test.ts`; expected: FAIL on the duplicate button and missing CSS contracts.

- [ ] **Step 3: Remove only the duplicate action and update the workspace call**

Remove the toolbar `Plus` import, `onNew` prop, and button. Keep the left-rail `onNewProject` action and every callback asserted as used elsewhere.

- [ ] **Step 4: Make layer and view controls non-collapsing and high contrast**

Update the existing toolbar CSS with `flex: 0 0 auto`, `min-width`, `white-space: nowrap`, visible active colors, and a disabled opacity that remains readable. Do not hide overflow content; allow horizontal toolbar scrolling at narrow widths.

- [ ] **Step 5: Run all static and runtime checks**

Run:

```text
npm run test:pcb
npm run lint
npm run build
```

Expected: all commands exit with code 0 and no test failures.

- [ ] **Step 6: Run browser QA**

Start the local Vite app, open PCB Designer, and verify:

1. In 2D, select and rotate a component; switch to 3D and inspect its `data-pcb-coordinate`, rotation, layer, and selected state.
2. Toggle Top／Bottom/All and confirm the same components remain visible in both views.
3. Edit Top and Bottom colors in the board Inspector and confirm canvas and controls change without clipped labels.
4. Open BOM import preview with valid and invalid rows; confirm the next-step explanation, placement count, and bounded errors.
5. Confirm a 50 MB boundary file is accepted by the size gate and an oversized file reports 50 MB.

Capture a desktop screenshot and a narrow viewport screenshot; inspect browser console for errors.

- [ ] **Step 7: Commit the task**

```text
git add src/components/pcb-designer/PcbToolbar.tsx src/components/pcb-designer/PcbDesignerWorkspace.tsx src/components/pcb-designer/pcb-designer.css tests/pcb-designer/editor-contract.test.ts tests/pcb-designer/workspace-integration.test.ts
git commit -m "ui: clarify PCB layer controls and remove duplicate action"
```

### Task 5: Final review, deployment, and main push

**Files:**
- Modify: `docs/superpowers/reports/2026-08-08-pcb-sync-import-ui-completion.md`

- [ ] **Step 1: Review the complete diff against the specification**

Check every acceptance condition in `docs/superpowers/specs/2026-08-08-pcb-sync-import-ui-design.md`, including legacy board normalization and the no-payload-in-project-JSON rule.

- [ ] **Step 2: Run fresh completion verification**

Run `npm run test:pcb`, `npm run lint`, `npm run build`, `git diff --check`, and `git status --short`; record the exact exit status and counts in the report.

- [ ] **Step 3: Commit the completion report**

```text
git add docs/superpowers/reports/2026-08-08-pcb-sync-import-ui-completion.md
git commit -m "docs: record PCB sync import UI verification"
```

- [ ] **Step 4: Push the verified branch to main**

After confirming the current branch contains only this task's commits and the verification output is clean, push the completed commits to the repository's `main` branch and report the commit IDs and deployment result.
