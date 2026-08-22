import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrackerBoardLanes,
  createStationIncompleteSystemIds,
  filterAndSortTrackerSystems,
  parseTrackerAutoFilters,
} from "../src/components/test-tracker/testTrackerFilters.ts";

const systems = [
  { id: "2", system_name: "GB300-10", current_station: "Station 1", created_at: "2026-08-20T00:00:00Z", overall_progress: 25, status: "On-going" },
  { id: "1", system_name: "GB300-2", current_station: "Station 1", created_at: "2026-08-22T00:00:00Z", overall_progress: 15, status: "On-going" },
  { id: "4", system_name: "GB300-1", current_station: null, created_at: "2026-08-21T00:00:00Z", overall_progress: 0, status: "Not Start" },
  { id: "3", system_name: "GB300-3", current_station: "已完成", created_at: "2026-08-19T00:00:00Z", overall_progress: 100, status: "Done" },
  { id: "5", system_name: "GB300-11", current_station: "Legacy Station", created_at: "2026-08-18T00:00:00Z", overall_progress: 50, status: "On-going" },
];

test("parses dashboard auto filters from query parameters", () => {
  const params = new URLSearchParams("station=station-1&system=GB300-2&excludeStatus=completed");
  assert.deepEqual(parseTrackerAutoFilters(params), {
    excludeCompleted: true,
    station: "station-1",
    system: "GB300-2",
  });
});

test("sorts machine ids naturally in both directions", () => {
  const ascending = filterAndSortTrackerSystems(systems, { sort: "machine-asc" });
  assert.deepEqual(ascending.map((system) => system.system_name), [
    "GB300-1",
    "GB300-2",
    "GB300-3",
    "GB300-10",
    "GB300-11",
  ]);

  const descending = filterAndSortTrackerSystems(systems, { sort: "machine-desc" });
  assert.deepEqual(descending.map((system) => system.system_name), [
    "GB300-11",
    "GB300-10",
    "GB300-3",
    "GB300-2",
    "GB300-1",
  ]);
});

test("sorts by creation time and can exclude completed systems", () => {
  const sorted = filterAndSortTrackerSystems(systems, {
    excludeCompleted: true,
    sort: "created-desc",
  });
  assert.deepEqual(sorted.map((system) => system.id), ["1", "4", "2", "5"]);
});

test("station filters ignore repeated whitespace from legacy station names", () => {
  const filtered = filterAndSortTrackerSystems(systems, {
    station: "Station  1",
  });

  assert.deepEqual(filtered.map((system) => system.id), ["1", "2"]);
});

test("station auto filters use item progress instead of the stale current_station cache", () => {
  const stationItems = [
    { id: "item-1", station_id: "station-1" },
    { id: "item-2", station_id: "station-1" },
  ];
  const progress = [
    { id: "p1", system_id: "1", item_id: "item-1", status: "Done", updated_at: "2026-08-20T00:00:00Z" },
    { id: "p2", system_id: "1", item_id: "item-2", status: "Done", updated_at: "2026-08-20T00:00:00Z" },
    { id: "p3", system_id: "2", item_id: "item-1", status: "Done", updated_at: "2026-08-20T00:00:00Z" },
    { id: "p4", system_id: "2", item_id: "item-2", status: "Error", updated_at: "2026-08-20T00:00:00Z" },
  ];

  assert.deepEqual(
    [...createStationIncompleteSystemIds(systems.slice(0, 2), "station-1", stationItems, progress)],
    ["2"],
  );
});

test("board lanes contain every filtered system exactly once", () => {
  const lanes = buildTrackerBoardLanes(
    [
      { id: "station-1", station_name: "Station 1", station_order: 1 },
      { id: "station-2", station_name: "Station 2", station_order: 2 },
    ],
    systems,
  );

  assert.deepEqual(lanes.map((lane) => lane.label), [
    "待開始",
    "Station 1",
    "Station 2",
    "已完成",
    "未對應站點",
  ]);
  assert.deepEqual(lanes.flatMap((lane) => lane.systems.map((system) => system.id)), [
    "4",
    "2",
    "1",
    "3",
    "5",
  ]);
});

test("board lanes match station names with legacy repeated whitespace", () => {
  const lanes = buildTrackerBoardLanes(
    [{ id: "station-1", station_name: "Station  1", station_order: 1 }],
    systems.slice(0, 2),
  );

  assert.deepEqual(lanes.find((lane) => lane.stationId === "station-1")?.systems.map((system) => system.id), ["2", "1"]);
});
