import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("guides rack setup with compact L10 and device steps", () => {
  assert.match(source, /data-testid="data-center-l10-step"/);
  assert.match(source, /data-testid="data-center-l10-auto-place"/);
  assert.match(source, /data-testid="data-center-device-step"/);
  assert.match(source, /data-testid="data-center-device-list"/);
  assert.match(source, /選擇 U 位可移動設備/);
  assert.doesNotMatch(source, /mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3/);
});
