import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [plannerSource, workspaceSource, indexSource] = await Promise.all([
  readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8"),
]);

test("L10 models keep one rack-unit height while fitting the rack width", () => {
  assert.match(plannerSource, /const fittedHeight = modelHeight;/);
  assert.match(plannerSource, /scale=\{\[fitScale,\s*1,\s*fitScale\]\}/);
  assert.match(plannerSource, /getModelAxisRotation/);
  assert.match(plannerSource, /desiredHeight\s*\/\s*size\.y/);
});

test("mobile Data-center fills the dynamic viewport and exposes primary controls", () => {
  assert.match(indexSource, /activeWorkspace === "data-center"[\s\S]*?h-\[100dvh\]/);
  assert.match(plannerSource, /relative h-full w-full min-h-0 min-w-0 flex-1/);
  assert.match(workspaceSource, /data-testid="data-center-mobile-dock"/);
  assert.match(workspaceSource, /id:\s*"scene"/);
  assert.match(workspaceSource, /id:\s*"details"/);
  assert.match(workspaceSource, /id:\s*"models"/);
  assert.match(workspaceSource, /id:\s*"focus"/);
  assert.match(workspaceSource, /data-action=\{action\.id\}/);
  assert.match(workspaceSource, /setMobileLeftOpen\(false\)/);
});

test("the 3D canvas supports direct touch rotation and two-finger zoom/pan", () => {
  assert.match(plannerSource, /touchAction:\s*"none"/);
  assert.match(plannerSource, /ONE:\s*THREE\.TOUCH\.ROTATE/);
  assert.match(plannerSource, /TWO:\s*THREE\.TOUCH\.DOLLY_PAN/);
  assert.match(workspaceSource, /data-testid="data-center-touch-help"/);
});
