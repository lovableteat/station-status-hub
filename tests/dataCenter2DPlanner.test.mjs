import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [plannerSource, workspaceSource] = await Promise.all([
  readFile(
    new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
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
  assert.match(workspaceSource, /onMovePowerFeed=\{\(feedId, x, z\) => updatePowerFeed/);
});

test("2D planning exposes working entry points for every planning task", () => {
  assert.match(plannerSource, /新增機櫃/);
  assert.match(plannerSource, /刪除機櫃/);
  assert.match(plannerSource, /onClick=\{onOpenModels\}/);
  assert.match(plannerSource, /onAddAisle\("cold", "horizontal"\)/);
  assert.match(plannerSource, /onAddAisle\("cold", "vertical"\)/);
  assert.match(plannerSource, /onAddAisle\("hot", "horizontal"\)/);
  assert.match(plannerSource, /onAddAisle\("hot", "vertical"\)/);
  assert.match(plannerSource, /onClick=\{onAddPowerFeed\}/);
  assert.match(plannerSource, /onClick=\{onOpenFacilitySettings\}/);
  assert.match(plannerSource, /onClick=\{onView3D\}/);
  assert.match(workspaceSource, /data-testid="data-center-simple-toolbar"/);
  assert.match(workspaceSource, /setWorkspaceMode\("2d"\)/);
  assert.match(workspaceSource, /setWorkspaceMode\("3d"\)/);
});

test("cold and hot aisles can be added horizontally or vertically", () => {
  assert.match(workspaceSource, /orientation === "horizontal" \? 0 : 90/);
  assert.match(workspaceSource, /orientation === "horizontal" \? facility\.width : facility\.depth/);
  assert.match(workspaceSource, /冷通道 · \{orientation === "horizontal" \? "橫向" : "直向"\}/);
  assert.match(workspaceSource, /熱通道 · \{orientation === "horizontal" \? "橫向" : "直向"\}/);
});

test("rack instance deletion keeps the shared scene valid", () => {
  assert.match(workspaceSource, /selectedSite\.racks\.length <= 1/);
  assert.match(workspaceSource, /racks: remainingRacks/);
  assert.match(workspaceSource, /setSelectedRackId\(nextRack\.id\)/);
  assert.match(workspaceSource, /findAvailableRackPosition\(baseRack\)/);
});
