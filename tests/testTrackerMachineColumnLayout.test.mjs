import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
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
