import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
  import.meta.url
);
const presentationUrl = new URL(
  "../src/components/test-tracker/testTrackerPresentation.ts",
  import.meta.url
);

test("machine id cells keep a full-height visible hit area", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const cellStart = source.indexOf('data-testid={`machine-cell-${system.id}`}');
  const serialStart = source.indexOf('<div role="cell" className="truncate font-data', cellStart);

  assert.notEqual(cellStart, -1, "machine cell needs a stable test id");
  assert.notEqual(serialStart, -1, "machine cell block could not be isolated");

  const machineCell = source.slice(cellStart, serialStart);
  assert.match(machineCell, /h-full/);
  assert.match(machineCell, /items-stretch/);
  assert.match(
    machineCell,
    /className="flex h-full w-full min-w-0 flex-col items-start justify-center overflow-hidden text-left"/
  );
  assert.match(machineCell, /onClick=\{\(\) => onEditSystemData\(system\.id\)\}/);
  assert.doesNotMatch(machineCell, /className="w-full min-w-0 py-2 text-left"/);
});

test("tracker column header has enough vertical breathing room", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /className="sticky top-0 z-20 grid h-11 items-center/,
  );
  assert.doesNotMatch(
    source,
    /className="sticky top-0 z-20 grid h-9 items-center/,
  );
});

test("tracker table exposes consistent visual regions without changing row actions", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /data-ui="tracker-table"/);
  assert.match(source, /data-ui="tracker-header"/);
  assert.match(source, /data-ui="tracker-row"/);
  assert.match(source, /data-ui="tracker-actions"/);
  assert.match(source, /onClick=\{\(\) => onSelectSystem\(system\.id\)\}/);
});

test("tracker actions column is wide enough for both labeled controls", async () => {
  const source = await readFile(presentationUrl, "utf8");
  const actionsSpec = source.match(
    /actions:\s*\{\s*defaultWidth:\s*(\d+),\s*minWidth:\s*(\d+),/
  );

  assert.ok(actionsSpec, "actions column specification is missing");
  assert.ok(Number(actionsSpec[1]) >= 220, "default actions width clips the labeled controls");
  assert.ok(Number(actionsSpec[2]) >= 208, "minimum actions width clips the labeled controls");
});
