import { aggregateBom, exportBomCsv, exportProjectJson } from "./exports.ts";
import { rowsFromCsv, type TabularRow } from "./tabular.ts";
import type { PcbProject } from "../types.ts";

export const PROJECT_FILE_ACCEPT = ".json,application/json";
export const LIBRARY_FILE_ACCEPT =
  ".json,.csv,.xlsx,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const BOM_FILE_ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

export type ImportFileKind = "json" | "csv" | "xlsx";

export function classifyImportFile(filename: string): ImportFileKind | null {
  const extension = filename.split(".").pop()?.toLocaleLowerCase();
  return extension === "json" || extension === "csv" || extension === "xlsx"
    ? extension
    : null;
}

export function safeFilenameBase(name: string): string {
  const printable = Array.from(name.normalize("NFKC"))
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
    .join("");
  const normalized = printable
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/^[.\-\s]+/, "")
    .replace(/[\s.-]+$/g, "")
    .replace(/[-\s]+/g, "-");
  return normalized || "pcb-project";
}

export function projectExportFilename(name: string): string {
  return `${safeFilenameBase(name)}.pcb-project.json`;
}

export function bomExportFilename(name: string, format: "csv" | "xlsx"): string {
  return `${safeFilenameBase(name)}.bom.${format}`;
}

async function workbookRows(data: ArrayBuffer): Promise<TabularRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<TabularRow>(workbook.Sheets[sheetName], {
    defval: "",
  });
}

export async function readTabularFile(file: File): Promise<TabularRow[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error("檔案大小超過 50 MB 上限。");
  }
  const kind = classifyImportFile(file.name);
  if (!kind) throw new Error("不支援的匯入檔案格式。");
  if (kind === "csv") return rowsFromCsv(await file.text());
  if (kind === "xlsx") return workbookRows(await file.arrayBuffer());
  const parsed = JSON.parse(await file.text()) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? (parsed as { components?: unknown }).components
      : null;
  if (!Array.isArray(rows)) throw new Error("JSON 檔案必須提供 components 陣列。");
  return rows as TabularRow[];
}

export function downloadBlob(
  contents: BlobPart,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProject(project: PcbProject): void {
  downloadBlob(
    exportProjectJson(project),
    projectExportFilename(project.name),
    "application/json;charset=utf-8",
  );
}

export function downloadBomCsv(project: PcbProject): void {
  downloadBlob(
    exportBomCsv(project.components),
    bomExportFilename(project.name, "csv"),
    "text/csv;charset=utf-8",
  );
}

export async function downloadBomXlsx(project: PcbProject): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = aggregateBom(project.components).map((row) => ({
    Reference: row.reference,
    Name: row.name,
    Type: row.type,
    Manufacturer: row.manufacturer,
    "Part Number": row.partNumber,
    Quantity: row.quantity,
    Width: row.width,
    Height: row.height,
    "Max Height": row.maxHeight,
    Layer: row.layer,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "BOM",
  );
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    output,
    bomExportFilename(project.name, "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
