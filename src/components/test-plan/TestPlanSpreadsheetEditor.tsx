import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileSpreadsheet,
  Loader2,
  Plus,
  Rows3,
  Save,
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

interface CellPosition {
  row: number;
  column: number;
}

interface MergeRange {
  start: CellPosition;
  end: CellPosition;
  masterAddress: string;
}

const ROW_PAGE_SIZE = 100;
const COLUMN_PAGE_SIZE = 26;
const MIN_VISIBLE_ROWS = 30;
const MIN_VISIBLE_COLUMNS = 18;
const THEME_COLORS = [
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function encodeColumn(column: number): string {
  let value = column;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function encodeAddress(row: number, column: number): string {
  return `${encodeColumn(column)}${row}`;
}

function decodeAddress(address: string): CellPosition {
  const match = address.replace(/\$/g, "").match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { row: 1, column: 1 };
  const column = match[1]
    .toUpperCase()
    .split("")
    .reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
  return { row: Number(match[2]), column };
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

function readFormattedCellValue(cell: ExcelJsCell | undefined): string {
  if (!cell) return "";
  if (isFormulaValue(cell.value)) {
    return valueToText(cell.value.result);
  }
  return cell.text || valueToText(cell.value);
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

function resolveColor(color: { argb?: string; theme?: number } | undefined): string | undefined {
  if (!color) return undefined;
  if (color.argb) {
    const normalized = color.argb.replace(/^#/, "");
    return `#${normalized.length === 8 ? normalized.slice(2) : normalized}`;
  }
  if (typeof color.theme === "number") return THEME_COLORS[color.theme];
  return undefined;
}

function borderToCss(border: ExcelJsBorder | undefined): string | undefined {
  if (!border?.style) return undefined;
  const width = border.style === "thick" || border.style === "double"
    ? 3
    : border.style.startsWith("medium")
      ? 2
      : 1;
  const line = border.style.includes("dash") || border.style === "dotted" ? "dashed" : "solid";
  return `${width}px ${line} ${resolveColor(border.color) ?? "#808080"}`;
}

function getFormattedCellStyle(cell: ExcelJsCell): CSSProperties {
  const fill = cell.fill;
  let background = "#ffffff";
  if (fill?.type === "pattern" && fill.pattern !== "none") {
    background = resolveColor(fill.fgColor) ?? resolveColor(fill.bgColor) ?? background;
  } else if (fill?.type === "gradient" && fill.stops?.length) {
    background = `linear-gradient(90deg, ${fill.stops
      .map((stop) => `${resolveColor(stop.color) ?? "#ffffff"} ${Math.round(stop.position * 100)}%`)
      .join(", ")})`;
  }

  const font = cell.font ?? {};
  const alignment = cell.alignment ?? {};
  const border = cell.border ?? {};
  const effectiveValue = isFormulaValue(cell.value) ? cell.value.result : cell.value;
  const horizontal = alignment.horizontal === "centerContinuous" ? "center" : alignment.horizontal;

  return {
    background,
    color: resolveColor(font.color) ?? "#111827",
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
    borderTop: borderToCss(border.top),
    borderRight: borderToCss(border.right),
    borderBottom: borderToCss(border.bottom),
    borderLeft: borderToCss(border.left),
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

export function TestPlanSpreadsheetEditor({
  canEdit,
  downloadFile,
  file,
  onOpenChange,
  onSave,
  open,
}: TestPlanSpreadsheetEditorProps) {
  const excelJsWorkbookRef = useRef<ExcelJsWorkbook | null>(null);
  const legacyWorkbookRef = useRef<LegacyWorkbook | null>(null);
  const legacyModuleRef = useRef<LegacySpreadsheetModule | null>(null);
  const [mode, setMode] = useState<EditorMode>("formatted");
  const [sheetName, setSheetName] = useState("");
  const [selectedCell, setSelectedCell] = useState("A1");
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
    legacyWorkbookRef.current = null;
    legacyModuleRef.current = null;
    setStatus("loading");
    setError("");
    setDirty(false);
    setRevision(0);
    setRowPage(0);
    setColumnPage(0);

    void downloadFile(file)
      .then(async (blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        if (file.extension.toLowerCase() === "xlsx") {
          const ExcelJS = await import("exceljs");
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(arrayBuffer as unknown as Buffer);
          if (!active) return;
          if (workbook.worksheets.length === 0) throw new Error("這份 Excel 沒有可編輯的工作表。");
          excelJsWorkbookRef.current = workbook;
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
        setSelectedCell("A1");
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

  const updateCell = (address: string, value: string) => {
    if (!canEdit) return;
    if (formattedWorksheet) {
      const target = formattedWorksheet.getCell(address);
      const editableCell = target.isMerged ? target.master : target;
      editableCell.value = inferFormattedCellValue(value);
      setSelectedCell(editableCell.address);
    } else if (legacyWorksheet && legacyModuleRef.current) {
      legacyWorksheet[address] = inferLegacyCellValue(
        value,
        legacyWorksheet[address] as LegacyCell | undefined,
      );
      const cell = legacyModuleRef.current.utils.decode_cell(address);
      const range = legacyModuleRef.current.utils.decode_range(legacyWorksheet["!ref"] ?? "A1");
      range.e.r = Math.max(range.e.r, cell.r);
      range.e.c = Math.max(range.e.c, cell.c);
      legacyWorksheet["!ref"] = legacyModuleRef.current.utils.encode_range(range);
      setSelectedCell(address);
    } else {
      return;
    }
    setDirty(true);
    setRevision((current) => current + 1);
  };

  const extendSheet = (axis: "row" | "column") => {
    if (!canEdit) return;
    if (formattedWorksheet) {
      if (axis === "row") {
        formattedWorksheet.getRow(bounds.rows + 1).height = formattedWorksheet.properties.defaultRowHeight ?? 15;
        formattedWorksheet.getCell(bounds.rows + 1, 1).value = "";
      } else {
        formattedWorksheet.getColumn(bounds.columns + 1).width = 10;
        formattedWorksheet.getCell(1, bounds.columns + 1).value = "";
      }
    } else if (legacyWorksheet && legacyModuleRef.current) {
      const range = legacyModuleRef.current.utils.decode_range(legacyWorksheet["!ref"] ?? "A1");
      if (axis === "row") range.e.r = Math.max(range.e.r, bounds.rows - 1) + 1;
      else range.e.c = Math.max(range.e.c, bounds.columns - 1) + 1;
      legacyWorksheet["!ref"] = legacyModuleRef.current.utils.encode_range(range);
    } else {
      return;
    }
    setDirty(true);
    setRevision((current) => current + 1);
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
  const selectedFormattedCell = formattedWorksheet?.getCell(selectedCell);
  const selectedValue = mode === "formatted"
    ? readFormattedFormulaValue(selectedFormattedCell)
    : readLegacyCellValue(legacyWorksheet?.[selectedCell] as LegacyCell | undefined);

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
              <div className="test-plan-sheet-tabs" role="tablist" aria-label="工作表">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={sheetName === name}
                    className={sheetName === name ? "is-active" : undefined}
                    onClick={() => {
                      setSheetName(name);
                      setSelectedCell("A1");
                      setRowPage(0);
                      setColumnPage(0);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="test-plan-sheet-tools">
                <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => extendSheet("row")}>
                  <Rows3 className="mr-2 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />新增列
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => extendSheet("column")}>
                  <Columns3 className="mr-2 h-4 w-4" /><Plus className="mr-1 h-3 w-3" />新增欄
                </Button>
              </div>
            </div>

            <div className="test-plan-sheet-formula">
              <strong>{selectedCell}</strong>
              <Input
                value={selectedValue}
                readOnly={!canEdit}
                aria-label={`${selectedCell} 內容或公式`}
                onChange={(event) => updateCell(selectedCell, event.target.value)}
              />
            </div>

            {error && <div className="test-plan-sheet-error" role="alert">{error}</div>}

            <div className="test-plan-sheet-grid-wrap">
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
                    <th className="test-plan-sheet-corner" />
                    {columns.map((column) => (
                      <th key={column}>{encodeColumn(column)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row}
                      style={formattedWorksheet ? { height: getRowHeight(formattedWorksheet, row) } : undefined}
                    >
                      <th>{row}</th>
                      {columns.map((column) => {
                        const address = encodeAddress(row, column);
                        const merge = formattedWorksheet ? findMerge(merges, row, column) : undefined;
                        const renderRow = merge ? Math.max(merge.start.row, firstRow) : row;
                        const renderColumn = merge ? Math.max(merge.start.column, firstColumn) : column;
                        if (merge && (row !== renderRow || column !== renderColumn)) return null;
                        const masterAddress = merge?.masterAddress ?? address;
                        const formattedCell = formattedWorksheet?.getCell(masterAddress);
                        const cellStyle = formattedCell ? getFormattedCellStyle(formattedCell) : undefined;
                        const displayValue = formattedCell
                          ? readFormattedCellValue(formattedCell)
                          : readLegacyCellValue(legacyWorksheet?.[address] as LegacyCell | undefined);
                        return (
                          <td
                            key={address}
                            className={selectedCell === masterAddress ? "is-selected" : undefined}
                            rowSpan={merge ? Math.min(merge.end.row, lastRow) - renderRow + 1 : undefined}
                            colSpan={merge ? Math.min(merge.end.column, lastColumn) - renderColumn + 1 : undefined}
                            style={cellStyle}
                          >
                            <textarea
                              value={displayValue}
                              readOnly={!canEdit}
                              aria-label={masterAddress}
                              style={cellStyle}
                              onFocus={() => setSelectedCell(masterAddress)}
                              onChange={(event) => updateCell(masterAddress, event.target.value)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="test-plan-sheet-pagination">
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
