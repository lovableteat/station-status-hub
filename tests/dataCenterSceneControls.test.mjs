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
  assert.match(plannerSource, /zoomSpeed=\{1\.12\}/);
  assert.match(plannerSource, /zoomToCursor/);
  assert.match(plannerSource, /onStart=\{beginInteraction\}/);
  assert.match(plannerSource, /const lastAppliedRequestId = useRef<number \| null>\(null\)/);
  assert.match(plannerSource, /if \(lastAppliedRequestId\.current === requestId\) return;/);
  assert.match(
    plannerSource,
    /const beginInteraction = useCallback\(\(\) => \{[\s\S]*?animating\.current = false;/,
  );
  assert.match(plannerSource, /const rackRadius = Math\.hypot\(rackWidth, rackHeight, rackDepth\) \/ 2;/);
  assert.match(plannerSource, /Math\.max\(5, fitDistance \* 1\.32\)/);
  assert.match(workspaceSource, /onClick=\{\(\) => requestCamera\("focus"\)\}/);
});

test("the overview renders the assigned GLB instead of replacing it with a generic rack", () => {
  assert.doesNotMatch(plannerSource, /definition\.scenePresentation/);
  assert.match(plannerSource, /definition\.source === "step" && definition\.stepModel/);
  assert.match(
    plannerSource,
    /<GlbRackModel[\s\S]*?definition=\{definition\}[\s\S]*?lowDetail=\{lowDetail\}/,
  );
  assert.match(plannerSource, /<ProceduralRackModel definition=\{definition\}/);
  assert.match(plannerSource, /detailed=\{selected\}/);
  assert.doesNotMatch(plannerSource, /const showDetailedModel/);
  assert.doesNotMatch(plannerSource, /lowDetail \|\| !selected/);
  assert.match(plannerSource, /frameloop="demand"/);
});

test("floor size control is directly visible in the 3D workspace", () => {
  assert.match(workspaceSource, /data-testid="facility-size-button"/);
  assert.match(workspaceSource, /"facility-width-control"/);
  assert.match(workspaceSource, /"facility-depth-control"/);
  assert.match(workspaceSource, /data-testid=\{testId\}/);
});

test("the overview applies a stable exposure and balanced fill lighting", () => {
  assert.match(plannerSource, /toneMappingExposure\s*=\s*1\.22/);
  assert.match(plannerSource, /ambientLight intensity=\{0\.82\}/);
  assert.match(plannerSource, /hemisphereLight intensity=\{1\.05\}/);
  assert.match(plannerSource, /directionalLight[\s\S]*?position=\{\[-8, 6, -4\]\}/);
});
