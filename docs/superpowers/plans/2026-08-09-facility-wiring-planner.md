# 廠房與佈線規劃重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將廠房與佈線規劃改成「預覽先行、數值後補」的可視化操作流程，讓使用者不需理解 X/Y 即可完成配置。

**Architecture:** 重用現有 `DataCenter2DPlanner` 的拖曳與調整幾何邏輯，新增 embedded 版面模式，嵌入廠房規劃對話框左側；右側保留尺寸、通道清單與 PDU 設定，但移除每張通道卡上的座標輸入，改由預覽選取後的工作面板調整。既有 `FacilityPlan` 的 `x/z/rotation/width/depth` 欄位與更新回呼不變。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Lucide icons、Node built-in test runner、Vite。

## Global Constraints

- 不改變 `FacilityPlan`、通道與 PDU 饋線的儲存格式。
- 可視化拖曳只更新既有 `x`、`z`、`rotation`、`width`、`depth` 欄位。
- `canEdit === false` 時，預覽可檢視但不可拖曳或寫入。
- 桌面採左右分欄，小畫面改為上下排列，不產生水平溢出。
- 使用既有深色工業 UI 色彩與 Button/Input 元件，不新增依賴。

---

### Task 1: 建立可視化規劃器的回歸測試

**Files:**
- Create: `tests/facilityWiringPlannerExperience.test.mjs`
- Test: `src/components/data-center/DataCenter2DPlanner.tsx`
- Test: `src/components/data-center/DeploymentPlanningCenter.tsx`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url), "utf8");
const workspaceSource = await readFile(new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url), "utf8");

test("facility wiring planning uses an embedded visual preview", () => {
  assert.match(plannerSource, /embedded\\?: boolean/);
  assert.match(plannerSource, /data-testid=\"facility-wiring-preview\"/);
  assert.match(plannerSource, /拖曳通道調整位置/);
  assert.match(workspaceSource, /data-testid=\"facility-wiring-preview\"/);
  assert.match(workspaceSource, /embedded/);
});

test("the facility dialog keeps semantic controls while hiding raw aisle coordinates", () => {
  assert.match(workspaceSource, /距左側/);
  assert.match(workspaceSource, /距上方/);
  assert.match(workspaceSource, /通道長度/);
  assert.match(workspaceSource, /通道寬度/);
  assert.match(workspaceSource, /進階座標/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/facilityWiringPlannerExperience.test.mjs`

Expected: FAIL because the planner has no `embedded` prop and the facility dialog does not mount the visual preview.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/facilityWiringPlannerExperience.test.mjs
git commit -m "test: define visual facility wiring planner"
```

### Task 2: Add embedded visual preview mode

**Files:**
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Test: `tests/facilityWiringPlannerExperience.test.mjs`

- [ ] **Step 1: Add the optional prop and render contract**

```tsx
interface DataCenter2DPlannerProps {
  // existing props
  embedded?: boolean;
}

export function DataCenter2DPlanner({ embedded = false }: DataCenter2DPlannerProps) {
  // existing state and geometry
}
```

Set the SVG contract to `data-testid={embedded ? "facility-wiring-preview" : "data-center-2d-plan"}` and use `aria-label={embedded ? "廠房與佈線可視化配置" : "Data Center 2D 廠房配置圖"}`.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/facilityWiringPlannerExperience.test.mjs`

Expected: the planner contract passes; the workspace contract remains red until the dialog is wired.

- [ ] **Step 3: Hide duplicate full-page actions in embedded mode**

Wrap the existing top action toolbar and full-page-only overflow action in `{embedded ? null : (...)}`. Add this compact embedded instruction strip:

```tsx
{embedded ? (
  <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-cyan-300/20 bg-[#071522]/92 px-3 py-2 text-[11px] font-bold text-cyan-100">
    拖曳通道調整位置・拖曳端點調整尺寸・點選項目查看設定
  </div>
) : null}
```

- [ ] **Step 4: Run tests and lint**

Run: `node --test tests/facilityWiringPlannerExperience.test.mjs tests/dataCenter2DPlanner.test.mjs`

Expected: all planner tests pass.

Run: `npx.cmd eslint src/components/data-center/DataCenter2DPlanner.tsx tests/facilityWiringPlannerExperience.test.mjs`

Expected: exit code 0.

### Task 3: Rebuild the facility dialog around the preview

**Files:**
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Test: `tests/facilityWiringPlannerExperience.test.mjs`

- [ ] **Step 1: Mount the embedded preview with existing callbacks**

Mount `DataCenter2DPlanner` before the right-hand scroll area with `embedded`, `selectedSite.racks`, `models`, `selectedFacility`, `overflowKeys`, `canEdit`, `handleRackSelect`, `placeRackOnPlan`, `rotateRackOnPlan`, `updateAisle`, `removeAisle`, `updatePowerFeed`, `addRackFromCurrentModel`, `removeRackFromPlan`, `openAisleCreation`, `addPowerFeed`, `openModelLibrary("rack")`, and the existing 3D switch callback. The preview must be marked with `data-testid="facility-wiring-preview-shell"`.

- [ ] **Step 2: Use a responsive split layout**

Use a `lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]` shell. Keep the right side scrollable and the mobile layout stacked. Reduce dialog header and section padding so the preview has usable height.

- [ ] **Step 3: Simplify aisle cards**

Keep label editing, cold/hot color, direction, `長度`／`寬度` summary, select action, rotate, and remove. Remove the repeated four-field `left/top/width/depth` grid from each card. The selected aisle editor inside the embedded preview remains the single place for friendly distance and dimension edits; `進階座標` stays collapsed.

- [ ] **Step 4: Simplify PDU rows**

Keep label, color, enabled toggle, and remove. Replace visible `位置 X`／`位置 Z` fields with `在左側預覽拖曳饋線位置`, so the dialog no longer makes raw coordinates the primary workflow.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/facilityWiringPlannerExperience.test.mjs tests/dataCenter2DPlanner.test.mjs tests/dataCenterSceneControls.test.mjs tests/workspaceDialogColorSystem.test.mjs`

Expected: all tests pass.

### Task 4: Verify and publish

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-facility-wiring-planner-design.md`
- Modify: `docs/superpowers/plans/2026-08-09-facility-wiring-planner.md`

- [ ] **Step 1: Run complete verification**

Run: `npx.cmd eslint src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx tests/facilityWiringPlannerExperience.test.mjs`

Run: `git diff --check`

Run: `npm.cmd run build`

Expected: ESLint, diff check, and production build succeed.

- [ ] **Step 2: Commit implementation**

```bash
git add src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx tests/facilityWiringPlannerExperience.test.mjs docs/superpowers/specs/2026-08-09-facility-wiring-planner-design.md docs/superpowers/plans/2026-08-09-facility-wiring-planner.md
git commit -m "feat: rebuild facility wiring planner"
```

- [ ] **Step 3: Push and verify remote main**

Run: `git push origin main`

Run: `git rev-parse HEAD` and `git ls-remote origin refs/heads/main`

Run: `git status --short`

Expected: local HEAD and `origin/main` resolve to the same commit and the working tree is clean.
