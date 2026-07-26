import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [planner2DSource, planner3DSource] = await Promise.all([
  readFile(
    new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  ),
]);

test("the 2D data-center plan renders a dedicated lighting layer", () => {
  assert.match(planner2DSource, /id="dc-floor-lighting"/);
  assert.match(planner2DSource, /id="dc-overhead-light"/);
  assert.match(planner2DSource, /data-testid="data-center-lighting-layer"/);
  assert.match(planner2DSource, /fill="url\(#dc-floor-lighting\)"/);
});

test("rack health drives visible 2D status lighting", () => {
  assert.match(planner2DSource, /function getRackPlanLighting/);
  assert.match(planner2DSource, /dc-rack-glow-healthy/);
  assert.match(planner2DSource, /dc-rack-glow-warning/);
  assert.match(planner2DSource, /dc-rack-glow-critical/);
  assert.match(planner2DSource, /data-testid=\{`data-center-rack-glow-\$\{rack\.id\}`\}/);
});

test("the 3D view retains balanced fill and exposure lighting", () => {
  assert.match(planner3DSource, /hemisphereLight intensity=\{1\.85\}/);
  assert.match(planner3DSource, /toneMappingExposure\s*=\s*1\.85/);
});
