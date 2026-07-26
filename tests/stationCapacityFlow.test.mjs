import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);

test("station capacity is rendered as one ordered, horizontally scrollable process rail", () => {
  assert.match(source, /data-testid="station-capacity-flow"/);
  assert.match(
    source,
    /data-testid="station-capacity-flow"[\s\S]*?className="[^"]*overflow-x-auto[^"]*snap-x[^"]*"/,
  );
  assert.match(source, /<ol[\s\S]*?stationRows\.map/);
  assert.match(source, /<li[\s\S]*?data-station-order=\{station\.order\}/);
  assert.match(source, /第 \{index \+ 1\} 站/);
  assert.match(source, /ChevronRight/);
  assert.doesNotMatch(source, /md:grid-cols-2 2xl:grid-cols-4/);
});

test("station capacity marks the beginning, end, and active bottleneck", () => {
  assert.match(source, /\{index === 0 && "起點"\}/);
  assert.match(source, /\{index === stationRows\.length - 1 && "終點"\}/);
  assert.match(source, /\{isBottleneck && "瓶頸"\}/);
});
