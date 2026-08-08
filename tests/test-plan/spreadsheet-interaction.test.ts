import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpreadsheetSelection,
  decodeSpreadsheetAddress,
  getSpreadsheetSelectionLabel,
  moveSpreadsheetSelection,
  normalizeSpreadsheetSelection,
  parseSpreadsheetClipboard,
  serializeSpreadsheetClipboard,
} from "../../src/components/test-plan/spreadsheetInteraction.ts";

test("encodes, decodes, and normalizes spreadsheet selections", () => {
  assert.deepEqual(decodeSpreadsheetAddress("$AA$27"), { row: 27, column: 27 });
  const selection = {
    anchor: { row: 8, column: 5 },
    focus: { row: 2, column: 2 },
  };
  assert.deepEqual(normalizeSpreadsheetSelection(selection), {
    startRow: 2,
    endRow: 8,
    startColumn: 2,
    endColumn: 5,
  });
  assert.equal(getSpreadsheetSelectionLabel(selection), "B2:E8");
});

test("moves and extends a selection without leaving worksheet bounds", () => {
  const initial = createSpreadsheetSelection(1, 1);
  const moved = moveSpreadsheetSelection(initial, -3, 4, 20, 10, false);
  assert.deepEqual(moved, createSpreadsheetSelection(1, 5));
  const extended = moveSpreadsheetSelection(moved, 3, -2, 20, 10, true);
  assert.deepEqual(extended, {
    anchor: { row: 1, column: 5 },
    focus: { row: 4, column: 3 },
  });
});

test("round-trips Excel clipboard matrices including tabs and line breaks", () => {
  const matrix = [
    ["A", "B\tC", "D"],
    ["multi\nline", 'say "hello"', ""],
  ];
  const serialized = serializeSpreadsheetClipboard(matrix);
  assert.deepEqual(parseSpreadsheetClipboard(serialized), matrix);
  assert.deepEqual(parseSpreadsheetClipboard("1\t2\r\n3\t4\r\n"), [["1", "2"], ["3", "4"]]);
});
