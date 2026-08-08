export interface SpreadsheetCellPosition {
  row: number;
  column: number;
}

export interface SpreadsheetSelection {
  anchor: SpreadsheetCellPosition;
  focus: SpreadsheetCellPosition;
}

export interface NormalizedSpreadsheetSelection {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface SpreadsheetMergeRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export type SpreadsheetNumberFormatter = (format: string, value: number) => string;

export function formatSpreadsheetNumber(
  value: number,
  numberFormat = "General",
  formatter?: SpreadsheetNumberFormatter,
): string {
  try {
    const formatted = formatter?.(numberFormat || "General", value);
    if (formatted !== undefined && formatted !== "") return formatted;
  } catch {
    // Fall through to a safe General representation.
  }
  return String(Number(value.toPrecision(15)));
}

export function encodeSpreadsheetColumn(column: number): string {
  let value = Math.max(1, Math.trunc(column));
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function encodeSpreadsheetAddress(row: number, column: number): string {
  return `${encodeSpreadsheetColumn(column)}${Math.max(1, Math.trunc(row))}`;
}

export function decodeSpreadsheetAddress(address: string): SpreadsheetCellPosition {
  const match = address.replace(/\$/g, "").match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { row: 1, column: 1 };
  const column = match[1]
    .toUpperCase()
    .split("")
    .reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
  return { row: Math.max(1, Number(match[2])), column: Math.max(1, column) };
}

export function createSpreadsheetSelection(
  row = 1,
  column = 1,
): SpreadsheetSelection {
  const position = { row, column };
  return { anchor: position, focus: position };
}

export function normalizeSpreadsheetSelection(
  selection: SpreadsheetSelection,
): NormalizedSpreadsheetSelection {
  return {
    startRow: Math.min(selection.anchor.row, selection.focus.row),
    endRow: Math.max(selection.anchor.row, selection.focus.row),
    startColumn: Math.min(selection.anchor.column, selection.focus.column),
    endColumn: Math.max(selection.anchor.column, selection.focus.column),
  };
}

export function getSpreadsheetInsertionIndex(
  selection: SpreadsheetSelection,
  axis: "row" | "column",
  merges: SpreadsheetMergeRange[],
): number {
  const normalized = normalizeSpreadsheetSelection(selection);
  let insertionIndex = axis === "row"
    ? normalized.endRow + 1
    : normalized.endColumn + 1;

  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const merge of merges) {
      const crossesInsertion = axis === "row"
        ? insertionIndex >= merge.startRow
          && insertionIndex <= merge.endRow
        : insertionIndex >= merge.startColumn
          && insertionIndex <= merge.endColumn;
      if (!crossesInsertion) continue;
      insertionIndex = axis === "row" ? merge.endRow + 1 : merge.endColumn + 1;
      advanced = true;
    }
  }

  return insertionIndex;
}

export function isPositionSelected(
  selection: NormalizedSpreadsheetSelection,
  row: number,
  column: number,
): boolean {
  return row >= selection.startRow
    && row <= selection.endRow
    && column >= selection.startColumn
    && column <= selection.endColumn;
}

export function doSpreadsheetRangesIntersect(
  selection: NormalizedSpreadsheetSelection,
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number,
): boolean {
  return selection.startRow <= endRow
    && selection.endRow >= startRow
    && selection.startColumn <= endColumn
    && selection.endColumn >= startColumn;
}

export function getSpreadsheetSelectionSize(
  selection: NormalizedSpreadsheetSelection,
): number {
  return (selection.endRow - selection.startRow + 1)
    * (selection.endColumn - selection.startColumn + 1);
}

export function getSpreadsheetSelectionLabel(
  selection: SpreadsheetSelection,
): string {
  const normalized = normalizeSpreadsheetSelection(selection);
  const start = encodeSpreadsheetAddress(normalized.startRow, normalized.startColumn);
  const end = encodeSpreadsheetAddress(normalized.endRow, normalized.endColumn);
  return start === end ? start : `${start}:${end}`;
}

export function clampSpreadsheetPosition(
  position: SpreadsheetCellPosition,
  rowCount: number,
  columnCount: number,
): SpreadsheetCellPosition {
  return {
    row: Math.min(Math.max(1, position.row), Math.max(1, rowCount)),
    column: Math.min(Math.max(1, position.column), Math.max(1, columnCount)),
  };
}

export function moveSpreadsheetSelection(
  selection: SpreadsheetSelection,
  rowDelta: number,
  columnDelta: number,
  rowCount: number,
  columnCount: number,
  extend: boolean,
): SpreadsheetSelection {
  const focus = clampSpreadsheetPosition({
    row: selection.focus.row + rowDelta,
    column: selection.focus.column + columnDelta,
  }, rowCount, columnCount);
  return {
    anchor: extend ? selection.anchor : focus,
    focus,
  };
}

export function serializeSpreadsheetClipboard(values: string[][]): string {
  return values.map((row) => row.map((value) => {
    if (!/[\t\r\n"]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }).join("\t")).join("\r\n");
}

export function parseSpreadsheetClipboard(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === "\t") {
      row.push(value);
      value = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += character;
  }

  row.push(value);
  rows.push(row);
  const lastRow = rows[rows.length - 1];
  if (rows.length > 1 && lastRow?.length === 1 && lastRow[0] === "") rows.pop();
  return rows.length ? rows : [[""]];
}
