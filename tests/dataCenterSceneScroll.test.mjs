import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "src/components/data-center/DeploymentPlanningCenter.tsx"),
  "utf8",
);

test("mobile scene overview gives the entire navigator one scroll region", () => {
  assert.match(source, /scrollMode\?:\s*"contained"\s*\|\s*"page"/);
  assert.match(source, /data-testid="mobile-scene-scroll-region"/);
  assert.match(source, /<SceneNavigator\s+\{\.\.\.navigatorProps\}\s+scrollMode="page"\s*\/>/);
  assert.match(source, /overflow-y-auto overscroll-contain/);
});
