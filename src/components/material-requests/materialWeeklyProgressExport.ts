import type { MaterialProgressRow, MaterialProgressWeek } from "./materialWeeklyProgress";
import { summarizeMaterialWeeklyProgress, taipeiProgressDate } from "./materialWeeklyProgress";
import { downloadBlob } from "./materialRequestExport";

export interface MaterialWeeklyExportOptions {
  rows: MaterialProgressRow[];
  weeks: MaterialProgressWeek[];
  workspaceName: string;
  exportedBy: string;
  asOf: number;
  scope: string;
}

export async function createMaterialWeeklyWorkbook(options: MaterialWeeklyExportOptions) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const { rows, weeks, workspaceName, exportedBy, asOf, scope } = options;
  workbook.creator = exportedBy;
  workbook.created = new Date(asOf);
  const prepare = (name: string, headers: string[], widths: number[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = widths.map(width => ({ width }));
    sheet.addRow([`${workspaceName} · ${name}`]);
    sheet.addRow([`範圍：${scope} · ${rows.length} 筆廠商明細 · 匯出：${exportedBy} · 統計截至 ${new Date(asOf).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}（台北時間）`]);
    sheet.addRow(["每週狀態依當週最後一筆有效追蹤紀錄；無日期資料不回填舊週。負責人、料號及 Note 為目前資料。"]);
    for (let i = 1; i <= 3; i++) sheet.mergeCells(i, 1, i, headers.length);
    sheet.getRow(1).font = { bold: true, size: 16 };
    const header = sheet.addRow(headers);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245B57" } };
    header.height = 32;
    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
    return sheet;
  };
  const matrix = prepare("各料每週進度", ["Ref Des", "Name", "Qty", "Manufacturer Part Number", "Manufacturer", "虛擬料號", "實體料號", "負責人（目前）", "目前狀態", "無日期紀錄數", ...[...weeks].reverse().map(week => `${week.label}${week.isCurrent ? "（本週）" : ""}`), "Note"], [30, 48, 10, 34, 26, 28, 28, 24, 28, 18, ...weeks.map(() => 30), 50]);
  for (const row of rows) matrix.addRow([row.record.refDes, row.record.name, row.record.qty, row.record.manufacturerPartNumber, row.record.manufacturer, row.record.virtualAlternative || "", row.record.partNumber || "", row.record.requestOwnerName || "未指定", row.currentStatus, row.undatedCount, ...[...row.cells].reverse().map(cell => cell.status), row.record.note || ""]);
  const summaries = summarizeMaterialWeeklyProgress(rows, weeks);
  const statuses = summaries[0] ? Object.keys(summaries[0].counts) : [];
  const summary = prepare("每週彙總", ["週別（週一至週日）", "首次更新料件數", "本週有更新料件數", ...statuses, "總筆數"], [30, 22, 22, ...statuses.map(() => 23), 14]);
  for (const item of [...summaries].reverse()) summary.addRow([item.week.label, item.startedCount, item.updatedCount, ...statuses.map(status => item.counts[status]), rows.length]);
  const history = prepare("週內更新明細", ["週別", "Ref Des", "Manufacturer Part Number", "Manufacturer", "更新時間（原始時間含時區）", "狀態", "更新人", "申請狀態資訊", "追蹤說明", "單號", "連結"], [30, 30, 34, 26, 34, 28, 26, 50, 60, 26, 50]);
  for (const row of rows) row.cells.forEach((cell, index) => {
    for (const entry of cell.updates) history.addRow([weeks[index].label, row.record.refDes, row.record.manufacturerPartNumber, row.record.manufacturer, entry.createdAt, entry.status, entry.createdBy || "", entry.requestInfo || "", entry.note || "", entry.requestTicket || "", entry.requestUrl || ""]);
  });
  for (const sheet of [matrix, summary, history]) {
    for (let i = 5; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell(cell => { if (typeof cell.value === "string") cell.numFmt = "@"; });
    }
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: sheet.columnCount } };
  }
  return workbook;
}

export async function exportMaterialWeeklyExcel(options: MaterialWeeklyExportOptions) {
  const workbook = await createMaterialWeeklyWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const name = `${options.workspaceName.replace(/[\\/:*?"<>|]/g, "-")}_每週申請進度_${taipeiProgressDate(options.asOf)}.xlsx`;
  downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
  return name;
}
