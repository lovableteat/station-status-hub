import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tracker = await readFile(
  new URL("../src/components/test-tracker/TestTracker.tsx", import.meta.url),
  "utf8",
);
const table = await readFile(
  new URL("../src/components/test-tracker/TestProgressTable.tsx", import.meta.url),
  "utf8",
);
const filters = await readFile(
  new URL("../src/components/test-tracker/testTrackerFilters.ts", import.meta.url),
  "utf8",
);

test("L10 exposes a persistent filter toolbar with sorting and visible active filters", () => {
  assert.match(tracker, /data-testid="test-tracker-filter-toolbar"/);
  assert.match(tracker, /機台 ID：小到大/);
  assert.match(tracker, /建立時間：新到舊/);
  assert.match(tracker, /data-testid="test-tracker-active-filters"/);
  assert.match(tracker, /excludeStatus/);
  assert.doesNotMatch(tracker, /控制項收在這裡/);
});

test("mobile L10 project actions stay in one compact row", () => {
  assert.match(tracker, /data-mobile-test-tracker-actions="true"/);
  assert.match(tracker, /grid-cols-4/);
  assert.match(tracker, /max-sm:\[&_button_svg\]:hidden/);
});

test("board view uses the complete production monitor lanes instead of current-station-only filtering", () => {
  assert.match(tracker, /<ProductionMonitor/);
  assert.match(tracker, /stationsOverride=\{displayStations\}/);
  assert.doesNotMatch(tracker, /filteredSystems\.filter\(\s*\(system\) => system\.current_station === station\.station_name/);
  assert.match(filters, /待開始/);
  assert.match(filters, /未對應站點/);
});

test("empty desktop result retains tracker table header and exact guidance", () => {
  assert.match(table, /data-testid="test-tracker-empty-row"/);
  assert.match(table, /目前篩選條件沒有符合的機台/);
  assert.match(table, /data-testid="test-tracker-empty-message"[\s\S]*sticky left-0/);
  assert.doesNotMatch(table, /if \(!systems\.length\) \{\s*return \(/);
});
