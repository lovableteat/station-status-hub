import type { SpecFillResult, SpecFillSource, SpecFillTable } from "./materialSpecFill";

export async function createSpecFillWorkbook(result: SpecFillResult, sources: SpecFillSource[], mpn: string, model: string) {
  return createSpecFillPhotosWorkbook([{ ...result, templateId: "template", templateName: result.title }], sources, mpn, model);
}

export async function createSpecFillPhotosWorkbook(tables: SpecFillTable[], sources: SpecFillSource[], mpn: string, model: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  tables.forEach((result, index) => {
    const table = workbook.addWorksheet(tables.length === 1 ? "依照片填表" : `照片${index + 1}`);
    table.addRow(result.columns);
    result.rows.forEach(row => table.addRow(row.map(cell => cell.value)));
    table.columns.forEach(column => { column.width = 30; column.numFmt = "@"; });
    table.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
    table.getRow(1).font = { bold: true };
    table.views = [{ state: "frozen", ySplit: 1 }];
  });
  const evidence = workbook.addWorksheet("來源查核");
  evidence.addRow(["廠商料號", mpn]);
  evidence.addRow(["AI 模型", model]);
  evidence.addRow(["說明", "AI 整理結果，請依來源原文核對；待確認資料不可直接當作已驗證規格。"]);
  tables.forEach((result, index) => result.warnings.forEach(warning => evidence.addRow([tables.length === 1 ? "待確認" : `照片${index + 1} 待確認`, warning])));
  evidence.addRow([...(tables.length > 1 ? ["表格照片"] : []), "結果列", "欄位", "數據", "SPEC", "頁碼", "原文／待確認原因"]);
  tables.forEach((result, tableIndex) => result.rows.forEach((row, index) => row.forEach((cell, column) => {
    if (cell.kind !== "label") evidence.addRow([...(tables.length > 1 ? [`照片${tableIndex + 1}：${result.templateName}`] : []), index + 1, result.columns[column], cell.value, sources.find(source => source.id === cell.sourceId)?.name ?? "", cell.page ?? "", cell.quote ?? ""]);
  })));
  evidence.columns = [...(tables.length > 1 ? [{ width: 40 }] : []), { width: 18 }, { width: 35 }, { width: 35 }, { width: 45 }, { width: 16 }, { width: 90 }];
  evidence.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  return workbook;
}
