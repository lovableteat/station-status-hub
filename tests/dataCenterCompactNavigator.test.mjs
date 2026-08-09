import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("keeps the scene navigator compact by using one control strip and a shorter mobile dialog", () => {
  assert.match(source, /data-testid="data-center-control-strip"/);
  assert.match(source, /data-testid="data-center-rack-search"/);
  assert.match(source, /h-\[min\(76dvh,640px\)\]/);
  assert.doesNotMatch(source, /workspace-dialog-section workspace-dialog-section--violet rounded-\[18px\]/);
  assert.doesNotMatch(source, /workspace-dialog-section workspace-dialog-section--success block rounded-\[18px\]/);
});
