import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);
const monitor = await readFile(
  new URL("../src/components/production/ProductionMonitor.tsx", import.meta.url),
  "utf8",
);
const index = await readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8");

test("station cards navigate to L10 with station and non-completed filters", () => {
  assert.match(
    dashboard,
    /onNavigate\?\.\("test-tracker",\s*\{\s*station:\s*station\.id,\s*excludeStatus:\s*"completed"\s*\}\)/,
  );
});

test("attention actions target the correct workspaces with automatic filters", () => {
  assert.match(dashboard, /開啟生產看板/);
  assert.match(
    dashboard,
    /onNavigate\?\.\("test-tracker",\s*\{\s*attention:\s*"1",\s*trackerView:\s*"board"\s*\}\)/,
  );
  assert.match(dashboard, /onNavigate\?\.\("test-tracker",\s*\{\s*system:\s*system\.id\s*\}\)/);
});

test("production monitor shows and applies a clearable attention filter without changing KPI counts", () => {
  assert.match(monitor, /attentionFilter/);
  assert.match(monitor, /需關注機台/);
  assert.match(monitor, /setAttentionFilter\(false\)/);
  assert.match(monitor, /attentionSystemIds\.has\(system\.id\)/);
  assert.match(monitor, /\[systemViews\]\s*\);/);
});

test("workspace navigation preserves all automatic filter query keys", () => {
  for (const key of ["attention", "excludeStatus", "sort", "status", "trackerSearch", "engineer"]) {
    assert.match(index, new RegExp(`"${key}"`));
  }
});

test("legacy monitor links are normalized into the merged L10 production board", () => {
  assert.match(index, /module === "monitor" \? "test-tracker" : module/);
  assert.match(index, /trackerView: "board"/);
});

test("deep links are not cleared before database permissions finish loading", () => {
  assert.match(index, /loading:\s*permissionsLoading/);
  assert.match(
    index,
    /if \(permissionsLoading\) return;[\s\S]{0,240}workspaceItems\.some/,
  );
});
