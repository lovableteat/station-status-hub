import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [plannerSource, workspaceSource, creationDialogSource] = await Promise.all([
  readFile(
    new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/FacilityAisleCreationDialog.tsx", import.meta.url),
    "utf8",
  ),
]);

test("2D planning edits the same rack and facility coordinates used by 3D", () => {
  assert.match(plannerSource, /data-testid="data-center-2d-plan"/);
  assert.match(plannerSource, /onMoveRack\(rack\.id, x, z\)/);
  assert.match(plannerSource, /onMoveAisle\(aisle\.id, x, z\)/);
  assert.match(plannerSource, /onMovePowerFeed\(dragging\.id, x, z\)/);
  assert.match(plannerSource, /onRotateRack\(selectedRack\.id\)/);
  assert.match(plannerSource, /onClick=\{onAddRack\}/);
  assert.match(plannerSource, /onClick=\{\(\) => onDeleteRack\(selectedRack\.id\)\}/);
  assert.match(workspaceSource, /onMoveRack=\{placeRackOnPlan\}/);
  assert.match(workspaceSource, /onAddRack=\{addRackFromCurrentModel\}/);
  assert.match(workspaceSource, /onDeleteRack=\{removeRackFromPlan\}/);
  assert.match(workspaceSource, /onMoveAisle=\{\(aisleId, x, z\) => updateAisle/);
  assert.match(workspaceSource, /onDeleteAisle=\{removeAisle\}/);
  assert.match(workspaceSource, /onMovePowerFeed=\{\(feedId, x, z\) => updatePowerFeed/);
});

test("2D planning exposes working entry points for every planning task", () => {
  assert.match(plannerSource, /新增機櫃/);
  assert.match(plannerSource, /刪除機櫃/);
  assert.match(plannerSource, /onClick=\{onOpenModels\}/);
  assert.match(plannerSource, /onClick=\{onOpenAisleCreation\}/);
  assert.match(plannerSource, /新增通道/);
  assert.match(plannerSource, /onClick=\{onAddPowerFeed\}/);
  assert.match(plannerSource, /onClick=\{onOpenFacilitySettings\}/);
  assert.match(plannerSource, /onClick=\{onView3D\}/);
  assert.match(workspaceSource, /data-testid="data-center-simple-toolbar"/);
  assert.match(workspaceSource, /setWorkspaceMode\("2d"\)/);
  assert.match(workspaceSource, /setWorkspaceMode\("3d"\)/);
});

test("cold and hot aisles support automatic or free horizontal and vertical creation", () => {
  assert.match(creationDialogSource, /自動畫通道/);
  assert.match(creationDialogSource, /自由配置/);
  assert.match(creationDialogSource, /id: "cold"/);
  assert.match(creationDialogSource, /id: "hot"/);
  assert.match(creationDialogSource, /id: "horizontal"/);
  assert.match(creationDialogSource, /id: "vertical"/);
  assert.match(creationDialogSource, /draft\.rackIds\.length/);
  assert.match(creationDialogSource, /自動配置至少需要選擇一座機櫃/);
  assert.match(workspaceSource, /request\.mode === "automatic"/);
});

test("rack instance deletion keeps the shared scene valid", () => {
  assert.match(workspaceSource, /selectedSite\.racks\.length <= 1/);
  assert.match(workspaceSource, /racks: remainingRacks/);
  assert.match(workspaceSource, /setSelectedRackId\(nextRack\.id\)/);
  assert.match(workspaceSource, /findAvailableRackPosition\(baseRack\)/);
});

test("2D planning owns wheel zoom instead of zooming the browser page", () => {
  assert.match(plannerSource, /addEventListener\("wheel"/);
  assert.match(plannerSource, /\{ passive: false \}/);
  assert.match(plannerSource, /event\.preventDefault\(\)/);
  assert.match(plannerSource, /setViewport/);
  assert.match(plannerSource, /放大 2D 配置/);
  assert.match(plannerSource, /縮小 2D 配置/);
  assert.match(plannerSource, /重設 2D 視圖/);
  assert.match(plannerSource, /touchAction:\s*"none"/);
});

test("cold and hot aisle dimensions can be edited from the selected aisle panel", () => {
  assert.match(plannerSource, /onUpdateAisle/);
  assert.match(plannerSource, /通道長度/);
  assert.match(plannerSource, /通道寬度/);
  assert.match(plannerSource, /selectedAisleId/);
  assert.match(workspaceSource, /onUpdateAisle=\{\(aisleId, patch\)/);
});

test("a selected cold or hot aisle can be deleted from the 2D plan", () => {
  assert.match(plannerSource, /onDeleteAisle/);
  assert.match(plannerSource, /刪除通道/);
  assert.match(plannerSource, /onDeleteAisle\(selectedAisle\.id\)/);
  assert.match(plannerSource, /setSelectedAisleId\(null\)/);
  assert.match(plannerSource, /data-testid="selected-aisle-toolbar"/);
  assert.match(plannerSource, /aria-label=\{`刪除\$\{selectedAisle\.label\}`\}/);
});

test("overflowing plan items are visibly warned without moving them", () => {
  assert.match(plannerSource, /overflowKeys/);
  assert.match(plannerSource, /data-overflow=\{aisleOverflow/);
  assert.match(plannerSource, /data-overflow=\{rackOverflow/);
  assert.match(plannerSource, /data-overflow=\{powerOverflow/);
  assert.match(plannerSource, /超出廠房範圍/);
});

test("aisles are created visually and resized directly on the plan", () => {
  assert.match(workspaceSource, /FacilityAisleCreationDialog/);
  assert.match(workspaceSource, /createAutomaticAisle/);
  assert.match(workspaceSource, /createFreeAisle/);
  assert.match(plannerSource, /getAisleResizeHandles/);
  assert.match(plannerSource, /resizeAisleFromHandle/);
  assert.match(plannerSource, /data-aisle-handles=\{aisle\.id\}/);
  assert.match(plannerSource, /data-aisle-resize-handle=/);
  assert.doesNotMatch(plannerSource, /onPointerLeave=/);
  assert.match(plannerSource, /beginAisleResize/);
  assert.match(plannerSource, /距左側/);
  assert.match(plannerSource, /距上方/);
  assert.match(plannerSource, /進階座標/);
});
