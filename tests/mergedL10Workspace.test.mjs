import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tracker = await readFile(
  new URL("../src/components/test-tracker/TestTracker.tsx", import.meta.url),
  "utf8",
);
const monitor = await readFile(
  new URL("../src/components/production/ProductionMonitor.tsx", import.meta.url),
  "utf8",
);
const sidebar = await readFile(
  new URL("../src/components/layout/Sidebar.tsx", import.meta.url),
  "utf8",
);

test("L10 exposes list and production board as display modes in one workspace", () => {
  assert.match(tracker, /aria-label="L10 顯示方式"/);
  assert.match(tracker, />列表/);
  assert.match(tracker, />生產看板/);
  assert.match(tracker, /<ProductionMonitor[\s\S]*embedded/);
});

test("the embedded production board consumes the tracker data and filters", () => {
  for (const prop of [
    "systemsOverride={filteredSystems}",
    "stationsOverride={displayStations}",
    "testItemsOverride={displayItems}",
    "progressOverride={progress}",
    "stationFilterOverride={selectedStation?.id ?? \"all\"}",
  ]) {
    assert.ok(tracker.includes(prop), `missing shared board property: ${prop}`);
  }
  assert.match(monitor, /embedded \? "space-y-2" : "maintenance-page space-y-3"/);
});

test("the sidebar has one L10 entry and no separate production monitor entry", () => {
  assert.equal((sidebar.match(/label: "L10 測試追蹤"/g) ?? []).length, 1);
  assert.doesNotMatch(sidebar, /label: "生產監控牆"/);
});
