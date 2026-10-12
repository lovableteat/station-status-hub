import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url), "utf8");
const machineMetrics = await readFile(new URL("../src/components/dashboard/dashboardMetrics.ts", import.meta.url), "utf8");

test("issue dashboard uses a responsive metric grid and bounded issue and owner summaries", () => {
  assert.match(source, /data-mobile-dashboard-kpis="true" className="grid grid-cols-2/);
  assert.match(source, /pendingIssues\.slice\(0, 8\)/);
  assert.match(source, /ownerRows\.slice\(0, 5\)/);
  assert.match(source, /min-h-11/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /<TableHeader>/);
  assert.doesNotMatch(source, /station-capacity-flow|bottleneckStation|stationRows/);
});

test("machine progress calculations remain available independently of the issue dashboard", () => {
  assert.match(machineMetrics, /export function calculateDashboardMetrics/);
  assert.match(machineMetrics, /bottleneckStation/);
  assert.match(machineMetrics, /stationRows/);
});
