import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import { getLatestTrackingEntry } from "./materialRequestUtils";
import { getMaterialSpecDocuments } from "./materialAttachments";
import { getMaterialTrackingStatusMeaning } from "./materialTrackingStatus";
import { downloadBlob } from "./materialRequestExport";

export const PENDING_MATERIAL_EXPORT_HEADERS = ["分類", "Ref Des", "Name", "Qty", "Manufacturer Part Number", "Manufacturer", "虛擬料號", "實體料號", "目前狀態", "申請類型說明", "填單人", "最後更新人", "更新時間", "單號", "連結", "申請狀態資訊", "追蹤說明", "SPEC 文件"];

export async function createPendingMaterialsWorkbook({ rows, workspaceName, exportedBy, scope, exportedAt = new Date() }: {
  rows: Array<{ category: string; displayRef: string; record: MaterialWorkbookRecord }>;
  workspaceName: string;
  exportedBy: string;
  scope: string;
  exportedAt?: Date;
}) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = exportedBy;
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet("待處理料");
  sheet.columns = [14, 30, 52, 10, 32, 26, 26, 26, 20, 30, 20, 20, 24, 24, 44, 44, 52, 44].map(width => ({ width }));
  sheet.addRow([`${workspaceName} · 待處理料`]);
  sheet.addRow([`匯出：${exportedBy} · ${exportedAt.toLocaleString("zh-TW", { hour12: false })} · ${rows.length} 筆`]);
  sheet.addRow([`範圍：${scope}`]);
  for (let row = 1; row <= 3; row++) sheet.mergeCells(row, 1, row, PENDING_MATERIAL_EXPORT_HEADERS.length);
  sheet.getRow(1).font = { bold: true, size: 16 };
  const header = sheet.addRow(PENDING_MATERIAL_EXPORT_HEADERS);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245B57" } };
  header.height = 32;
  for (const { category, displayRef, record } of rows) {
    const latest = getLatestTrackingEntry(record);
    const status = latest?.status || record.trackingStatus || "未處理";
    const row = sheet.addRow([category, record.refDes || displayRef, record.name, record.qty, record.manufacturerPartNumber, record.manufacturer, record.virtualAlternative || "", record.partNumber, status, getMaterialTrackingStatusMeaning(status), record.requestOwnerName || "未指定", latest?.createdBy || "", latest?.createdAt || "", record.requestTicket || "", record.requestUrl || "", latest?.requestInfo || "", latest?.note || record.trackingNote || "", getMaterialSpecDocuments(record).map(document => document.name).join("\n")]);
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell(cell => { if (typeof cell.value === "string") cell.numFmt = "@"; });
  }
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: PENDING_MATERIAL_EXPORT_HEADERS.length } };
  return workbook;
}

export async function exportPendingMaterialsExcel(options: Parameters<typeof createPendingMaterialsWorkbook>[0]) {
  const workbook = await createPendingMaterialsWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const name = `${options.workspaceName.replace(/[\\/:*?"<>|]/g, "-")}_待處理料_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
  return name;
}
