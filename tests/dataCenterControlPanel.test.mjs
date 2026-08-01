import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/data-center/DeploymentPlanningCenter.tsx", "utf8");

test("Data Center replaces the ambiguous scene navigator with one consolidated control panel", () => {
  assert.match(source, /data-testid="data-center-control-panel"/);
  assert.match(source, /data-testid="data-center-scene-summary"/);
  assert.match(source, /data-testid="data-center-layer-control"/);
  assert.match(source, /場景總覽/);
  assert.match(source, /專案與分類/);
  assert.match(source, /視圖模式/);
  assert.match(source, /機櫃清單/);
  assert.match(source, /getDataCenterProjectStats\(selectedProject/);
  assert.doesNotMatch(source, />場景導覽</);
});
