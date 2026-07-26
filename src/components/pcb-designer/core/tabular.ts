export type TabularRow = Record<string, unknown>;

export interface ImportedComponent {
  name: string;
  type: string;
  manufacturer: string;
  partNumber: string;
  width: number;
  height: number;
  maxHeight: number;
  color: string;
}

export interface ImportedBomItem extends ImportedComponent {
  quantity: number;
  reference: string;
}

export interface PendingPlacement extends ImportedBomItem {}

export interface TabularImportError {
  row: number;
  message: string;
}

export interface TabularParseResult<T> {
  valid: T[];
  errors: TabularImportError[];
}

export interface BomParseResult extends TabularParseResult<ImportedBomItem> {
  pending: PendingPlacement[];
}

const aliases: Record<string, readonly string[]> = {
  name: ["name", "名稱", "元件名稱"],
  type: ["type", "類型"],
  manufacturer: ["manufacturer", "製造商"],
  partNumber: ["part number", "mpn", "料號"],
  width: ["width", "寬度", "寬(mm)"],
  height: ["height", "長度", "高度", "長(mm)"],
  maxHeight: ["max height", "最大高度", "高(mm)"],
  color: ["color", "顏色"],
  quantity: ["quantity", "qty", "數量"],
  reference: ["reference", "refdes", "位號"],
};

function normalizedKey(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase();
}

function cell(row: TabularRow, field: keyof typeof aliases): unknown {
  const matching = new Set(aliases[field].map(normalizedKey));
  const key = Object.keys(row).find((candidate) => matching.has(normalizedKey(candidate)));
  return key === undefined ? undefined : row[key];
}

function text(value: unknown, fallback = ""): string {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function positiveNumber(value: unknown, label: string): number | string {
  const number = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(number) && number > 0 ? number : `${label} must be a finite positive number`;
}

function isBlank(row: TabularRow): boolean {
  return Object.values(row).every((value) => text(value) === "");
}

function parseComponent(row: TabularRow): ImportedComponent | string {
  const name = text(cell(row, "name"));
  if (!name) return "Name is required";

  const width = positiveNumber(cell(row, "width"), "Width");
  if (typeof width === "string") return width;
  const height = positiveNumber(cell(row, "height"), "Height");
  if (typeof height === "string") return height;
  const maxHeight = positiveNumber(cell(row, "maxHeight"), "Max Height");
  if (typeof maxHeight === "string") return maxHeight;

  return {
    name,
    type: text(cell(row, "type"), "Other"),
    manufacturer: text(cell(row, "manufacturer")),
    partNumber: text(cell(row, "partNumber")),
    width,
    height,
    maxHeight,
    color: text(cell(row, "color"), "#64748b"),
  };
}

export function parseComponentRows(rows: readonly TabularRow[]): TabularParseResult<ImportedComponent> {
  const valid: ImportedComponent[] = [];
  const errors: TabularImportError[] = [];
  rows.forEach((row, index) => {
    if (isBlank(row)) return;
    const parsed = parseComponent(row);
    if (typeof parsed === "string") errors.push({ row: index + 2, message: parsed });
    else valid.push(parsed);
  });
  return { valid, errors };
}

export function parseBomRows(rows: readonly TabularRow[]): BomParseResult {
  const valid: ImportedBomItem[] = [];
  const errors: TabularImportError[] = [];
  const pending: PendingPlacement[] = [];
  rows.forEach((row, index) => {
    if (isBlank(row)) return;
    const parsed = parseComponent(row);
    if (typeof parsed === "string") {
      errors.push({ row: index + 2, message: parsed });
      return;
    }
    const quantity = positiveNumber(cell(row, "quantity"), "Quantity");
    if (typeof quantity === "string") {
      errors.push({ row: index + 2, message: quantity });
      return;
    }
    const item: ImportedBomItem = { ...parsed, quantity, reference: text(cell(row, "reference")) };
    valid.push(item);
    for (let count = 0; count < quantity; count += 1) pending.push({ ...item });
  });
  return { valid, errors, pending };
}

export function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row.length === 1 && row[0] === "" ? [] : row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value);
  if (row.length > 1 || row[0] !== "" || csv.length > 0) rows.push(row);
  return rows;
}

export function rowsFromCsv(csv: string): TabularRow[] {
  const [header = [], ...data] = parseCsvRows(csv);
  const normalizedHeader = header.map((value) => value.replace(/^\uFEFF/, ""));
  return data
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => Object.fromEntries(normalizedHeader.map((key, index) => [key, row[index] ?? ""])));
}
