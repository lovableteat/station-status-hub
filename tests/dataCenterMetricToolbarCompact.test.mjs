import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);

test("data center header presents metrics as one calm summary strip", () => {
  const summaryStart = source.indexOf('data-testid="data-center-metric-summary"');
  const summaryEnd = source.indexOf('<div className="hidden shrink-0 items-center gap-1.5 sm:flex">', summaryStart);
  const summary = source.slice(summaryStart, summaryEnd);

  assert.match(source, /data-testid="data-center-metric-toolbar"/);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
  assert.match(summary, /divide-x divide-white\/10/);
  assert.match(summary, /label: "設備"/);
  assert.match(summary, /label: "告警"/);
  assert.match(summary, /label: "總功率"/);
  assert.doesNotMatch(summary, /label: "ALERTS"/);
  assert.doesNotMatch(summary, /label: "POWER"/);
  assert.doesNotMatch(summary, /flex h-10 min-w-\[78px\] shrink-0/);
  assert.match(source, /h-10 rounded-lg border-cyan-300\/22/);
  assert.match(source, /lg:h-\[68px\]/);
});
