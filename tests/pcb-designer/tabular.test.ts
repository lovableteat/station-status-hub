import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBomRows,
  parseComponentRows,
  parseCsvRows,
  rowsFromCsv,
} from "../../src/components/pcb-designer/core/tabular.ts";

test("parses UTF-8 BOM CSV fields with quoted commas, quotes, and newlines", () => {
  const rows = rowsFromCsv("\uFEFFName,Width,Height,Max Height\r\n\"Socket, \"\"A\"\"\",2,3,4\r\n\"Two\nlines\",5,6,7");

  assert.deepEqual(rows, [
    { Name: 'Socket, "A"', Width: "2", Height: "3", "Max Height": "4" },
    { Name: "Two\nlines", Width: "5", Height: "6", "Max Height": "7" },
  ]);
  assert.deepEqual(parseCsvRows("a,b\n\n,\n1,2"), [["a", "b"], [], ["", ""], ["1", "2"]]);
});

test("normalizes Chinese and English component aliases and reports invalid row numbers", () => {
  const result = parseComponentRows([
    { 名稱: "Controller", 類型: "IC", 製造商: "Acme", 料號: "A-1", "寬(mm)": "4", "長(mm)": 5, "高(mm)": "1.2", 顏色: "#123456" },
    { Name: "Broken", Width: "Infinity", Height: "2", "Max Height": "1" },
    {},
  ]);

  assert.equal(result.valid.length, 1);
  assert.deepEqual(result.valid[0], {
    name: "Controller", type: "IC", manufacturer: "Acme", partNumber: "A-1",
    width: 4, height: 5, maxHeight: 1.2, color: "#123456",
  });
  assert.deepEqual(result.errors, [{ row: 3, message: "Width must be a finite positive number" }]);
});

test("expands valid BOM quantities into pending placements and rejects invalid quantities", () => {
  const result = parseBomRows([
    { Name: "Resistor", Manufacturer: "Yageo", MPN: "RC1", Width: 1.6, Height: 0.8, "Max Height": 0.5, Qty: "3", RefDes: "R1" },
    { Name: "Capacitor", Width: 1, Height: 1, "Max Height": 1, Quantity: 0 },
  ]);

  assert.equal(result.valid.length, 1);
  assert.equal(result.pending.length, 3);
  assert.deepEqual(result.pending.map((item) => item.reference), ["R1", "R1", "R1"]);
  assert.deepEqual(result.errors, [{ row: 3, message: "Quantity must be a finite positive number" }]);
});
