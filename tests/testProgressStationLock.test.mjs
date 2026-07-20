import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("station cells open a progress sheet locked to their machine and station", async () => {
  const [table, tracker, sheet] = await Promise.all([
    read("../src/components/test-tracker/TestProgressTable.tsx"),
    read("../src/components/test-tracker/TestTracker.tsx"),
    read("../src/components/test-tracker/SystemProgressSheet.tsx"),
  ]);

  assert.match(
    table,
    /onSelectStation:\s*\(systemId:\s*string,\s*stationId:\s*string\)\s*=>\s*void/
  );
  assert.match(
    table,
    /onClick=\{\(\)\s*=>\s*onSelectStation\(system\.id,\s*station\.id\)\}/
  );

  assert.match(
    tracker,
    /const \[lockedStationId,\s*setLockedStationId\]\s*=\s*useState<string \| null>\(null\)/
  );
  assert.match(
    tracker,
    /const openStationProgress = \(systemId: string,\s*stationId: string\) =>/
  );
  assert.match(tracker, /lockedStationId=\{lockedStationId\}/);
  assert.match(
    tracker,
    /setSelectedSystemId\(null\);[\s\S]*?setLockedStationId\(null\);/
  );

  assert.match(sheet, /lockedStationId\?:\s*string \| null/);
  assert.match(sheet, /if \(lockedStationId\)/);
  assert.match(sheet, /\{!lockedStationId && \(/);
});
