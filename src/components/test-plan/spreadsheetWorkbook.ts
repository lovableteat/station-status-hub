import {
  createSpreadsheetSelection,
  decodeSpreadsheetAddress,
  encodeSpreadsheetAddress,
  getSpreadsheetInsertionIndex,
  normalizeSpreadsheetSelection,
  type SpreadsheetSelection,
} from "./spreadsheetInteraction.ts";

type ExcelJsWorksheet = import("exceljs").Worksheet;
type ExcelJsCellValue = import("exceljs").CellValue;
type ExcelJsAutoFilter = import("exceljs").AutoFilter;
type LegacySpreadsheetModule = typeof import("xlsx");
type LegacyWorksheet = import("xlsx").WorkSheet;
type LegacyWorkbook = import("xlsx").WorkBook;

export type SpreadsheetInsertionAxis = "row" | "column";

export interface SpreadsheetDimensions {
  columns: number;
  rows: number;
}

const FORMULA_REFERENCE_PATTERN = /(?:('(?:[^']|'')+'|[A-Za-z_\\][A-Za-z0-9_.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/g;

interface FormattedMergeStyle {
  address: string;
  style: unknown;
}

interface FormattedRowMetadata {
  height: number | undefined;
  hidden: boolean;
  index: number;
  outlineLevel: number;
}

interface FormattedColumnMetadata {
  hidden: boolean;
  index: number;
  outlineLevel: number;
  width: number | undefined;
}

function cloneStyle<T>(style: T): T {
  try {
    return structuredClone(style);
  } catch {
    return JSON.parse(JSON.stringify(style)) as T;
  }
}

function getProtectedFormulaCharacters(formula: string): boolean[] {
  const protectedCharacters = Array.from({ length: formula.length }, () => false);
  let inString = false;
  let structuredReferenceDepth = 0;

  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    if (inString) {
      protectedCharacters[index] = true;
      if (character === '"' && formula[index + 1] === '"') {
        protectedCharacters[index + 1] = true;
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      protectedCharacters[index] = true;
      inString = true;
      continue;
    }
    if (character === "[") {
      structuredReferenceDepth += 1;
    }
    if (structuredReferenceDepth > 0) {
      protectedCharacters[index] = true;
    }
    if (character === "]" && structuredReferenceDepth > 0) {
      structuredReferenceDepth -= 1;
    }
  }
  return protectedCharacters;
}

function normalizeSheetQualifier(qualifier: string): string {
  return qualifier.startsWith("'")
    ? qualifier.slice(1, -1).replace(/''/g, "'")
    : qualifier;
}

function shiftFormulaCellReference(
  reference: string,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): string {
  const match = reference.match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/);
  if (!match) return reference;
  const [, columnAbsolute, columnLetters, rowAbsolute, rowDigits] = match;
  const position = decodeSpreadsheetAddress(`${columnLetters}${rowDigits}`);
  if (axis === "row" && position.row >= insertionIndex) position.row += 1;
  if (axis === "column" && position.column >= insertionIndex) position.column += 1;
  const shiftedAddress = encodeSpreadsheetAddress(position.row, position.column);
  const shifted = shiftedAddress.match(/^([A-Z]+)(\d+)$/);
  if (!shifted) return reference;
  return `${columnAbsolute}${shifted[1]}${rowAbsolute}${shifted[2]}`;
}

export function translateSpreadsheetFormula(
  formula: string,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
  formulaSheetName: string,
  targetSheetName: string,
): string {
  const protectedCharacters = getProtectedFormulaCharacters(formula);
  const normalizedTarget = targetSheetName.toLocaleLowerCase();

  return formula.replace(
    FORMULA_REFERENCE_PATTERN,
    (match, qualifier: string | undefined, start: string, end: string | undefined, offset: number) => {
      if (protectedCharacters[offset]) return match;
      const before = formula[offset - 1];
      const after = formula[offset + match.length];
      if (before && /[A-Za-z0-9_.]/.test(before)) return match;
      if (after && /[A-Za-z0-9_.]/.test(after)) return match;
      if (after === "(" || after === "[") return match;

      const referencedSheet = qualifier
        ? normalizeSheetQualifier(qualifier).toLocaleLowerCase()
        : formulaSheetName.toLocaleLowerCase();
      if (referencedSheet !== normalizedTarget) return match;

      const shiftedStart = shiftFormulaCellReference(start, axis, insertionIndex);
      const shiftedEnd = end ? shiftFormulaCellReference(end, axis, insertionIndex) : undefined;
      return `${qualifier ? `${qualifier}!` : ""}${shiftedStart}${shiftedEnd ? `:${shiftedEnd}` : ""}`;
    },
  );
}

interface FormulaValueShape {
  formula?: string;
  ref?: string;
  sharedFormula?: string;
  [key: string]: unknown;
}

function translateFormattedWorkbookFormulas(
  worksheet: ExcelJsWorksheet,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): void {
  const targetSheetName = worksheet.name;
  worksheet.workbook.worksheets.forEach((formulaWorksheet) => {
    formulaWorksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (!cell.value || typeof cell.value !== "object" || cell.value instanceof Date) return;
        const value = cell.value as FormulaValueShape;
        const nextValue: FormulaValueShape = { ...value };
        let changed = false;
        for (const property of ["formula", "ref", "sharedFormula"] as const) {
          const formula = value[property];
          if (typeof formula !== "string") continue;
          const translated = translateSpreadsheetFormula(
            formula,
            axis,
            insertionIndex,
            formulaWorksheet.name,
            targetSheetName,
          );
          if (translated === formula) continue;
          nextValue[property] = translated;
          changed = true;
        }
        if (changed) cell.value = nextValue as ExcelJsCellValue;
      });
    });
  });
}

function translateLegacyWorkbookFormulas(
  spreadsheet: LegacySpreadsheetModule,
  worksheet: LegacyWorksheet,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
  workbook?: LegacyWorkbook,
  targetSheetName = "",
): void {
  const worksheets = workbook
    ? workbook.SheetNames.map((name) => ({ name, worksheet: workbook.Sheets[name] }))
    : [{ name: targetSheetName, worksheet }];

  worksheets.forEach(({ name, worksheet: formulaWorksheet }) => {
    Object.entries(formulaWorksheet).forEach(([address, cell]) => {
      if (address.startsWith("!") || !cell || typeof cell !== "object") return;
      const formula = (cell as { f?: unknown }).f;
      if (typeof formula !== "string") return;
      (cell as { f: string }).f = translateSpreadsheetFormula(
        formula,
        axis,
        insertionIndex,
        name,
        targetSheetName,
      );
    });
  });
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

function shiftRangeReference(
  range: string,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): string {
  const [startAddress, endAddress] = range.split(":");
  const shiftedStart = shiftAddress(startAddress, axis, insertionIndex);
  return endAddress
    ? `${shiftedStart}:${shiftAddress(endAddress, axis, insertionIndex)}`
    : shiftedStart;
}

function shiftFormattedAutoFilter(
  autoFilter: ExcelJsAutoFilter | undefined,
  axis: SpreadsheetInsertionAxis,
  insertionIndex: number,
): ExcelJsAutoFilter | undefined {
  if (!autoFilter) return autoFilter;
  if (typeof autoFilter === "string") {
    return shiftRangeReference(autoFilter, axis, insertionIndex);
  }
  const shiftBoundary = (boundary: string | { column: number; row: number }) => {
    if (typeof boundary === "string") return shiftAddress(boundary, axis, insertionIndex);
    return {
      ...boundary,
      row: boundary.row + (axis === "row" && boundary.row >= insertionIndex ? 1 : 0),
      column: boundary.column + (axis === "column" && boundary.column >= insertionIndex ? 1 : 0),
    };
  };
  return {
    from: shiftBoundary(autoFilter.from),
    to: shiftBoundary(autoFilter.to),
  };
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

function mutateFormattedWorksheet(
  worksheet: ExcelJsWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
): SpreadsheetSelection {
  const insertionIndex = getFormattedInsertionIndex(worksheet, selection, axis);
  const mergeRanges = [...(worksheet.model.merges ?? [])];
  const mergeStyles = getFormattedMergeStyles(worksheet, mergeRanges);
  const sourceIndex = Math.max(1, insertionIndex - 1);
  const autoFilter = worksheet.autoFilter;

  if (axis === "row") {
    const sourceHeight = worksheet.getRow(sourceIndex).height;
    const shiftedMetadata: FormattedRowMetadata[] = [];
    for (let index = insertionIndex; index <= worksheet.rowCount; index += 1) {
      const row = worksheet.getRow(index);
      shiftedMetadata.push({
        height: row.height,
        hidden: row.hidden,
        index,
        outlineLevel: row.outlineLevel,
      });
    }
    const sourceStyles = Array.from({ length: dimensions.columns }, (_, index) => (
      cloneStyle(worksheet.getCell(sourceIndex, index + 1).style)
    ));
    mergeRanges.forEach((range) => worksheet.unMergeCells(range));
    worksheet.spliceRows(insertionIndex, 0, []);
    const insertedRow = worksheet.getRow(insertionIndex);
    insertedRow.height = sourceHeight ?? worksheet.properties.defaultRowHeight ?? 15;
    insertedRow.hidden = false;
    insertedRow.outlineLevel = 0;
    shiftedMetadata.forEach((metadata) => {
      const shiftedRow = worksheet.getRow(metadata.index + 1);
      shiftedRow.height = metadata.height;
      shiftedRow.hidden = metadata.hidden;
      shiftedRow.outlineLevel = metadata.outlineLevel;
    });
    sourceStyles.forEach((style, index) => {
      const cell = worksheet.getCell(insertionIndex, index + 1);
      cell.style = style;
      cell.value = null;
    });
  } else {
    const sourceWidth = worksheet.getColumn(sourceIndex).width;
    const shiftedMetadata: FormattedColumnMetadata[] = [];
    for (let index = insertionIndex; index <= worksheet.columns.length; index += 1) {
      const column = worksheet.getColumn(index);
      shiftedMetadata.push({
        hidden: column.hidden,
        index,
        outlineLevel: column.outlineLevel,
        width: column.width,
      });
    }
    const sourceStyles = Array.from({ length: dimensions.rows }, (_, index) => (
      cloneStyle(worksheet.getCell(index + 1, sourceIndex).style)
    ));
    mergeRanges.forEach((range) => worksheet.unMergeCells(range));
    worksheet.spliceColumns(insertionIndex, 0, []);
    const insertedColumn = worksheet.getColumn(insertionIndex);
    insertedColumn.width = sourceWidth ?? 10;
    insertedColumn.hidden = false;
    insertedColumn.outlineLevel = 0;
    shiftedMetadata.forEach((metadata) => {
      const shiftedColumn = worksheet.getColumn(metadata.index + 1);
      shiftedColumn.width = metadata.width;
      shiftedColumn.hidden = metadata.hidden;
      shiftedColumn.outlineLevel = metadata.outlineLevel;
    });
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
  worksheet.autoFilter = shiftFormattedAutoFilter(autoFilter, axis, insertionIndex);
  translateFormattedWorkbookFormulas(worksheet, axis, insertionIndex);

  return getInsertedSelection(selection, axis, insertionIndex);
}

function restoreFormattedWorksheet(
  worksheet: ExcelJsWorksheet,
  snapshot: ExcelJsWorksheet["model"],
  mergeStyles: FormattedMergeStyle[],
): void {
  [...(worksheet.model.merges ?? [])].forEach((range) => worksheet.unMergeCells(range));
  const restoreModel = cloneStyle(snapshot) as ExcelJsWorksheet["model"] & { mergeCells?: string[] };
  restoreModel.mergeCells = [...(restoreModel.merges ?? [])];
  worksheet.model = restoreModel;
  mergeStyles.forEach(({ address, style }) => {
    worksheet.getCell(address).style = cloneStyle(style);
  });
}

export function insertFormattedWorksheet(
  worksheet: ExcelJsWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
): SpreadsheetSelection {
  const snapshot = cloneStyle(worksheet.model);
  const mergeStyles = getFormattedMergeStyles(worksheet, worksheet.model.merges ?? []);
  try {
    return mutateFormattedWorksheet(worksheet, selection, axis, dimensions);
  } catch (error) {
    restoreFormattedWorksheet(worksheet, snapshot, mergeStyles);
    throw error;
  }
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

function mutateLegacyWorksheet(
  spreadsheet: LegacySpreadsheetModule,
  worksheet: LegacyWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
  workbook?: LegacyWorkbook,
  targetSheetName = "",
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
  if (worksheet["!autofilter"]?.ref) {
    worksheet["!autofilter"] = {
      ...worksheet["!autofilter"],
      ref: shiftRangeReference(worksheet["!autofilter"].ref, axis, insertionIndex),
    };
  }
  translateLegacyWorkbookFormulas(
    spreadsheet,
    worksheet,
    axis,
    insertionIndex,
    workbook,
    targetSheetName,
  );

  return getInsertedSelection(selection, axis, insertionIndex);
}

export function insertLegacyWorksheet(
  spreadsheet: LegacySpreadsheetModule,
  worksheet: LegacyWorksheet,
  selection: SpreadsheetSelection,
  axis: SpreadsheetInsertionAxis,
  dimensions: SpreadsheetDimensions,
  workbook?: LegacyWorkbook,
  targetSheetName = "",
): SpreadsheetSelection {
  const snapshot = cloneStyle(worksheet);
  try {
    return mutateLegacyWorksheet(
      spreadsheet,
      worksheet,
      selection,
      axis,
      dimensions,
      workbook,
      targetSheetName,
    );
  } catch (error) {
    Object.keys(worksheet).forEach((key) => delete worksheet[key]);
    Object.assign(worksheet, cloneStyle(snapshot));
    throw error;
  }
}
