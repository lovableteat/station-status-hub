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
  assert.match(plannerSource, /minDistance=\{0\.45\}/);
  assert.match(plannerSource, /zoomSpeed=\{1\.15\}/);
  assert.match(workspaceSource, /\["detail",\s*ZoomIn/);
});

test("floor size control is directly visible in the 3D workspace", () => {
  assert.match(workspaceSource, /data-testid="facility-size-button"/);
  assert.match(workspaceSource, /"facility-width-control"/);
  assert.match(workspaceSource, /"facility-depth-control"/);
  assert.match(workspaceSource, /data-testid=\{testId\}/);
});
