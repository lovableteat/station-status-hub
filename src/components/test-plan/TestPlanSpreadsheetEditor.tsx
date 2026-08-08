import {
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Columns3,
  Copy,
  Eraser,
  FileSpreadsheet,
  Loader2,
  Plus,
  Redo2,
  Rows3,
  Save,
  Scissors,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  createSpreadsheetSelection,
  decodeSpreadsheetAddress as decodeAddress,
  doSpreadsheetRangesIntersect,
  encodeSpreadsheetAddress as encodeAddress,
  encodeSpreadsheetColumn as encodeColumn,
  formatSpreadsheetNumber,
  getSpreadsheetSelectionLabel,
  getSpreadsheetSelectionSize,
  moveSpreadsheetSelection,
  normalizeSpreadsheetSelection,
  parseSpreadsheetClipboard,
  serializeSpreadsheetClipboard,
  type SpreadsheetCellPosition as CellPosition,
  type SpreadsheetSelection,
} from "./spreadsheetInteraction";
import {
  insertFormattedWorksheet,
  insertLegacyWorksheet,
} from "./spreadsheetWorkbook";
import type { TestPlanFileRecord } from "./types";

type ExcelJsWorkbook = import("exceljs").Workbook;
type ExcelJsWorksheet = import("exceljs").Worksheet;
type ExcelJsCell = import("exceljs").Cell;
type ExcelJsBorder = Partial<import("exceljs").Border>;
type LegacySpreadsheetModule = typeof import("xlsx");
type LegacyWorkbook = import("xlsx").WorkBook;
type LegacyWorksheet = import("xlsx").WorkSheet;
type LegacyCell = import("xlsx").CellObject;

type EditorMode = "formatted" | "legacy";
type EditorStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface MergeRange {
  start: CellPosition;
  end: CellPosition;
  masterAddress: string;
}

const ROW_PAGE_SIZE = 100;
const COLUMN_PAGE_SIZE = 26;
const MIN_VISIBLE_ROWS = 30;
const MIN_VISIBLE_COLUMNS = 18;
const DEFAULT_THEME_COLORS = [
  "#ffffff",
  "#000000",
  "#e7e6e6",
  "#44546a",
  "#4472c4",
  "#ed7d31",
  "#a5a5a5",
  "#ffc000",
  "#5b9bd5",
  "#70ad47",
];
const INDEXED_COLORS = [
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#c0c0c0", "#808080",
  "#9999ff", "#993366", "#ffffcc", "#ccffff", "#660066", "#ff8080", "#0066cc", "#ccccff",
  "#000080", "#ff00ff", "#ffff00", "#00ffff", "#800080", "#800000", "#008080", "#0000ff",
  "#00ccff", "#ccffff", "#ccffcc", "#ffff99", "#99ccff", "#ff99cc", "#cc99ff", "#ffcc99",
  "#3366ff", "#33cccc", "#99cc00", "#ffcc00", "#ff9900", "#ff6600", "#666699", "#969696",
  "#003366", "#339966", "#003300", "#333300", "#993300", "#993366", "#333399", "#333333",
];

interface SpreadsheetColor {
  argb?: string;
  indexed?: number;
  theme?: number;
  tint?: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function decodeMergeRange(range: string): MergeRange {
  const [startAddress, endAddress = startAddress] = range.split(":");
  return {
    start: decodeAddress(startAddress),
    end: decodeAddress(endAddress),
    masterAddress: startAddress.replace(/\$/g, "").toUpperCase(),
  };
}

function findMerge(
  merges: MergeRange[],
  row: number,
  column: number,
): MergeRange | undefined {
  return merges.find((merge) => (
    row >= merge.start.row
    && row <= merge.end.row
    && column >= merge.start.column
    && column <= merge.end.column
  ));
}

function isFormulaValue(value: unknown): value is { formula?: string; sharedFormula?: string; result?: unknown } {
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}

function isRichTextValue(value: unknown): value is { richText: Array<{ text: string }> } {
  return Boolean(value && typeof value === "object" && "richText" in value);
}

function isHyperlinkValue(value: unknown): value is { text: string; hyperlink: string } {
  return Boolean(value && typeof value === "object" && "hyperlink" in value);
}

function valueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toLocaleString("zh-TW");
  if (typeof value === "object") {
    if ("error" in value) return String(value.error);
    if (isRichTextValue(value)) return value.richText.map((part) => part.text).join("");
    if (isHyperlinkValue(value)) return value.text;
  }
  return String(value);
}

function readFormattedCellValue(
  cell: ExcelJsCell | undefined,
  formatter?: (format: string, value: number) => string,
): string {
  if (!cell) return "";
  const value = isFormulaValue(cell.value) ? cell.value.result : cell.value;
  if (typeof value === "number") return formatSpreadsheetNumber(value, cell.numFmt, formatter);
  return cell.text || valueToText(value);
}

function readFormattedFormulaValue(cell: ExcelJsCell | undefined): string {
  if (!cell) return "";
  if (isFormulaValue(cell.value)) {
    const formula = cell.value.formula ?? cell.value.sharedFormula;
    return formula ? `=${formula}` : valueToText(cell.value.result);
  }
  return valueToText(cell.value);
}

function inferFormattedCellValue(value: string): import("exceljs").CellValue {
  if (value.startsWith("=") && value.length > 1) {
    return { formula: value.slice(1) };
  }
  const normalized = value.trim();
  if (/^(true|false)$/i.test(normalized)) return normalized.toLowerCase() === "true";
  const isNumeric = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(normalized);
  const hasSignificantLeadingZero = /^[-+]?0\d+/.test(normalized);
  if (isNumeric && !hasSignificantLeadingZero) return Number(normalized);
  return value;
}

function readLegacyCellValue(cell: LegacyCell | undefined): string {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  if (cell.v instanceof Date) return cell.v.toISOString();
  return cell.v === undefined || cell.v === null ? "" : String(cell.v);
}

function inferLegacyCellValue(
  value: string,
  previous: LegacyCell | undefined,
): LegacyCell {
  const next: LegacyCell = { ...(previous ?? {}), t: "s", v: value };
  delete next.w;
  delete next.f;

  if (value.startsWith("=") && value.length > 1) {
    next.t = "n";
    next.f = value.slice(1);
    delete next.v;
    return next;
  }

  const normalized = value.trim();
  if (/^(true|false)$/i.test(normalized)) {
    next.t = "b";
    next.v = normalized.toLowerCase() === "true";
    return next;
  }

  const isNumeric = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(normalized);
  const hasSignificantLeadingZero = /^[-+]?0\d+/.test(normalized);
  if (isNumeric && !hasSignificantLeadingZero) {
    next.t = "n";
    next.v = Number(normalized);
  }
  return next;
}

function applyTint(color: string, tint = 0): string {
  if (!tint) return color;
  const channels = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) return color;
  const adjusted = channels.map((channel) => (
    tint < 0
      ? Math.round(channel * (1 + tint))
      : Math.round(channel + (255 - channel) * tint)
  ));
  return `#${adjusted.map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function getWorkbookThemeColors(workbook: ExcelJsWorkbook): string[] {
  const themeXml = (workbook.model as { themes?: { theme1?: string } }).themes?.theme1;
  if (!themeXml) return DEFAULT_THEME_COLORS;

  const readThemeColor = (name: string): string | undefined => {
    const block = themeXml.match(new RegExp(`<a:${name}>[\\s\\S]*?<\\/a:${name}>`, "i"))?.[0];
    if (!block) return undefined;
    const value = block.match(/<a:srgbClr[^>]*val="([0-9a-f]{6,8})"/i)?.[1]
      ?? block.match(/<a:sysClr[^>]*lastClr="([0-9a-f]{6,8})"/i)?.[1];
    return value ? `#${value.slice(-6).toLowerCase()}` : undefined;
  };
  const names = [
    "lt1", "dk1", "lt2", "dk2", "accent1", "accent2",
    "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink",
  ];
  return names.map((name, index) => readThemeColor(name) ?? DEFAULT_THEME_COLORS[index] ?? "#000000");
}

function resolveColor(
  color: SpreadsheetColor | undefined,
  themeColors = DEFAULT_THEME_COLORS,
): string | undefined {
  if (!color) return undefined;
  let resolved: string | undefined;
  if (color.argb) {
    const normalized = color.argb.replace(/^#/, "");
    resolved = `#${normalized.length === 8 ? normalized.slice(2) : normalized}`;
  } else if (typeof color.indexed === "number" && color.indexed !== 64) {
    resolved = INDEXED_COLORS[color.indexed];
  } else if (typeof color.theme === "number") {
    resolved = themeColors[color.theme];
  }
  return resolved ? applyTint(resolved.toLowerCase(), color.tint) : undefined;
}

function borderToCss(
  border: ExcelJsBorder | undefined,
  themeColors: string[],
): string | undefined {
  if (!border?.style) return undefined;
  const width = border.style === "thick" || border.style === "double"
    ? 3
    : border.style.startsWith("medium")
      ? 2
      : 1;
  const line = border.style.includes("dash") || border.style === "dotted" ? "dashed" : "solid";
  return `${width}px ${line} ${resolveColor(border.color, themeColors) ?? "#808080"}`;
}

function getPatternBackground(
  fill: Extract<import("exceljs").Fill, { type: "pattern" }>,
  themeColors: string[],
): string {
  if (fill.pattern === "none") return "#ffffff";
  const foreground = resolveColor(fill.fgColor, themeColors);
  const background = resolveColor(fill.bgColor, themeColors) ?? "#ffffff";
  if (fill.pattern === "solid") return foreground ?? background;

  const ink = foreground ?? "#4b5563";
  if (fill.pattern === "mediumGray" || fill.pattern === "darkGray" || fill.pattern === "lightGray") {
    return `repeating-linear-gradient(45deg, ${ink} 0 1px, ${background} 1px 3px)`;
  }
  if (fill.pattern === "gray125" || fill.pattern === "gray0625") {
    return `radial-gradient(${ink} 0.7px, ${background} 0.8px) 0 0 / 4px 4px`;
  }
  if (fill.pattern.includes("Grid")) {
    return `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, ${background} 1px)`;
  }
  if (fill.pattern.includes("Vertical")) {
    return `repeating-linear-gradient(90deg, ${ink} 0 1px, ${background} 1px 4px)`;
  }
  if (fill.pattern.includes("Horizontal")) {
    return `repeating-linear-gradient(0deg, ${ink} 0 1px, ${background} 1px 4px)`;
  }
  const angle = fill.pattern.includes("Down") ? 45 : -45;
  return `repeating-linear-gradient(${angle}deg, ${ink} 0 1px, ${background} 1px 4px)`;
}

function getFormattedCellStyle(cell: ExcelJsCell, themeColors: string[]): CSSProperties {
  const fill = cell.fill;
  let background = "#ffffff";
  if (fill?.type === "pattern" && fill.pattern !== "none") {
    background = getPatternBackground(fill, themeColors);
  } else if (fill?.type === "gradient" && fill.stops?.length) {
    background = `linear-gradient(90deg, ${fill.stops
      .map((stop) => `${resolveColor(stop.color, themeColors) ?? "#ffffff"} ${Math.round(stop.position * 100)}%`)
      .join(", ")})`;
  }

  const font = cell.font ?? {};
  const alignment = cell.alignment ?? {};
  const border = cell.border ?? {};
  const effectiveValue = isFormulaValue(cell.value) ? cell.value.result : cell.value;
  const horizontal = alignment.horizontal === "centerContinuous" ? "center" : alignment.horizontal;

  return {
    background,
    color: resolveColor(font.color, themeColors) ?? "#111827",
    fontFamily: font.name ? `"${font.name}", Calibri, sans-serif` : "Calibri, sans-serif",
    fontSize: font.size ? `${font.size}pt` : "11pt",
    fontWeight: font.bold ? 700 : 400,
    fontStyle: font.italic ? "italic" : "normal",
    textDecoration: [font.underline ? "underline" : "", font.strike ? "line-through" : ""]
      .filter(Boolean)
      .join(" ") || undefined,
    textAlign: horizontal === "fill" || horizontal === "distributed"
      ? "left"
      : horizontal ?? (typeof effectiveValue === "number" ? "right" : "left"),
    verticalAlign: alignment.vertical === "middle" ? "middle" : alignment.vertical ?? "middle",
    whiteSpace: alignment.wrapText ? "pre-wrap" : "pre",
    borderTop: borderToCss(border.top, themeColors),
    borderRight: borderToCss(border.right, themeColors),
    borderBottom: borderToCss(border.bottom, themeColors),
    borderLeft: borderToCss(border.left, themeColors),
  };
}

function getColumnWidth(worksheet: ExcelJsWorksheet, column: number): number {
  const source = worksheet.getColumn(column);
  if (source.hidden) return 0;
  return clamp(Math.round((source.width ?? 10) * 7 + 12), 28, 520);
}

function getRowHeight(worksheet: ExcelJsWorksheet, row: number): number {
  const source = worksheet.getRow(row);
  if (source.hidden) return 0;
  return clamp(Math.round((source.height ?? worksheet.properties.defaultRowHeight ?? 15) * 1.333), 20, 640);
}

function getOutputFormat(extension: string) {
  const normalized = extension.toLowerCase();
  if (normalized === "xls") {
    return { bookType: "xls" as const, mimeType: "application/vnd.ms-excel" };
  }
  if (normalized === "xlsm") {
    return {
      bookType: "xlsm" as const,
      mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    };
  }
  if (normalized === "xlsb") {
    return {
      bookType: "xlsb" as const,
      mimeType: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    };
  }
  if (normalized === "ods") {
    return { bookType: "ods" as const, mimeType: "application/vnd.oasis.opendocument.spreadsheet" };
  }
  if (normalized === "csv") {
    return { bookType: "csv" as const, mimeType: "text/csv;charset=utf-8" };
  }
  return {
    bookType: "xlsx" as const,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

interface TestPlanSpreadsheetEditorProps {
  canEdit: boolean;
  downloadFile: (file: TestPlanFileRecord) => Promise<Blob>;
  file: TestPlanFileRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (file: TestPlanFileRecord, contents: Blob) => Promise<unknown>;
  open: boolean;
}

interface SpreadsheetCellChange {
  address: string;
  before: string;
  after: string;
}

export function TestPlanSpreadsheetEditor({
  canEdit,
  downloadFile,
  file,
  onOpenChange,
  onSave,
  open,
}: TestPlanSpreadsheetEditorProps) {
  const excelJsWorkbookRef = useRef<ExcelJsWorkbook | null>(null);
  const workbookThemeColorsRef = useRef<string[]>(DEFAULT_THEME_COLORS);
  const spreadsheetNumberFormatterRef = useRef<((format: string, value: number) => string) | undefined>(undefined);
  const legacyWorkbookRef = useRef<LegacyWorkbook | null>(null);
  const legacyModuleRef = useRef<LegacySpreadsheetModule | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const selectingRef = useRef(false);
  const skipEditCommitRef = useRef(false);
  const undoStackRef = useRef<SpreadsheetCellChange[][]>([]);
  const redoStackRef = useRef<SpreadsheetCellChange[][]>([]);
  const structureDirtyRef = useRef(false);
  const [mode, setMode] = useState<EditorMode>("formatted");
  const [sheetName, setSheetName] = useState("");
  const [selection, setSelection] = useState<SpreadsheetSelection>(() => createSpreadsheetSelection());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [rowPage, setRowPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const [, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !file) return undefined;
    let active = true;
    excelJsWorkbookRef.current = null;
    workbookThemeColorsRef.current = DEFAULT_THEME_COLORS;
    spreadsheetNumberFormatterRef.current = undefined;
    legacyWorkbookRef.current = null;
    legacyModuleRef.current = null;
    setStatus("loading");
    setError("");
    setDirty(false);
    structureDirtyRef.current = false;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setRevision(0);
    setRowPage(0);
    setColumnPage(0);

    void downloadFile(file)
      .then(async (blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        if (file.extension.toLowerCase() === "xlsx") {
          const [ExcelJS, spreadsheet] = await Promise.all([
            import("exceljs"),
            import("xlsx"),
          ]);
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(arrayBuffer as unknown as Buffer);
          if (!active) return;
          if (workbook.worksheets.length === 0) throw new Error("這份 Excel 沒有可編輯的工作表。");
          excelJsWorkbookRef.current = workbook;
          workbookThemeColorsRef.current = getWorkbookThemeColors(workbook);
          spreadsheetNumberFormatterRef.current = spreadsheet.SSF.format;
          setMode("formatted");
          setSheetName(workbook.worksheets[0].name);
        } else {
          const spreadsheet = await import("xlsx");
          const workbook = spreadsheet.read(arrayBuffer, {
            type: "array",
            cellDates: true,
            cellStyles: true,
            cellFormula: true,
            cellNF: true,
            bookVBA: true,
          });
          if (!active) return;
          if (workbook.SheetNames.length === 0) throw new Error("這份試算表沒有可編輯的工作表。");
          legacyModuleRef.current = spreadsheet;
          legacyWorkbookRef.current = workbook;
          setMode("legacy");
          setSheetName(workbook.SheetNames[0]);
        }
        setSelection(createSpreadsheetSelection());
        setEditingCell(null);
        setStatus("ready");
      })
      .catch((caught) => {
        if (!active) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "無法讀取這份試算表。");
      });

    return () => {
      active = false;
    };
  }, [downloadFile, file, open]);

  useEffect(() => {
    const stopSelecting = () => {
      selectingRef.current = false;
    };
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, []);

  const formattedWorksheet = mode === "formatted"
    ? excelJsWorkbookRef.current?.getWorksheet(sheetName) ?? null
    : null;
  const legacyWorksheet = mode === "legacy"
    ? legacyWorkbookRef.current?.Sheets[sheetName] ?? null
    : null;
  const bounds = (() => {
    if (formattedWorksheet) {
      return {
        rows: Math.max(formattedWorksheet.rowCount, MIN_VISIBLE_ROWS),
        columns: Math.max(formattedWorksheet.columnCount, MIN_VISIBLE_COLUMNS),
      };
    }
    if (legacyWorksheet && legacyModuleRef.current) {
      const range = legacyModuleRef.current.utils.decode_range(legacyWorksheet["!ref"] ?? "A1");
      return {
        rows: Math.max(range.e.r + 1, MIN_VISIBLE_ROWS),
        columns: Math.max(range.e.c + 1, MIN_VISIBLE_COLUMNS),
      };
    }
    return { rows: MIN_VISIBLE_ROWS, columns: MIN_VISIBLE_COLUMNS };
  })();
  const rowPageCount = Math.max(1, Math.ceil(bounds.rows / ROW_PAGE_SIZE));
  const columnPageCount = Math.max(1, Math.ceil(bounds.columns / COLUMN_PAGE_SIZE));
  const firstRow = rowPage * ROW_PAGE_SIZE + 1;
  const lastRow = Math.min(bounds.rows, firstRow + ROW_PAGE_SIZE - 1);
  const firstColumn = mode === "formatted" ? 1 : columnPage * COLUMN_PAGE_SIZE + 1;
  const lastColumn = mode === "formatted"
    ? bounds.columns
    : Math.min(bounds.columns, firstColumn + COLUMN_PAGE_SIZE - 1);
  const rows = Array.from({ length: Math.max(0, lastRow - firstRow + 1) }, (_, index) => firstRow + index);
  const columns = Array.from(
    { length: Math.max(0, lastColumn - firstColumn + 1) },
    (_, index) => firstColumn + index,
  );
  const merges = formattedWorksheet
    ? (formattedWorksheet.model.merges ?? []).map(decodeMergeRange)
    : [];
  const normalizedSelection = normalizeSpreadsheetSelection(selection);
  const selectedCell = encodeAddress(selection.focus.row, selection.focus.column);

  const getMasterAddress = (row: number, column: number): string => (
    findMerge(merges, row, column)?.masterAddress ?? encodeAddress(row, column)
  );

  const normalizeEditableAddress = (address: string): string => {
    const position = decodeAddress(address);
    return getMasterAddress(position.row, position.column);
  };

  const readCellInputValue = (address: string): string => {
    const editableAddress = normalizeEditableAddress(address);
    if (formattedWorksheet) return readFormattedFormulaValue(formattedWorksheet.getCell(editableAddress));
    return readLegacyCellValue(legacyWorksheet?.[editableAddress] as LegacyCell | undefined);
  };

  const writeCellInputValue = (address: string, value: string) => {
    const editableAddress = normalizeEditableAddress(address);
    if (formattedWorksheet) {
      formattedWorksheet.getCell(editableAddress).value = inferFormattedCellValue(value);
      return;
    }
    if (!legacyWorksheet || !legacyModuleRef.current) return;
    legacyWorksheet[editableAddress] = inferLegacyCellValue(
      value,
      legacyWorksheet[editableAddress] as LegacyCell | undefined,
    );
    const cell = legacyModuleRef.current.utils.decode_cell(editableAddress);
    const range = legacyModuleRef.current.utils.decode_range(legacyWorksheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
    legacyWorksheet["!ref"] = legacyModuleRef.current.utils.encode_range(range);
  };

  const commitCellChanges = (
    requestedChanges: Array<{ address: string; value: string }>,
    recordHistory = true,
  ): SpreadsheetCellChange[] => {
    if (!canEdit && recordHistory) return [];
    const pending = new Map<string, SpreadsheetCellChange>();
    requestedChanges.forEach(({ address, value }) => {
      const editableAddress = normalizeEditableAddress(address);
      const previous = pending.get(editableAddress);
      pending.set(editableAddress, {
        address: editableAddress,
        before: previous?.before ?? readCellInputValue(editableAddress),
        after: value,
      });
    });
    const changes = [...pending.values()].filter((change) => change.before !== change.after);
    if (!changes.length) return [];

    changes.forEach((change) => writeCellInputValue(change.address, change.after));
    if (recordHistory) {
      undoStackRef.current.push(changes);
      redoStackRef.current = [];
    }
    setDirty(true);
    setRevision((current) => current + 1);
    return changes;
  };

  const updateCell = (address: string, value: string) => {
    commitCellChanges([{ address, value }]);
  };

  const revealSelection = (nextSelection: SpreadsheetSelection) => {
    const focus = nextSelection.focus;
    setSelection(nextSelection);
    setRowPage(Math.floor((focus.row - 1) / ROW_PAGE_SIZE));
    if (mode === "legacy") setColumnPage(Math.floor((focus.column - 1) / COLUMN_PAGE_SIZE));
    const address = encodeAddress(focus.row, focus.column);
    window.requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-cell-address="${address}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const selectPosition = (position: CellPosition, extend = false) => {
    const master = decodeAddress(getMasterAddress(position.row, position.column));
    revealSelection({
      anchor: extend ? selection.anchor : master,
      focus: master,
    });
  };

  const startEditing = (address: string, replacement?: string) => {
    if (!canEdit) return;
    const editableAddress = normalizeEditableAddress(address);
    const position = decodeAddress(editableAddress);
    skipEditCommitRef.current = false;
    setSelection({ anchor: position, focus: position });
    setEditingCell(editableAddress);
    setEditingValue(replacement ?? readCellInputValue(editableAddress));
  };

  const commitEditing = () => {
    if (!editingCell) return;
    if (skipEditCommitRef.current) {
      skipEditCommitRef.current = false;
      setEditingCell(null);
      return;
    }
    const address = editingCell;
    const value = editingValue;
    setEditingCell(null);
    updateCell(address, value);
  };

  const cancelEditing = () => {
    skipEditCommitRef.current = true;
    setEditingCell(null);
    window.requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
  };

  const commitEditingAndMove = (rowDelta: number, columnDelta: number) => {
    if (!editingCell) return;
    const position = decodeAddress(editingCell);
    skipEditCommitRef.current = true;
    updateCell(editingCell, editingValue);
    setEditingCell(null);
    revealSelection(moveSpreadsheetSelection(
      { anchor: position, focus: position },
      rowDelta,
      columnDelta,
      bounds.rows,
      bounds.columns,
      false,
    ));
    window.requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
  };

  const collectSelectionAddresses = (): string[] => {
    const addresses = new Set<string>();
    for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
      for (let column = normalizedSelection.startColumn; column <= normalizedSelection.endColumn; column += 1) {
        addresses.add(getMasterAddress(row, column));
      }
    }
    return [...addresses];
  };

  const clearSelection = () => {
    if (!canEdit) return;
    commitCellChanges(collectSelectionAddresses().map((address) => ({ address, value: "" })));
  };

  const getSelectionClipboardText = (): string => {
    const matrix: string[][] = [];
    for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
      const values: string[] = [];
      for (let column = normalizedSelection.startColumn; column <= normalizedSelection.endColumn; column += 1) {
        const address = encodeAddress(row, column);
        const masterAddress = getMasterAddress(row, column);
        values.push(address === masterAddress ? readCellInputValue(masterAddress) : "");
      }
      matrix.push(values);
    }
    return serializeSpreadsheetClipboard(matrix);
  };

  const applyClipboardMatrix = (matrix: string[][]) => {
    if (!canEdit || !matrix.length) return;
    const changes: Array<{ address: string; value: string }> = [];
    const isSingleValue = matrix.length === 1 && matrix[0]?.length === 1;
    if (isSingleValue && getSpreadsheetSelectionSize(normalizedSelection) > 1) {
      collectSelectionAddresses().forEach((address) => changes.push({ address, value: matrix[0][0] }));
      commitCellChanges(changes);
      return;
    }

    const start = selection.focus;
    matrix.forEach((values, rowOffset) => {
      values.forEach((value, columnOffset) => {
        changes.push({
          address: encodeAddress(start.row + rowOffset, start.column + columnOffset),
          value,
        });
      });
    });
    commitCellChanges(changes);
    const end = {
      row: start.row + matrix.length - 1,
      column: start.column + Math.max(1, ...matrix.map((values) => values.length)) - 1,
    };
    revealSelection({ anchor: start, focus: end });
  };

  const copySelectionToClipboard = async (cut = false) => {
    try {
      await navigator.clipboard.writeText(getSelectionClipboardText());
      if (cut) clearSelection();
      setError("");
    } catch {
      setError("瀏覽器拒絕存取剪貼簿；請先點選工作表，再使用 Ctrl+C、Ctrl+X 或 Ctrl+V。");
    }
  };

  const pasteFromClipboard = async () => {
    if (!canEdit) return;
    try {
      applyClipboardMatrix(parseSpreadsheetClipboard(await navigator.clipboard.readText()));
      setError("");
    } catch {
      setError("瀏覽器拒絕讀取剪貼簿；請直接在工作表上按 Ctrl+V 貼上。");
    }
  };

  const undo = () => {
    const changes = undoStackRef.current.pop();
    if (!changes) return;
    changes.forEach((change) => writeCellInputValue(change.address, change.before));
    redoStackRef.current.push(changes);
    setDirty(structureDirtyRef.current || undoStackRef.current.length > 0);
    setRevision((current) => current + 1);
  };

  const redo = () => {
    const changes = redoStackRef.current.pop();
    if (!changes) return;
    changes.forEach((change) => writeCellInputValue(change.address, change.after));
    undoStackRef.current.push(changes);
    setDirty(true);
    setRevision((current) => current + 1);
  };

  const handleGridCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", getSelectionClipboardText());
  };

  const handleGridCut = (event: ReactClipboardEvent<HTMLDivElement>) => {
    handleGridCopy(event);
    clearSelection();
  };

  const handleGridPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    event.preventDefault();
    applyClipboardMatrix(parseSpreadsheetClipboard(event.clipboardData.getData("text/plain")));
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (command && key === "a") {
      event.preventDefault();
      setSelection({
        anchor: { row: 1, column: 1 },
        focus: { row: bounds.rows, column: bounds.columns },
      });
      return;
    }
    if (command && key === "z") {
      event.preventDefault();
      if (!canEdit) return;
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && key === "y") {
      event.preventDefault();
      if (canEdit) redo();
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (key === "f2") {
      event.preventDefault();
      startEditing(selectedCell);
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      revealSelection({ anchor: selection.focus, focus: selection.focus });
      return;
    }

    let rowDelta = 0;
    let columnDelta = 0;
    if (key === "arrowup") rowDelta = command ? 1 - selection.focus.row : -1;
    else if (key === "arrowdown") rowDelta = command ? bounds.rows - selection.focus.row : 1;
    else if (key === "arrowleft") columnDelta = command ? 1 - selection.focus.column : -1;
    else if (key === "arrowright") columnDelta = command ? bounds.columns - selection.focus.column : 1;
    else if (key === "tab") columnDelta = event.shiftKey ? -1 : 1;
    else if (key === "enter") rowDelta = event.shiftKey ? -1 : 1;
    else if (key === "pageup") rowDelta = -Math.min(20, ROW_PAGE_SIZE);
    else if (key === "pagedown") rowDelta = Math.min(20, ROW_PAGE_SIZE);
    else if (key === "home") columnDelta = 1 - selection.focus.column;
    else if (key === "end") columnDelta = bounds.columns - selection.focus.column;

    if (rowDelta || columnDelta) {
      event.preventDefault();
      revealSelection(moveSpreadsheetSelection(
        selection,
        rowDelta,
        columnDelta,
        bounds.rows,
        bounds.columns,
        event.shiftKey && key !== "tab" && key !== "enter",
      ));
      return;
    }

    if (!command && !event.altKey && canEdit && event.key.length === 1) {
      event.preventDefault();
      startEditing(selectedCell, event.key);
    }
  };

  const extendSheet = (axis: "row" | "column") => {
    if (!canEdit) return;
    const insertedSelection = formattedWorksheet
      ? insertFormattedWorksheet(formattedWorksheet, selection, axis, bounds)
      : legacyWorksheet && legacyModuleRef.current
        ? insertLegacyWorksheet(legacyModuleRef.current, legacyWorksheet, selection, axis, bounds)
        : null;
    if (!insertedSelection) return;
    structureDirtyRef.current = true;
    setDirty(true);
    setRevision((current) => current + 1);
    revealSelection({ anchor: insertedSelection, focus: insertedSelection });
  };

  const requestClose = () => {
    if (dirty && !window.confirm("這份 Excel 還沒有儲存，確定要關閉嗎？")) return;
    onOpenChange(false);
  };

  const saveWorkbook = async () => {
    if (!file || !canEdit) return;
    setStatus("saving");
    setError("");
    try {
      let contents: Blob;
      if (mode === "formatted" && excelJsWorkbookRef.current) {
        excelJsWorkbookRef.current.calcProperties.fullCalcOnLoad = true;
        const output = await excelJsWorkbookRef.current.xlsx.writeBuffer();
        contents = new Blob([new Uint8Array(output)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else if (legacyModuleRef.current && legacyWorkbookRef.current) {
        const outputFormat = getOutputFormat(file.extension);
        const output = legacyModuleRef.current.write(legacyWorkbookRef.current, {
          type: "array",
          bookType: outputFormat.bookType,
          bookVBA: true,
          cellStyles: true,
          compression: true,
        }) as ArrayBuffer;
        contents = new Blob([output], { type: outputFormat.mimeType });
      } else {
        throw new Error("試算表尚未載入完成。");
      }
      await onSave(file, contents);
      structureDirtyRef.current = false;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setDirty(false);
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "儲存 Excel 失敗，原檔沒有被覆蓋。");
    }
  };

  const sheetNames = mode === "formatted"
    ? excelJsWorkbookRef.current?.worksheets.map((sheet) => sheet.name) ?? []
    : legacyWorkbookRef.current?.SheetNames ?? [];
  const sheetTabs = sheetNames.map((name) => {
    const worksheet = mode === "formatted"
      ? excelJsWorkbookRef.current?.getWorksheet(name)
      : undefined;
    return {
      name,
      tabColor: worksheet
        ? resolveColor(
          worksheet.properties.tabColor,
          workbookThemeColorsRef.current,
        ) ?? "#64748b"
        : "#64748b",
    };
  });
  const selectedValue = readCellInputValue(selectedCell);
  const selectionLabel = getSpreadsheetSelectionLabel(selection);
  const selectionSize = getSpreadsheetSelectionSize(normalizedSelection);
  const isWholeSheetSelected = normalizedSelection.startRow === 1
    && normalizedSelection.startColumn === 1
    && normalizedSelection.endRow === bounds.rows
    && normalizedSelection.endColumn === bounds.columns;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
      <DialogContent className="test-plan-sheet-dialog" aria-describedby="test-plan-sheet-description">
        <DialogHeader className="test-plan-sheet-heading">
          <span className="test-plan-sheet-heading-icon"><FileSpreadsheet className="h-5 w-5" /></span>
          <div>
            <DialogTitle>{file?.originalName ?? "Excel 線上編輯"}</DialogTitle>
            <DialogDescription id="test-plan-sheet-description">
              {mode === "formatted"
                ? "保留原始工作表的合併儲存格、尺寸、底色、字型與邊框。"
                : "舊格式使用相容編輯模式；內容可直接修改並儲存回原檔。"}
            </DialogDescription>
          </div>
          <div className="test-plan-sheet-heading-actions">
            {status !== "loading" && (
              <span className={`test-plan-sheet-fidelity is-${mode}`}>
                {mode === "formatted" ? "原始格式" : "相容模式"}
              </span>
            )}
            {dirty && <span className="test-plan-sheet-dirty">尚未儲存</span>}
            <Button type="button" variant="outline" onClick={requestClose}>關閉</Button>
            <Button
              type="button"
              disabled={!canEdit || !dirty || status === "saving"}
              onClick={() => void saveWorkbook()}
            >
              {status === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              儲存回原檔
            </Button>
          </div>
        </DialogHeader>

        {status === "loading" ? (
          <div className="test-plan-sheet-state">
            <Loader2 className="h-7 w-7 animate-spin" />
            <strong>正在還原 Excel 版面</strong>
            <span>大型活頁簿或含有大量樣式時，需要稍候幾秒。</span>
          </div>
        ) : status === "error" && !excelJsWorkbookRef.current && !legacyWorkbookRef.current ? (
          <div className="test-plan-sheet-state is-error">
            <FileSpreadsheet className="h-7 w-7" />
            <strong>無法開啟這份試算表</strong>
            <span>{error}</span>
          </div>
        ) : (
          <div className="test-plan-sheet-workspace">
            <div className="test-plan-sheet-toolbar">
              <div className="test-plan-sheet-edit-tools" role="toolbar" aria-label="試算表編輯工具">
                <Button type="button" size="icon" variant="outline" disabled={!canEdit || undoStackRef.current.length === 0} onClick={undo} title="復原 (Ctrl+Z)" aria-label="復原">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" disabled={!canEdit || redoStackRef.current.length === 0} onClick={redo} title="重做 (Ctrl+Y)" aria-label="重做">
                  <Redo2 className="h-4 w-4" />
                </Button>
                <span className="test-plan-sheet-tool-divider" aria-hidden="true" />
                <Button type="button" size="icon" variant="outline" onClick={() => void copySelectionToClipboard()} title="複製 (Ctrl+C)" aria-label="複製選取範圍">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" disabled={!canEdit} onClick={() => void copySelectionToClipboard(true)} title="剪下 (Ctrl+X)" aria-label="剪下選取範圍">
                  <Scissors className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" disabled={!canEdit} onClick={() => void pasteFromClipboard()} title="貼上 (Ctrl+V)" aria-label="貼上">
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" disabled={!canEdit} onClick={clearSelection} title="清除內容 (Delete)" aria-label="清除選取範圍內容">
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>
              <div className="test-plan-sheet-tools">
                <Button type="button" size="sm" variant="outline" disabled={!canEdit} aria-label="向下插入列" title="向下插入列" onClick={() => extendSheet("row")}>
                  <Rows3 className="mr-2 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />向下插入列
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!canEdit} aria-label="向右插入欄" title="向右插入欄" onClick={() => extendSheet("column")}>
                  <Columns3 className="mr-2 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />向右插入欄
                </Button>
              </div>
            </div>

            <div className="test-plan-sheet-formula">
              <div className="test-plan-sheet-selection-name">
                <strong>{selectedCell}</strong>
                {selectionSize > 1 && <span>{selectionLabel} · {selectionSize} 格</span>}
              </div>
              <Input
                key={`${sheetName}-${selectedCell}-${selectedValue}`}
                defaultValue={selectedValue}
                readOnly={!canEdit}
                aria-label={`${selectedCell} 內容或公式`}
                onBlur={(event) => updateCell(selectedCell, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    window.requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.value = selectedValue;
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>

            {error && <div className="test-plan-sheet-error" role="alert">{error}</div>}

            <div
              ref={gridRef}
              className={`test-plan-sheet-grid-wrap is-${mode}`}
              tabIndex={0}
              role="grid"
              aria-label={`${sheetName} 工作表，${selectionLabel} 已選取`}
              onKeyDown={handleGridKeyDown}
              onCopy={handleGridCopy}
              onCut={handleGridCut}
              onPaste={handleGridPaste}
            >
              <table className={`test-plan-sheet-grid is-${mode}`}>
                <colgroup>
                  <col className="test-plan-sheet-row-number-column" />
                  {columns.map((column) => (
                    <col
                      key={column}
                      style={formattedWorksheet
                        ? { width: getColumnWidth(formattedWorksheet, column) }
                        : undefined}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className={`test-plan-sheet-corner ${isWholeSheetSelected ? "is-selected" : ""}`}>
                      <button
                        type="button"
                        title="全選工作表 (Ctrl+A)"
                        aria-label="全選工作表"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSelection({
                            anchor: { row: 1, column: 1 },
                            focus: { row: bounds.rows, column: bounds.columns },
                          });
                          gridRef.current?.focus({ preventScroll: true });
                        }}
                      />
                    </th>
                    {columns.map((column) => (
                      <th
                        key={column}
                        className={column >= normalizedSelection.startColumn && column <= normalizedSelection.endColumn ? "is-selected" : undefined}
                      >
                        <button
                          type="button"
                          aria-label={`選取 ${encodeColumn(column)} 欄`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            const anchorColumn = event.shiftKey ? selection.anchor.column : column;
                            setSelection({
                              anchor: { row: 1, column: anchorColumn },
                              focus: { row: bounds.rows, column },
                            });
                            gridRef.current?.focus({ preventScroll: true });
                          }}
                        >
                          {encodeColumn(column)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row}
                      style={formattedWorksheet ? { height: getRowHeight(formattedWorksheet, row) } : undefined}
                    >
                      <th className={row >= normalizedSelection.startRow && row <= normalizedSelection.endRow ? "is-selected" : undefined}>
                        <button
                          type="button"
                          aria-label={`選取第 ${row} 列`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            const anchorRow = event.shiftKey ? selection.anchor.row : row;
                            setSelection({
                              anchor: { row: anchorRow, column: 1 },
                              focus: { row, column: bounds.columns },
                            });
                            gridRef.current?.focus({ preventScroll: true });
                          }}
                        >
                          {row}
                        </button>
                      </th>
                      {columns.map((column) => {
                        const address = encodeAddress(row, column);
                        const merge = formattedWorksheet ? findMerge(merges, row, column) : undefined;
                        const renderRow = merge ? Math.max(merge.start.row, firstRow) : row;
                        const renderColumn = merge ? Math.max(merge.start.column, firstColumn) : column;
                        if (merge && (row !== renderRow || column !== renderColumn)) return null;
                        const masterAddress = merge?.masterAddress ?? address;
                        const formattedCell = formattedWorksheet?.getCell(masterAddress);
                        const cellStyle = formattedCell
                          ? getFormattedCellStyle(formattedCell, workbookThemeColorsRef.current)
                          : undefined;
                        const displayValue = formattedCell
                          ? readFormattedCellValue(formattedCell, spreadsheetNumberFormatterRef.current)
                          : readLegacyCellValue(legacyWorksheet?.[address] as LegacyCell | undefined);
                        const cellStartRow = merge?.start.row ?? row;
                        const cellEndRow = merge?.end.row ?? row;
                        const cellStartColumn = merge?.start.column ?? column;
                        const cellEndColumn = merge?.end.column ?? column;
                        const isRangeSelected = doSpreadsheetRangesIntersect(
                          normalizedSelection,
                          cellStartRow,
                          cellEndRow,
                          cellStartColumn,
                          cellEndColumn,
                        );
                        const isActive = selectedCell === masterAddress;
                        return (
                          <td
                            key={address}
                            className={[
                              isRangeSelected ? "is-range-selected" : "",
                              isActive ? "is-active" : "",
                            ].filter(Boolean).join(" ") || undefined}
                            data-cell-address={masterAddress}
                            rowSpan={merge ? Math.min(merge.end.row, lastRow) - renderRow + 1 : undefined}
                            colSpan={merge ? Math.min(merge.end.column, lastColumn) - renderColumn + 1 : undefined}
                            style={cellStyle}
                            onMouseDown={(event) => {
                              if (event.button !== 0 || editingCell === masterAddress) return;
                              event.preventDefault();
                              if (editingCell) commitEditing();
                              selectingRef.current = true;
                              selectPosition(decodeAddress(masterAddress), event.shiftKey);
                              gridRef.current?.focus({ preventScroll: true });
                            }}
                            onMouseEnter={(event) => {
                              if (!selectingRef.current || event.buttons !== 1) return;
                              const focus = decodeAddress(masterAddress);
                              setSelection((current) => ({ anchor: current.anchor, focus }));
                            }}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              selectingRef.current = false;
                              startEditing(masterAddress);
                            }}
                          >
                            {editingCell === masterAddress ? (
                              <textarea
                                autoFocus
                                value={editingValue}
                                aria-label={`${masterAddress} 編輯內容`}
                                data-spreadsheet-editor="true"
                                onChange={(event) => setEditingValue(event.target.value)}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={commitEditing}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEditing();
                                  } else if (event.key === "Enter" && !event.altKey) {
                                    event.preventDefault();
                                    commitEditingAndMove(event.shiftKey ? -1 : 1, 0);
                                  } else if (event.key === "Tab") {
                                    event.preventDefault();
                                    commitEditingAndMove(0, event.shiftKey ? -1 : 1);
                                  }
                                }}
                              />
                            ) : (
                              <div
                                className="test-plan-sheet-cell-display"
                                data-spreadsheet-cell="true"
                                aria-label={`${masterAddress}: ${displayValue}`}
                              >
                                {displayValue}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="test-plan-sheet-footer">
              <div className="test-plan-sheet-tabs" role="tablist" aria-label="工作表">
                {sheetTabs.map(({ name, tabColor }) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={sheetName === name}
                    className={sheetName === name ? "is-active" : undefined}
                    style={{ "--test-plan-sheet-tab-color": tabColor } as CSSProperties}
                    onClick={() => {
                      setSheetName(name);
                      setSelection(createSpreadsheetSelection());
                      setEditingCell(null);
                      setRowPage(0);
                      setColumnPage(0);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="test-plan-sheet-pagination">
              <span className="test-plan-sheet-selection-status">
                {selectionLabel} · {selectionSize} 格已選取
              </span>
              {mode === "legacy" ? (
                <div>
                  <Button type="button" size="sm" variant="outline" disabled={columnPage === 0} onClick={() => setColumnPage((current) => current - 1)}>
                    <ChevronLeft className="h-4 w-4" />上一組欄
                  </Button>
                  <span>欄 {firstColumn}-{lastColumn} / {bounds.columns}</span>
                  <Button type="button" size="sm" variant="outline" disabled={columnPage + 1 >= columnPageCount} onClick={() => setColumnPage((current) => current + 1)}>
                    下一組欄<ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <span>已依照原檔欄寬顯示，可左右捲動查看完整內容</span>
              )}
              <div>
                <Button type="button" size="sm" variant="outline" disabled={rowPage === 0} onClick={() => setRowPage((current) => current - 1)}>
                  <ChevronLeft className="h-4 w-4" />上一頁
                </Button>
                <span>列 {firstRow}-{lastRow} / {bounds.rows}</span>
                <Button type="button" size="sm" variant="outline" disabled={rowPage + 1 >= rowPageCount} onClick={() => setRowPage((current) => current + 1)}>
                  下一頁<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
