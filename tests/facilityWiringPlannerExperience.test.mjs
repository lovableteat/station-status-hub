import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("facility settings delegates visual placement to the main 2D planner", () => {
  assert.doesNotMatch(plannerSource, /embedded\?: boolean/);
  assert.doesNotMatch(workspaceSource, /data-testid="facility-wiring-preview-shell"/);
  assert.match(workspaceSource, /廠房與佈線設定/);
  assert.match(workspaceSource, /前往 2D 規劃/);
  assert.match(
    workspaceSource,
    /setFacilityPlannerOpen\(false\)[\s\S]*setWorkspaceMode\("2d"\)/,
  );
});

test("the facility dialog keeps semantic controls while hiding raw aisle coordinates", () => {
  assert.match(plannerSource, /距左側/);
  assert.match(plannerSource, /距上方/);
  assert.match(plannerSource, /通道長度/);
  assert.match(plannerSource, /通道寬度/);
  assert.match(workspaceSource, /位置請到 2D 規劃直接拖曳/);
  assert.match(plannerSource, /進階座標/);
});
