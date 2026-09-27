import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("performance chart grade labels use the readable text token", async () => {
  const [styles, chart] = await Promise.all([
    readFile(new URL("../src/components/performance/performance-bright.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/performance/PerformanceCharts.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(styles, /\.rd2-bright \.recharts-cartesian-axis-tick text\s*\{\s*fill:\s*var\(--rd2-ink\);/);
  assert.match(chart, /tick=\{\{[^}]*fontSize:\s*14/);
});
