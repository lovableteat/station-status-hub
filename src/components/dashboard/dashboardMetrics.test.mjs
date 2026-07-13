import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let metrics = {};

try {
  const sourceUrl = new URL("./dashboardMetrics.ts", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  metrics = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
} catch {
  metrics = {};
}

test("station summary separates total, fully completed, and still processing machines", () => {
  assert.equal(typeof metrics.calculateDashboardMetrics, "function");

  const result = metrics.calculateDashboardMetrics({
    now: new Date("2026-07-14T12:00:00+08:00"),
    systems: [
      { id: "complete" },
      { id: "partial" },
      { id: "waiting" },
      { id: "excluded", exclude_from_dashboard: true },
    ],
    stations: [
      { id: "station-0", station_name: "Station 0 - 工廠組裝", station_order: 0 },
    ],
    testItems: [
      { id: "assembly", station_id: "station-0", estimated_minutes: 30 },
      { id: "inspection", station_id: "station-0", estimated_minutes: 30 },
    ],
    progress: [
      { id: "p1", system_id: "complete", station_id: "station-0", item_id: "assembly", status: "Done" },
      { id: "p2", system_id: "complete", station_id: "station-0", item_id: "inspection", status: "Done" },
      { id: "p3", system_id: "partial", station_id: "station-0", item_id: "assembly", status: "Done" },
      { id: "p4", system_id: "partial", station_id: "station-0", item_id: "inspection", status: "In Progress" },
      { id: "p5", system_id: "excluded", station_id: "station-0", item_id: "assembly", status: "Done" },
      { id: "p6", system_id: "excluded", station_id: "station-0", item_id: "inspection", status: "Done" },
    ],
  });

  assert.deepEqual(
    {
      completedSystems: result.stationRows[0].completedSystems,
      incompleteSystems: result.stationRows[0].incompleteSystems,
      totalSystems: result.stationRows[0].totalSystems,
    },
    {
      completedSystems: 1,
      incompleteSystems: 2,
      totalSystems: 3,
    },
  );
});
