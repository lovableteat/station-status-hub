import type { SpecFillResult, SpecFillSource } from "./materialSpecFill";

export async function createSpecFillWorkbook(result: SpecFillResult, sources: SpecFillSource[], mpn: string, model: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const table = workbook.addWorksheet("依照片填表");
  table.addRow(result.columns);
  result.rows.forEach(row => table.addRow(row.map(cell => cell.value)));
  table.columns.forEach(column => { column.width = 30; column.numFmt = "@"; });
  table.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  table.getRow(1).font = { bold: true };
  table.views = [{ state: "frozen", ySplit: 1 }];
  const evidence = workbook.addWorksheet("來源查核");
  evidence.addRow(["廠商料號", mpn]);
  evidence.addRow(["AI 模型", model]);
  evidence.addRow(["說明", "AI 整理結果，請依來源原文核對；待確認資料不可直接當作已驗證規格。"]);
  result.warnings.forEach(warning => evidence.addRow(["待確認", warning]));
  evidence.addRow(["結果列", "欄位", "數據", "SPEC", "頁碼", "原文／待確認原因"]);
  result.rows.forEach((row, index) => row.forEach((cell, column) => {
    if (cell.kind !== "label") evidence.addRow([index + 1, result.columns[column], cell.value, sources.find(source => source.id === cell.sourceId)?.name ?? "", cell.page ?? "", cell.quote ?? ""]);
  }));
  evidence.columns = [{ width: 18 }, { width: 35 }, { width: 35 }, { width: 45 }, { width: 16 }, { width: 90 }];
  evidence.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  return workbook;
}
