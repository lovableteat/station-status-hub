import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpreadsheetSelection,
  decodeSpreadsheetAddress,
  formatSpreadsheetNumber,
  getSpreadsheetInsertionIndex,
  getSpreadsheetSelectionLabel,
  moveSpreadsheetSelection,
  normalizeSpreadsheetSelection,
  parseSpreadsheetClipboard,
  serializeSpreadsheetClipboard,
} from "../../src/components/test-plan/spreadsheetInteraction.ts";

test("formats spreadsheet numbers with General precision and custom formats", () => {
  assert.equal(formatSpreadsheetNumber(50.400000000000006, "General"), "50.4");
  assert.equal(formatSpreadsheetNumber(0.125, "0.0%", (format, value) => `${format}:${value}`), "0.0%:0.125");
});

test("places row and column insertions after the normalized selection and past merges", () => {
  const selection = {
    anchor: { row: 8, column: 5 },
    focus: { row: 4, column: 2 },
  };

  assert.equal(getSpreadsheetInsertionIndex(selection, "row", []), 9);
  assert.equal(getSpreadsheetInsertionIndex(selection, "column", []), 6);
  assert.equal(getSpreadsheetInsertionIndex(selection, "row", [{ startRow: 9, endRow: 11, startColumn: 1, endColumn: 3 }]), 12);
});

test("skips merges outside the selected cross-axis range for full-axis insertion", () => {
  const selection = {
    anchor: { row: 8, column: 5 },
    focus: { row: 4, column: 2 },
  };

  assert.equal(getSpreadsheetInsertionIndex(selection, "row", [
    { startRow: 9, endRow: 11, startColumn: 20, endColumn: 22 },
  ]), 12);
  assert.equal(getSpreadsheetInsertionIndex(selection, "column", [
    { startRow: 20, endRow: 22, startColumn: 6, endColumn: 8 },
  ]), 9);
});

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
