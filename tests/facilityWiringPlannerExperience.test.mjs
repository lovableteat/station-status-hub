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

test("facility wiring planning uses an embedded visual preview", () => {
  assert.match(plannerSource, /embedded\?: boolean/);
  assert.match(plannerSource, /data-testid=\{embedded \? "facility-wiring-preview"/);
  assert.match(plannerSource, /拖曳通道調整位置/);
  assert.match(workspaceSource, /data-testid="facility-wiring-preview-shell"/);
  assert.match(workspaceSource, /embedded/);
});

test("the facility dialog keeps semantic controls while hiding raw aisle coordinates", () => {
  assert.match(plannerSource, /距左側/);
  assert.match(plannerSource, /距上方/);
  assert.match(plannerSource, /通道長度/);
  assert.match(plannerSource, /通道寬度/);
  assert.match(workspaceSource, /在左側預覽拖曳饋線位置/);
  assert.match(plannerSource, /進階座標/);
});
