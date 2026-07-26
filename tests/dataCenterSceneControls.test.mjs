import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getFacilityAreaSquareMeters,
  normalizeFacilityDimension,
} from "../src/components/data-center/facilityPlan.mjs";
import {
  getRackOverviewFrame,
  getSafeOrbitDistance,
} from "../src/components/data-center/cameraFraming.mjs";

const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("facility dimensions have a safe minimum, no fixed maximum, and expose a readable floor area", () => {
  assert.equal(normalizeFacilityDimension(0.5), 1);
  assert.equal(normalizeFacilityDimension(24.48), 24.5);
  assert.equal(normalizeFacilityDimension(500), 500);
  assert.equal(normalizeFacilityDimension(Number.NaN, 18), 18);
  assert.equal(getFacilityAreaSquareMeters({ width: 18, depth: 13 }), 234);
});

test("the 3D camera supports close inspection without entering the selected rack", () => {
  const minimumDistance = getSafeOrbitDistance({
    widthMeters: 0.7,
    heightMeters: 2.3,
    depthMeters: 1.1,
  });
  const rackRadius = Math.hypot(0.7, 2.3, 1.1) / 2;

  assert.ok(minimumDistance > rackRadius);
  assert.ok(minimumDistance < 2);
  assert.match(plannerSource, /minDistance=\{minimumOrbitDistance\}/);
  assert.doesNotMatch(plannerSource, /minDistance=\{0\.12\}/);
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

test("the overview frames rack content instead of the full facility floor", () => {
  const frame = getRackOverviewFrame([
    {
      positionX: 0,
      positionZ: 0,
      rotationDegrees: 0,
      widthMeters: 0.7,
      heightMeters: 2.3,
      depthMeters: 1.1,
    },
  ]);

  assert.ok(frame);
  assert.deepEqual(frame.target, [0, 1.15, 0]);
  assert.ok(frame.distance >= 5.5);
  assert.ok(frame.distance < 8);

  const spreadFrame = getRackOverviewFrame([
    {
      positionX: -8,
      positionZ: -2,
      rotationDegrees: 0,
      widthMeters: 0.7,
      heightMeters: 2.3,
      depthMeters: 1.1,
    },
    {
      positionX: 10,
      positionZ: 4,
      rotationDegrees: 90,
      widthMeters: 0.7,
      heightMeters: 2.3,
      depthMeters: 1.1,
    },
  ]);

  assert.ok(spreadFrame);
  assert.ok(spreadFrame.distance > frame.distance);
  assert.ok(spreadFrame.target[0] > 0);
  assert.match(plannerSource, /getRackOverviewFrame/);
  assert.doesNotMatch(
    plannerSource,
    /desiredPosition\.current\.set\(span \* 0\.72, Math\.max\(7, span \* 0\.46\), span \* 0\.82\)/,
  );
});

test("rack status cards stay close enough to the model to remain visible at maximum zoom", () => {
  assert.match(
    plannerSource,
    /position=\{\[0, height \+ \(selected \? 0\.16 : 0\.24\), 0\]\}/,
  );
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

test("facility size inputs keep editable drafts and expose overflow warnings", () => {
  assert.match(workspaceSource, /facilitySizeDraft/);
  assert.match(workspaceSource, /commitFacilityDimension/);
  assert.match(workspaceSource, /onBlur=\{\(\) => commitFacilityDimension\(field\)\}/);
  assert.match(workspaceSource, /min=\{1\}/);
  assert.doesNotMatch(workspaceSource, /max=\{80\}/);
  assert.match(workspaceSource, /role="alert"/);
  assert.match(workspaceSource, /overflowItems\.length/);
  assert.match(workspaceSource, /overflowKeys=\{overflowKeys\}/);
});

test("the overview applies a stable exposure and balanced fill lighting", () => {
  assert.match(plannerSource, /toneMappingExposure\s*=\s*1\.85/);
  assert.match(plannerSource, /ambientLight intensity=\{1\.55\}/);
  assert.match(plannerSource, /hemisphereLight intensity=\{1\.85\}/);
  assert.match(plannerSource, /directionalLight[\s\S]*?position=\{\[-8, 8, -4\]\}/);
});
