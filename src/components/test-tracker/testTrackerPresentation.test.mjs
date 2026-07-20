import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let presentation = {};

try {
  const sourceUrl = new URL("./testTrackerPresentation.ts", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  presentation = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
} catch {
  presentation = {};
}

test("tracker defaults to 100 rows and keeps the 500 and 1000 row options", () => {
  assert.equal(presentation.DEFAULT_TRACKER_PAGE_SIZE, 100);
  assert.deepEqual(presentation.TRACKER_PAGE_SIZE_OPTIONS, [100, 500, 1000]);
});

test("pinned machine column keeps a visible boundary from header through every row", () => {
  assert.equal(
    presentation.TRACKER_MACHINE_COLUMN_BOUNDARY_CLASS,
    "border-r border-[#315b7b]",
  );
});

test("stored tracker column widths are clamped by column type", () => {
  assert.equal(typeof presentation.getTrackerColumnWidth, "function");
  assert.equal(presentation.getTrackerColumnWidth("machine", { machine: 20 }), 120);
  assert.equal(presentation.getTrackerColumnWidth("station:station-a", { "station:station-a": 900 }), 620);
  assert.equal(presentation.getTrackerColumnWidth("serial", {}), 116);
});

test("tracker station columns flex to the right boundary while fixed columns keep their widths", () => {
  assert.equal(typeof presentation.getTrackerGridTemplate, "function");
  assert.equal(
    presentation.getTrackerGridTemplate(
      ["machine", "serial", "status", "station:station-a", "station:station-b", "actions"],
      {
        machine: 158,
        serial: 116,
        status: 98,
        "station:station-a": 300,
        "station:station-b": 420,
        actions: 82,
      },
    ),
    "158px 116px 98px minmax(300px, 300fr) minmax(420px, 420fr) 148px",
  );
});

test("station progress lookup only counts completed items from the matching station", () => {
  assert.equal(typeof presentation.createStationProgressLookup, "function");
  const lookup = presentation.createStationProgressLookup(
    [
      { id: "a", station_id: "station-1" },
      { id: "b", station_id: "station-1" },
      { id: "c", station_id: "station-2" },
    ],
    [
      { item_id: "a", station_id: "station-1", status: "Done", system_id: "system-1" },
      { item_id: "b", station_id: "station-1", status: "Pending", system_id: "system-1" },
      { item_id: "c", station_id: "station-2", status: "Done", system_id: "system-1" },
      { item_id: "missing", station_id: "station-1", status: "Done", system_id: "system-1" },
    ],
  );

  assert.equal(lookup.get("system-1\u0000station-1"), 50);
  assert.equal(lookup.get("system-1\u0000station-2"), 100);
});

test("virtual tracker range keeps a small overscanned window for 1000 rows", () => {
  assert.equal(typeof presentation.getTrackerVirtualRange, "function");
  const range = presentation.getTrackerVirtualRange({
    headerHeight: 36,
    overscan: 4,
    rowCount: 1000,
    rowHeight: 76,
    scrollTop: 7_636,
    viewportHeight: 532,
  });

  assert.deepEqual(range, { end: 111, start: 96 });
});
