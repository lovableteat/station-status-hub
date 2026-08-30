import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);

test("station capacity stacks on phones and keeps the desktop process rail", () => {
  assert.match(source, /data-testid="station-capacity-flow"/);
  assert.match(
    source,
    /data-testid="station-capacity-flow"[\s\S]*?className="pb-3 lg:overflow-x-auto lg:snap-x lg:snap-mandatory"/,
  );
  assert.match(source, /<ol className="grid gap-2 items-stretch lg:flex lg:min-w-max"/);
  assert.match(source, /className="absolute right-1 top-1\/2 hidden w-8/);
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
