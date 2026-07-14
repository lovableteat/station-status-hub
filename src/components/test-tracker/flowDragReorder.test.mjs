import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let reorder = {};

try {
  const sourceUrl = new URL("./flowDragReorder.ts", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  reorder = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
} catch {
  reorder = {};
}

test("dragging a station onto another station reorders and normalizes every station", () => {
  assert.equal(typeof reorder.reorderStationsByDrop, "function");
  const result = reorder.reorderStationsByDrop(
    [
      { id: "station-a", station_order: 4 },
      { id: "station-b", station_order: 8 },
      { id: "station-c", station_order: 12 },
    ],
    "station-c",
    "station-a",
  );

  assert.deepEqual(
    result.map(({ id, station_order }) => ({ id, station_order })),
    [
      { id: "station-c", station_order: 0 },
      { id: "station-a", station_order: 1 },
      { id: "station-b", station_order: 2 },
    ],
  );
});

test("dragging a station downward places it after the drop target", () => {
  const result = reorder.reorderStationsByDrop(
    [
      { id: "station-a", station_order: 0 },
      { id: "station-b", station_order: 1 },
      { id: "station-c", station_order: 2 },
    ],
    "station-a",
    "station-c",
  );

  assert.deepEqual(
    result.map(({ id, station_order }) => ({ id, station_order })),
    [
      { id: "station-b", station_order: 0 },
      { id: "station-c", station_order: 1 },
      { id: "station-a", station_order: 2 },
    ],
  );
});

test("dragging an item onto another item reorders it inside the selected station", () => {
  assert.equal(typeof reorder.reorderItemsByDrop, "function");
  const result = reorder.reorderItemsByDrop(
    [
      { id: "item-a", item_order: 0, station_id: "station-a" },
      { id: "item-b", item_order: 1, station_id: "station-a" },
      { id: "item-c", item_order: 2, station_id: "station-a" },
    ],
    "item-c",
    "item-a",
  );

  assert.deepEqual(
    result.map(({ id, item_order, station_id }) => ({ id, item_order, station_id })),
    [
      { id: "item-c", item_order: 0, station_id: "station-a" },
      { id: "item-a", item_order: 1, station_id: "station-a" },
      { id: "item-b", item_order: 2, station_id: "station-a" },
    ],
  );
});

test("dragging an item downward places it after the drop target", () => {
  const result = reorder.reorderItemsByDrop(
    [
      { id: "item-a", item_order: 0, station_id: "station-a" },
      { id: "item-b", item_order: 1, station_id: "station-a" },
      { id: "item-c", item_order: 2, station_id: "station-a" },
    ],
    "item-a",
    "item-c",
  );

  assert.deepEqual(
    result.map(({ id, item_order }) => ({ id, item_order })),
    [
      { id: "item-b", item_order: 0 },
      { id: "item-c", item_order: 1 },
      { id: "item-a", item_order: 2 },
    ],
  );
});

test("dropping an item on empty space moves it to the end", () => {
  const result = reorder.reorderItemsByDrop(
    [
      { id: "item-a", item_order: 0, station_id: "station-a" },
      { id: "item-b", item_order: 1, station_id: "station-a" },
      { id: "item-c", item_order: 2, station_id: "station-a" },
    ],
    "item-a",
  );

  assert.deepEqual(result.map(({ id }) => id), ["item-b", "item-c", "item-a"]);
});
