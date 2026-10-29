/**
 * Excel export of a BOM version comparison, written for the factory: a summary,
 * one row per field change, and the full CE columns of every added and removed line.
 */
import { MATERIAL_CE_FIELDS } from "./materialUploadContract.mjs";
import { bomChangeImpactLabel, bomChangeKindLabel, bomDiffFieldValue } from "./bomDiff.ts";
import type { BomDiffEntry, BomDiffResult, BomVendorLineChange } from "./bomDiff.ts";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";

export interface BomDiffExportVersion {
  title: string;
  sourceFile: string;
  uploadedAt: string;
  recordCount: number;
}

export interface BomDiffExportContext {
  seriesName: string;
  before: BomDiffExportVersion;
  after: BomDiffExportVersion;
  exportedBy: string;
  exportedAt: string;
  /** Entries that are currently shown (after filters); the summary still reports the whole comparison. */
  visibleEntries?: BomDiffEntry[];
}

const CE_RECORD_KEYS: Array<keyof MaterialWorkbookRecord> = [
  "level", "name", "qty", "refDes", "manufacturerPartNumber", "manufacturer", "sourcingStatus", "virtualAlternative",
  "partNumber", "partName", "partSpec", "schematicPart", "pcbFootprint", "phaseOutStatus", "partUsageStatus",
];
export const BOM_DIFF_CE_HEADERS = MATERIAL_CE_FIELDS.map((field) => field.header);
export const BOM_DIFF_DETAIL_HEADERS = ["位號", "料名", "變更類型", "影響", "欄位", "舊值", "新值", "廠商", "MPN", "實體料號"];

const text = (value: unknown) => String(value ?? "").trim();

function ceValues(record: MaterialWorkbookRecord) {
  return CE_RECORD_KEYS.map((key) => (key === "level" ? 2 : text(record[key])));
}

function lineVendor(line: BomVendorLineChange) {
  const record = line.after ?? line.before;
  return [text(record?.manufacturer), text(record?.manufacturerPartNumber), text(record?.partNumber)];
}

export interface BomDiffWorkbookRows {
  summary: Array<[string, string]>;
  details: Array<Array<string | number>>;
  added: Array<Array<string | number>>;
  removed: Array<Array<string | number>>;
}

/** Pure row builder shared by the Excel writer and its tests. */
export function buildBomDiffWorkbookRows(result: BomDiffResult, context: BomDiffExportContext): BomDiffWorkbookRows {
  const { summary } = result;
  const entries = context.visibleEntries ?? result.entries;
  const kindLine = (["added", "removed", "refDes", "qty", "primary", "vendors", "status", "spec"] as const)
    .map((kind) => `${bomChangeKindLabel(kind)} ${summary.kinds[kind]}`).join("、");
  const summaryRows: Array<[string, string]> = [
    ["BOM 系列", context.seriesName],
    ["舊版本", `${context.before.title} · ${context.before.sourceFile} · ${context.before.recordCount.toLocaleString()} 筆 · ${context.before.uploadedAt}`],
    ["新版本", `${context.after.title} · ${context.after.sourceFile} · ${context.after.recordCount.toLocaleString()} 筆 · ${context.after.uploadedAt}`],
    ["料件群組", `舊 ${summary.beforeGroups.toLocaleString()} · 新 ${summary.afterGroups.toLocaleString()}`],
    ["新增／移除／變更／未變更", `${summary.added} / ${summary.removed} / ${summary.changed} / ${summary.unchanged}`],
    ["變更類型統計", kindLine],
    ["追蹤未帶入", `${summary.trackingLost} 筆`],
    ["本檔列出的群組", context.visibleEntries ? `${entries.length}（依目前篩選）` : `${entries.length}（全部）`],
    ["匯出", `${context.exportedBy || "未填"} · ${context.exportedAt}`],
    ["判讀說明", "影響生產：位號、數量、主料、替代料、新增、移除；狀態變更：Sourcing Status、phase out、零件狀態；文字變更：料名、規格、符號、封裝、虛擬料號、分組。"],
  ];

  const details: Array<Array<string | number>> = [];
  const added: Array<Array<string | number>> = [];
  const removed: Array<Array<string | number>> = [];
  for (const entry of entries) {
    if (entry.kinds.length === 0) continue;
    const kinds = entry.kinds.map(bomChangeKindLabel).join("、");
    const impact = bomChangeImpactLabel(entry.impact);
    if (entry.kinds.includes("added")) {
      for (const row of entry.after?.rows ?? []) {
        details.push([entry.displayRef, entry.name, kinds, impact, "整列", "", text(row.manufacturerPartNumber), text(row.manufacturer), text(row.manufacturerPartNumber), text(row.partNumber)]);
        added.push(ceValues(row));
      }
      continue;
    }
    if (entry.kinds.includes("removed")) {
      for (const row of entry.before?.rows ?? []) {
        details.push([entry.displayRef, entry.name, kinds, impact, "整列", text(row.manufacturerPartNumber), "", text(row.manufacturer), text(row.manufacturerPartNumber), text(row.partNumber)]);
        removed.push(ceValues(row));
      }
      continue;
    }
    for (const change of entry.changes) {
      const line = entry.lines.find((candidate) => candidate.changes.includes(change));
      const [manufacturer, mpn, partNumber] = line ? lineVendor(line) : ["", "", ""];
      details.push([entry.displayRef, entry.name, kinds, impact, change.label, change.before, change.after, manufacturer, mpn, partNumber]);
    }
    for (const line of entry.lines) {
      if (line.kind === "added" && line.after) {
        details.push([entry.displayRef, entry.name, kinds, impact, "廠商明細新增", "", bomDiffFieldValue(line.after, "manufacturerPartNumber"), ...lineVendor(line)]);
        added.push(ceValues(line.after));
      } else if (line.kind === "removed" && line.before) {
        details.push([entry.displayRef, entry.name, kinds, impact, "廠商明細移除", bomDiffFieldValue(line.before, "manufacturerPartNumber"), "", ...lineVendor(line)]);
        removed.push(ceValues(line.before));
      }
    }
  }
  return { summary: summaryRows, details, added, removed };
}

export function buildBomDiffFileName(context: BomDiffExportContext) {
  const safe = (value: string) => value.normalize("NFKC").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "BOM";
  const stamp = context.exportedAt.replace(/[^0-9]/g, "").slice(0, 12) || String(Date.now());
  return `BOM差異_${safe(context.seriesName)}_${safe(context.before.title)}_vs_${safe(context.after.title)}_${stamp}.xlsx`;
}

export async function createBomDiffWorkbook(result: BomDiffResult, context: BomDiffExportContext) {
  // Vite exposes the named exports; Node wraps the CommonJS module in `default`.
  const excelModule = await import("exceljs");
  const ExcelJS: typeof excelModule = (excelModule as unknown as { default?: typeof excelModule }).default ?? excelModule;
  const rows = buildBomDiffWorkbookRows(result, context);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = context.exportedBy || "station-status-hub";
  workbook.created = new Date();
  workbook.title = `${context.seriesName} ${context.before.title} vs ${context.after.title}`;

  const summary = workbook.addWorksheet("摘要");
  summary.columns = [{ width: 24 }, { width: 110 }];
  for (const [label, value] of rows.summary) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  const detail = workbook.addWorksheet("差異明細", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [20, 36, 16, 12, 22, 30, 30, 22, 26, 20].map((width) => ({ width }));
  const header = detail.addRow(BOM_DIFF_DETAIL_HEADERS);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F2F1" } };
  for (const values of rows.details) {
    const row = detail.addRow(values);
    row.alignment = { wrapText: true, vertical: "top" };
    const impact = String(values[3]);
    if (impact === "影響生產") row.getCell(4).font = { bold: true, color: { argb: "FFB42318" } };
  }
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.details.length + 1), column: BOM_DIFF_DETAIL_HEADERS.length } };

  for (const [name, lines] of [["新增料件", rows.added], ["移除料件", rows.removed]] as const) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = MATERIAL_CE_FIELDS.map((field) => ({ width: field.width }));
    const head = sheet.addRow(BOM_DIFF_CE_HEADERS);
    head.font = { bold: true };
    for (const values of lines) sheet.addRow(values).alignment = { wrapText: true, vertical: "top" };
  }
  return workbook;
}

export async function exportBomDiffExcel(result: BomDiffResult, context: BomDiffExportContext) {
  const workbook = await createBomDiffWorkbook(result, context);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = buildBomDiffFileName(context);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return fileName;
}
