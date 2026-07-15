import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);
const typesSource = await readFile(
  new URL("../src/components/data-center/dataCenterTypes.ts", import.meta.url),
  "utf8",
);

test("data center uses an open floor without four perimeter walls", () => {
  assert.doesNotMatch(plannerSource, /facility\.showWalls/);
  assert.doesNotMatch(plannerSource, /wallWallHeight/);
  assert.doesNotMatch(workspaceSource, /\["wallHeight",\s*"牆高"\]/);
  assert.doesNotMatch(workspaceSource, /\["showWalls",\s*"顯示牆體"\]/);
  assert.doesNotMatch(workspaceSource, /牆體/);
  assert.match(typesSource, /showWalls:\s*false/);
});
