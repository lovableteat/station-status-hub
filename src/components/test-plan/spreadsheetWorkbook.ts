import {
  createSpreadsheetSelection,
  decodeSpreadsheetAddress,
  encodeSpreadsheetAddress,
  getSpreadsheetInsertionIndex,
  normalizeSpreadsheetSelection,
  type SpreadsheetSelection,
} from "./spreadsheetInteraction.ts";

type ExcelJsWorksheet = import("exceljs").Worksheet;
type LegacySpreadsheetModule = typeof import("xlsx");
type LegacyWorksheet = import("xlsx").WorkSheet;

export type SpreadsheetInsertionAxis = "row" | "column";

export interface SpreadsheetDimensions {
  columns: number;
  rows: number;
}

interface FormattedMergeStyle {
  address: string;
  style: unknown;
}

function cloneStyle<T>(style: T): T {
  try {
    return structuredClone(style);
  } catch {
    return JSON.parse(JSON.stringify(style)) as T;
  }
}

function shiftAddress(
  address: string,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): string {
  const position = decodeSpreadsheetAddress(address);
  if (axis === "row" && position.row >= insertionIndex) position.row += 1;
  if (axis === "column" && position.column >= insertionIndex) position.column += 1;
  return encodeSpreadsheetAddress(position.row, position.column);
}

function shiftFormattedMergeRange(
  range: string,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): string {
  const [startAddress, endAddress = startAddress] = range.split(":");
  return `${shiftAddress(startAddress, axis, insertionIndex)}:${shiftAddress(endAddress, axis, insertionIndex)}`;
}

function getFormattedMergeStyles(
  worksheet: ExcelJsWorksheet,
  mergeRanges: string[],
): FormattedMergeStyle[] {
  return mergeRanges.flatMap((range) => {
    const [startAddress, endAddress = startAddress] = range.split(":");
    const start = decodeSpreadsheetAddress(startAddress);
    const end = decodeSpreadsheetAddress(endAddress);
    const styles: FormattedMergeStyle[] = [];
    for (let row = start.row; row <= end.row; row += 1) {
      for (let column = start.column; column <= end.column; column += 1) {
        const address = encodeSpreadsheetAddress(row, column);
        styles.push({ address, style: cloneStyle(worksheet.getCell(address).style) });
      }
    }
    return styles;
  });
}

function getFormattedInsertionIndex(
  worksheet: ExcelJsWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
): number {
  return getSpreadsheetInsertionIndex(
    selection,
    axis,
    (worksheet.model.merges ?? []).map((range) => {
      const [startAddress, endAddress = startAddress] = range.split(":");
      const start = decodeSpreadsheetAddress(startAddress);
      const end = decodeSpreadsheetAddress(endAddress);
      return {
        startRow: start.row,
        endRow: end.row,
        startColumn: start.column,
        endColumn: end.column,
      };
    }),
  );
}

function getLegacyInsertionIndex(
  worksheet: LegacyWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
): number {
  return getSpreadsheetInsertionIndex(
    selection,
    axis,
    (worksheet["!merges"] ?? []).map((merge) => ({
      startRow: merge.s.r + 1,
      endRow: merge.e.r + 1,
      startColumn: merge.s.c + 1,
      endColumn: merge.e.c + 1,
    })),
  );
}

function getInsertedSelection(
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): SpreadsheetSelection {
  const normalized = normalizeSpreadsheetSelection(selection);
  return axis === "row"
    ? createSpreadsheetSelection(insertionIndex, normalized.startColumn)
    : createSpreadsheetSelection(normalized.startRow, insertionIndex);
}

export function insertFormattedWorksheet(
  worksheet: ExcelJsWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
): SpreadsheetSelection {
  const insertionIndex = getFormattedInsertionIndex(worksheet, selection, axis);
  const mergeRanges = [...(worksheet.model.merges ?? [])];
  const mergeStyles = getFormattedMergeStyles(worksheet, mergeRanges);
  const sourceIndex = Math.max(1, insertionIndex - 1);

  if (axis === "row") {
    const sourceHeight = worksheet.getRow(sourceIndex).height;
    const sourceStyles = Array.from({ length: dimensions.columns }, (_, index) => (
      cloneStyle(worksheet.getCell(sourceIndex, index + 1).style)
    ));
    mergeRanges.forEach((range) => worksheet.unMergeCells(range));
    worksheet.spliceRows(insertionIndex, 0, []);
    const insertedRow = worksheet.getRow(insertionIndex);
    insertedRow.height = sourceHeight ?? worksheet.properties.defaultRowHeight ?? 15;
    sourceStyles.forEach((style, index) => {
      const cell = worksheet.getCell(insertionIndex, index + 1);
      cell.style = style;
      cell.value = null;
    });
  } else {
    const sourceWidth = worksheet.getColumn(sourceIndex).width;
    const sourceStyles = Array.from({ length: dimensions.rows }, (_, index) => (
      cloneStyle(worksheet.getCell(index + 1, sourceIndex).style)
    ));
    mergeRanges.forEach((range) => worksheet.unMergeCells(range));
    worksheet.spliceColumns(insertionIndex, 0, []);
    worksheet.getColumn(insertionIndex).width = sourceWidth ?? 10;
    sourceStyles.forEach((style, index) => {
      const cell = worksheet.getCell(index + 1, insertionIndex);
      cell.style = style;
      cell.value = null;
    });
  }

  mergeRanges
    .map((range) => shiftFormattedMergeRange(range, axis, insertionIndex))
    .forEach((range) => worksheet.mergeCells(range));
  mergeStyles.forEach(({ address, style }) => {
    worksheet.getCell(shiftAddress(address, axis, insertionIndex)).style = style;
  });

  return getInsertedSelection(selection, axis, insertionIndex);
}

function copyLegacyStylesIntoInsertedStructure(
  spreadsheet: LegacySpreadsheetModule,
  worksheet: LegacyWorksheet,
  axis: SpreadsheetInsertionAxis,
  insertionOffset: number,
  dimensions: SpreadsheetDimensions,
): void {
  const sourceIndex = Math.max(0, insertionOffset - 1);
  const count = axis === "row" ? dimensions.columns : dimensions.rows;
  for (let index = 0; index < count; index += 1) {
    const sourcePosition = axis === "row"
      ? { r: sourceIndex, c: index }
      : { r: index, c: sourceIndex };
    const targetPosition = axis === "row"
      ? { r: insertionOffset, c: index }
      : { r: index, c: insertionOffset };
    const source = worksheet[spreadsheet.utils.encode_cell(sourcePosition)];
    if (!source?.s) continue;
    worksheet[spreadsheet.utils.encode_cell(targetPosition)] = { t: "z", s: cloneStyle(source.s) };
  }
}

export function insertLegacyWorksheet(
  spreadsheet: LegacySpreadsheetModule,
  worksheet: LegacyWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
): SpreadsheetSelection {
  const insertionIndex = getLegacyInsertionIndex(worksheet, selection, axis);
  const insertionOffset = insertionIndex - 1;
  const sourceIndex = Math.max(0, insertionOffset - 1);
  const affectedCells = Object.entries(worksheet)
    .filter(([address]) => !address.startsWith("!"))
    .map(([address, cell]) => ({ address, cell, position: spreadsheet.utils.decode_cell(address) }))
    .filter(({ position }) => axis === "row"
      ? position.r >= insertionOffset
      : position.c >= insertionOffset)
    .sort((left, right) => axis === "row"
      ? right.position.r - left.position.r || right.position.c - left.position.c
      : right.position.c - left.position.c || right.position.r - left.position.r);

  affectedCells.forEach(({ address, cell, position }) => {
    const nextPosition = axis === "row"
      ? { ...position, r: position.r + 1 }
      : { ...position, c: position.c + 1 };
    worksheet[spreadsheet.utils.encode_cell(nextPosition)] = cell;
    delete worksheet[address];
  });
  copyLegacyStylesIntoInsertedStructure(spreadsheet, worksheet, axis, insertionOffset, dimensions);

  const range = spreadsheet.utils.decode_range(worksheet["!ref"] ?? "A1");
  if (axis === "row") range.e.r = Math.max(range.e.r + 1, insertionOffset);
  else range.e.c = Math.max(range.e.c + 1, insertionOffset);
  worksheet["!ref"] = spreadsheet.utils.encode_range(range);

  if (axis === "row") {
    const rows = [...(worksheet["!rows"] ?? [])];
    const sourceRow = rows[sourceIndex];
    rows.splice(insertionOffset, 0, sourceRow ? { hpt: sourceRow.hpt, hpx: sourceRow.hpx } : undefined);
    worksheet["!rows"] = rows;
  } else {
    const columns = [...(worksheet["!cols"] ?? [])];
    const sourceColumn = columns[sourceIndex];
    columns.splice(insertionOffset, 0, sourceColumn ? {
      width: sourceColumn.width,
      wpx: sourceColumn.wpx,
      wch: sourceColumn.wch,
    } : undefined);
    worksheet["!cols"] = columns;
  }
  worksheet["!merges"] = (worksheet["!merges"] ?? []).map((merge) => {
    const shift = axis === "row" ? merge.s.r >= insertionOffset : merge.s.c >= insertionOffset;
    if (!shift) return merge;
    return {
      s: {
        r: merge.s.r + (axis === "row" ? 1 : 0),
        c: merge.s.c + (axis === "column" ? 1 : 0),
      },
      e: {
        r: merge.e.r + (axis === "row" ? 1 : 0),
        c: merge.e.c + (axis === "column" ? 1 : 0),
      },
    };
  });

  return getInsertedSelection(selection, axis, insertionIndex);
}
