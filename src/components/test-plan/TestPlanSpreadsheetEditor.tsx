import {
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

type SpreadsheetModule = typeof import("xlsx");
type SpreadsheetWorkbook = import("xlsx").WorkBook;
type SpreadsheetWorksheet = import("xlsx").WorkSheet;
type SpreadsheetCell = import("xlsx").CellObject;

const ROW_PAGE_SIZE = 100;
const COLUMN_PAGE_SIZE = 26;
const MIN_VISIBLE_ROWS = 30;
const MIN_VISIBLE_COLUMNS = 12;

function readCellValue(cell: SpreadsheetCell | undefined): string {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  if (cell.v instanceof Date) return cell.v.toISOString();
  return cell.v === undefined || cell.v === null ? "" : String(cell.v);
}

function inferCellValue(
  value: string,
  previous: SpreadsheetCell | undefined,
): SpreadsheetCell {
  const next: SpreadsheetCell = { ...(previous ?? {}), t: "s", v: value };
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
  const workbookRef = useRef<SpreadsheetWorkbook | null>(null);
  const moduleRef = useRef<SpreadsheetModule | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [selectedCell, setSelectedCell] = useState("A1");
  const [rowPage, setRowPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const [, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !file) return undefined;
    let active = true;
    workbookRef.current = null;
    moduleRef.current = null;
    setStatus("loading");
    setError("");
    setDirty(false);
    setRevision(0);
    setRowPage(0);
    setColumnPage(0);

    void Promise.all([import("xlsx"), downloadFile(file)])
      .then(async ([spreadsheet, blob]) => {
        const workbook = spreadsheet.read(await blob.arrayBuffer(), {
          type: "array",
          cellDates: true,
          cellStyles: true,
          bookVBA: true,
        });
        if (!active) return;
        if (workbook.SheetNames.length === 0) {
          throw new Error("這份 Excel 沒有可編輯的工作表。");
        }
        moduleRef.current = spreadsheet;
        workbookRef.current = workbook;
        setSheetName(workbook.SheetNames[0]);
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

  const worksheet = workbookRef.current?.Sheets[sheetName] ?? null;
  const bounds = (() => {
    const spreadsheet = moduleRef.current;
    if (!spreadsheet || !worksheet) {
      return { rows: MIN_VISIBLE_ROWS, columns: MIN_VISIBLE_COLUMNS };
    }
    const range = spreadsheet.utils.decode_range(worksheet["!ref"] ?? "A1");
    return {
      rows: Math.max(range.e.r + 1, MIN_VISIBLE_ROWS),
      columns: Math.max(range.e.c + 1, MIN_VISIBLE_COLUMNS),
    };
  })();
  const rowPageCount = Math.max(1, Math.ceil(bounds.rows / ROW_PAGE_SIZE));
  const columnPageCount = Math.max(1, Math.ceil(bounds.columns / COLUMN_PAGE_SIZE));
  const firstRow = rowPage * ROW_PAGE_SIZE;
  const lastRow = Math.min(bounds.rows, firstRow + ROW_PAGE_SIZE);
  const firstColumn = columnPage * COLUMN_PAGE_SIZE;
  const lastColumn = Math.min(bounds.columns, firstColumn + COLUMN_PAGE_SIZE);
  const rows = Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, index) => firstRow + index);
  const columns = Array.from(
    { length: Math.max(0, lastColumn - firstColumn) },
    (_, index) => firstColumn + index,
  );

  const updateCell = (address: string, value: string) => {
    const spreadsheet = moduleRef.current;
    const currentSheet = workbookRef.current?.Sheets[sheetName];
    if (!spreadsheet || !currentSheet || !canEdit) return;
    currentSheet[address] = inferCellValue(value, currentSheet[address] as SpreadsheetCell | undefined);
    const cell = spreadsheet.utils.decode_cell(address);
    const range = spreadsheet.utils.decode_range(currentSheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
    currentSheet["!ref"] = spreadsheet.utils.encode_range(range);
    setSelectedCell(address);
    setDirty(true);
    setRevision((current) => current + 1);
  };

  const extendSheet = (axis: "row" | "column") => {
    const spreadsheet = moduleRef.current;
    const currentSheet = workbookRef.current?.Sheets[sheetName];
    if (!spreadsheet || !currentSheet || !canEdit) return;
    const range = spreadsheet.utils.decode_range(currentSheet["!ref"] ?? "A1");
    if (axis === "row") range.e.r = Math.max(range.e.r, bounds.rows - 1) + 1;
    else range.e.c = Math.max(range.e.c, bounds.columns - 1) + 1;
    currentSheet["!ref"] = spreadsheet.utils.encode_range(range);
    setDirty(true);
    setRevision((current) => current + 1);
  };

  const requestClose = () => {
    if (dirty && !window.confirm("這份 Excel 還沒有儲存，確定要關閉嗎？")) return;
    onOpenChange(false);
  };

  const saveWorkbook = async () => {
    const spreadsheet = moduleRef.current;
    const workbook = workbookRef.current;
    if (!spreadsheet || !workbook || !file || !canEdit) return;
    setStatus("saving");
    setError("");
    try {
      const outputFormat = getOutputFormat(file.extension);
      const output = spreadsheet.write(workbook, {
        type: "array",
        bookType: outputFormat.bookType,
        bookVBA: true,
        cellStyles: true,
        compression: true,
      }) as ArrayBuffer;
      await onSave(file, new Blob([output], { type: outputFormat.mimeType }));
      setDirty(false);
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "儲存 Excel 失敗，原檔未被替換。");
    }
  };

  const sheetNames = workbookRef.current?.SheetNames ?? [];
  const selectedValue = readCellValue(worksheet?.[selectedCell] as SpreadsheetCell | undefined);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
      <DialogContent className="test-plan-sheet-dialog" aria-describedby="test-plan-sheet-description">
        <DialogHeader className="test-plan-sheet-heading">
          <span className="test-plan-sheet-heading-icon"><FileSpreadsheet className="h-5 w-5" /></span>
          <div>
            <DialogTitle>{file?.originalName ?? "Excel 線上編輯"}</DialogTitle>
            <DialogDescription id="test-plan-sheet-description">
              直接修改儲存格並儲存回原檔，不需要先下載再重新上傳。
            </DialogDescription>
          </div>
          <div className="test-plan-sheet-heading-actions">
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
            <strong>正在開啟試算表</strong>
            <span>大型檔案可能需要幾秒鐘，畫面不會重新整理。</span>
          </div>
        ) : status === "error" && !workbookRef.current ? (
          <div className="test-plan-sheet-state is-error">
            <FileSpreadsheet className="h-7 w-7" />
            <strong>無法開啟這份 Excel</strong>
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
                disabled={!canEdit}
                aria-label={`${selectedCell} 儲存格內容`}
                onChange={(event) => updateCell(selectedCell, event.target.value)}
              />
            </div>

            {error && (
              <div className="test-plan-sheet-error" role="alert">{error}</div>
            )}

            <div className="test-plan-sheet-grid-wrap">
              <table className="test-plan-sheet-grid">
                <thead>
                  <tr>
                    <th className="test-plan-sheet-corner" />
                    {columns.map((columnIndex) => (
                      <th key={columnIndex}>{moduleRef.current?.utils.encode_col(columnIndex)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((rowIndex) => (
                    <tr key={rowIndex}>
                      <th>{rowIndex + 1}</th>
                      {columns.map((columnIndex) => {
                        const address = moduleRef.current?.utils.encode_cell({ r: rowIndex, c: columnIndex }) ?? "A1";
                        return (
                          <td key={columnIndex} className={selectedCell === address ? "is-selected" : undefined}>
                            <input
                              value={readCellValue(worksheet?.[address] as SpreadsheetCell | undefined)}
                              disabled={!canEdit}
                              aria-label={address}
                              onFocus={() => setSelectedCell(address)}
                              onChange={(event) => updateCell(address, event.target.value)}
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
              <div>
                <Button type="button" size="sm" variant="outline" disabled={columnPage === 0} onClick={() => setColumnPage((current) => current - 1)}>
                  <ChevronLeft className="h-4 w-4" />前一組欄
                </Button>
                <span>欄 {firstColumn + 1}-{lastColumn} / {bounds.columns}</span>
                <Button type="button" size="sm" variant="outline" disabled={columnPage + 1 >= columnPageCount} onClick={() => setColumnPage((current) => current + 1)}>
                  後一組欄<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Button type="button" size="sm" variant="outline" disabled={rowPage === 0} onClick={() => setRowPage((current) => current - 1)}>
                  <ChevronLeft className="h-4 w-4" />上一頁
                </Button>
                <span>列 {firstRow + 1}-{lastRow} / {bounds.rows}</span>
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
