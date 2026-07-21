import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getFacilityAreaSquareMeters,
  normalizeFacilityDimension,
} from "../src/components/data-center/facilityPlan.mjs";

const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("facility dimensions are bounded and expose a readable floor area", () => {
  assert.equal(normalizeFacilityDimension(3), 8);
  assert.equal(normalizeFacilityDimension(24.48), 24.5);
  assert.equal(normalizeFacilityDimension(500), 80);
  assert.equal(normalizeFacilityDimension(Number.NaN, 18), 18);
  assert.equal(getFacilityAreaSquareMeters({ width: 18, depth: 13 }), 234);
});

test("the 3D camera supports close inspection and an explicit detail view", () => {
  assert.match(plannerSource, /minDistance=\{0\.12\}/);
  assert.match(plannerSource, /zoomSpeed=\{0\.96\}/);
  assert.match(plannerSource, /zoomToCursor/);
  assert.match(plannerSource, /onStart=\{\(\) => \{\s*animating\.current = false;/);
  assert.match(workspaceSource, /\["detail",\s*ZoomIn/);
});

test("the overview stays responsive without swapping detailed CAD models on hover", () => {
  assert.match(plannerSource, /const showDetailedModel = selected;/);
  assert.match(plannerSource, /<RackOverviewModel rack=\{rack\}/);
  assert.match(plannerSource, /frameloop="demand"/);
});

test("floor size control is directly visible in the 3D workspace", () => {
  assert.match(workspaceSource, /data-testid="facility-size-button"/);
  assert.match(workspaceSource, /"facility-width-control"/);
  assert.match(workspaceSource, /"facility-depth-control"/);
  assert.match(workspaceSource, /data-testid=\{testId\}/);
});
