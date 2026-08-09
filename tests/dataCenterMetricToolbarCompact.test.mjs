import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("data center header uses one compact responsive metric toolbar", () => {
  assert.match(source, /data-testid="data-center-metric-toolbar"/);
  assert.match(source, /data-testid="data-center-metric-toolbar"[\s\S]*?overflow-x-auto/);
  assert.match(source, /flex h-10 min-w-\[78px\] shrink-0/);
  assert.match(source, /h-10 rounded-lg border-cyan-300\/22/);
  assert.match(source, /lg:h-\[68px\]/);
});
