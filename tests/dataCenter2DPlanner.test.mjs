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
  assert.match(workspaceSource, /onMoveRack=\{placeRackOnPlan\}/);
  assert.match(workspaceSource, /onMoveAisle=\{\(aisleId, x, z\) => updateAisle/);
  assert.match(workspaceSource, /onMovePowerFeed=\{\(feedId, x, z\) => updatePowerFeed/);
});

test("2D planning exposes working entry points for every planning task", () => {
  assert.match(plannerSource, /onClick=\{onOpenModels\}/);
  assert.match(plannerSource, /onClick=\{\(\) => onAddAisle\("cold"\)\}/);
  assert.match(plannerSource, /onClick=\{\(\) => onAddAisle\("hot"\)\}/);
  assert.match(plannerSource, /onClick=\{onAddPowerFeed\}/);
  assert.match(plannerSource, /onClick=\{onOpenFacilitySettings\}/);
  assert.match(plannerSource, /onClick=\{onView3D\}/);
  assert.match(workspaceSource, /data-testid="data-center-simple-toolbar"/);
  assert.match(workspaceSource, /setWorkspaceMode\("2d"\)/);
  assert.match(workspaceSource, /setWorkspaceMode\("3d"\)/);
});
