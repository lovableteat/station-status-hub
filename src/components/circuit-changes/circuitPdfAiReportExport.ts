/**
 * Writes the comparison report as an Excel file: 摘要, 各頁結果, 差異清單 and, for the pages with differences, both
 * drawings with the differences boxed. Everything is built in the browser from the saved results and the open PDFs.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CircuitCropRect } from "./circuitPdf";
import type { CircuitPdfAiReviewReport } from "./circuitPdfAiReview";
import { buildCircuitAiReportData, type CircuitAiReportPage } from "./circuitPdfAiReport";

/** Drawings are added for at most this many pages; the rest are listed and can be opened on the site. */
export const CIRCUIT_AI_REPORT_IMAGE_PAGES = 40;
const IMAGE_EDGE = 1500;

async function markedDrawing(pdf: PDFDocumentProxy, pageNumber: number, report: CircuitPdfAiReviewReport, side: "officialBox" | "workingBox"): Promise<{ base64: string; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber), base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: IMAGE_EDGE / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvas, viewport }).promise;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立報告圖面。");
    context.font = "700 15px system-ui, sans-serif"; context.textBaseline = "bottom";
    for (const finding of report.findings) {
      const box = finding[side] as CircuitCropRect | null | undefined;
      if (!box || finding.decision === "dismissed") continue;
      const unclear = finding.certainty === "unclear", colour = unclear ? "#925200" : "#bc202a";
      const x = box.x * canvas.width, y = box.y * canvas.height, width = Math.max(6, box.width * canvas.width), height = Math.max(6, box.height * canvas.height);
      context.lineWidth = 3; context.strokeStyle = colour; context.setLineDash(unclear ? [8, 5] : []);
      context.strokeRect(x, y, width, height);
      context.setLineDash([]);
      const tag = finding.id, tagWidth = context.measureText(tag).width + 10, tagY = y >= 20 ? y : y + height + 20;
      context.fillStyle = colour; context.fillRect(x - 1.5, tagY - 20, tagWidth, 20);
      context.fillStyle = "#ffffff"; context.fillText(tag, x + 3.5, tagY - 2);
    }
    // JPEG keeps a report with dozens of sheets small enough to mail; the site keeps the sharp drawings.
    return { base64: canvas.toDataURL("image/jpeg", 0.84).split(",")[1], width: canvas.width, height: canvas.height };
  } finally { canvas.width = canvas.height = 0; }
}

export async function exportCircuitPdfAiReport({ official, working, pages, userName, note, onProgress, signal }: {
  official: { name: string; pdf: PDFDocumentProxy }; working: { name: string; pdf: PDFDocumentProxy };
  pages: readonly CircuitAiReportPage[]; userName: string; note?: string;
  onProgress?: (done: number, total: number) => void; signal?: AbortSignal;
}): Promise<{ fileName: string; markedPages: number; drawnPages: number }> {
  if (!pages.some(page => page.report)) throw new Error("還沒有任何比對結果可以放進報告。請先比對，再下載報告。");
  const data = buildCircuitAiReportData({ officialName: official.name, workingName: working.name, pages, generatedBy: userName, generatedAt: new Date().toISOString(), note });
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook(); workbook.creator = "工作平台"; workbook.created = new Date();
  const header = { fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF214B40" } }, font: { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } } };

  const summary = workbook.addWorksheet("摘要");
  summary.columns = [{ width: 26 }, { width: 110 }];
  summary.addRow([data.title]); summary.mergeCells("A1:B1");
  for (const row of data.summary) summary.addRow(row);

  const differences = workbook.addWorksheet("差異清單", { views: [{ state: "frozen", ySplit: 1 }] });
  differences.addRow(data.findingHeader); differences.addRows(data.findingRows);
  differences.columns.forEach((column, index) => { column.width = [10, 10, 8, 16, 12, 12, 44, 26, 40, 40, 44, 16, 12, 40, 18, 22][index]; });
  differences.autoFilter = { from: "A1", to: { row: Math.max(1, differences.rowCount), column: data.findingHeader.length } };

  const sheets = workbook.addWorksheet("各頁結果", { views: [{ state: "frozen", ySplit: 1 }] });
  sheets.addRow(data.pageHeader); sheets.addRows(data.pageRows);
  sheets.columns.forEach((column, index) => { column.width = [10, 10, 26, 16, 70, 44, 44, 44, 9, 28, 22, 18, 44][index]; });
  sheets.autoFilter = { from: "A1", to: { row: Math.max(1, sheets.rowCount), column: data.pageHeader.length } };

  for (const sheet of workbook.worksheets) sheet.eachRow(row => row.eachCell(cell => { cell.font = { name: "Calibri", size: 11 }; cell.alignment = { vertical: "top", wrapText: true }; }));
  summary.getCell("A1").font = { name: "Calibri", size: 14, bold: true };
  summary.eachRow((row, number) => { if (number > 1) row.getCell(1).font = { name: "Calibri", size: 11, bold: true }; });
  for (const sheet of [differences, sheets]) sheet.getRow(1).eachCell(cell => { cell.fill = header.fill; cell.font = header.font; });

  const drawn = data.markedPages.slice(0, CIRCUIT_AI_REPORT_IMAGE_PAGES), byPage = new Map(pages.map(page => [page.workingPage, page]));
  if (drawn.length) {
    const drawings = workbook.addWorksheet("圖面標註");
    drawings.columns = [{ width: 108 }, { width: 108 }];
    drawings.addRow(["紅色實線框是疑似問題，黃色虛線框是證據不足；編號對應「差異清單」。左邊是基準版，右邊是比對版。原圖可以在網站的 AI 比對放大查看。"]); drawings.mergeCells("A1:B1");
    if (data.markedPages.length > drawn.length) { drawings.addRow([`有標註的頁共 ${data.markedPages.length} 頁，這裡放前 ${drawn.length} 頁；其餘第 ${data.markedPages.slice(drawn.length).join("、")} 頁請看「差異清單」或到網站查看。`]); drawings.mergeCells(`A${drawings.rowCount}:B${drawings.rowCount}`); }
    let done = 0;
    onProgress?.(0, drawn.length);
    for (const number of drawn) {
      signal?.throwIfAborted();
      const page = byPage.get(number)!, report = page.report!;
      const heading = drawings.addRow([`基準版第 ${report.officialPage} 頁`, `比對版第 ${report.workingPage} 頁 · ${report.findings.length} 處`]);
      heading.eachCell(cell => { cell.fill = header.fill; cell.font = header.font; });
      const [before, after] = await Promise.all([markedDrawing(official.pdf, report.officialPage, report, "officialBox"), markedDrawing(working.pdf, report.workingPage, report, "workingBox")]);
      const displayWidth = 750, displayHeight = Math.round(Math.max(before.height * displayWidth / before.width, after.height * displayWidth / after.width));
      const top = heading.number, rows = Math.max(3, Math.ceil(displayHeight / 20));
      for (let index = 0; index < rows; index++) drawings.addRow([]).height = 15;
      for (const [index, image] of [before, after].entries()) drawings.addImage(workbook.addImage({ base64: image.base64, extension: "jpeg" }), { tl: { col: index, row: top }, ext: { width: displayWidth, height: Math.round(image.height * displayWidth / image.width) }, editAs: "oneCell" });
      drawings.addRow([]);
      onProgress?.(++done, drawn.length);
      // Let the window repaint between sheets.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    drawings.getRow(1).eachCell(cell => { cell.alignment = { vertical: "top", wrapText: true }; });
  }

  signal?.throwIfAborted();
  const buffer = await workbook.xlsx.writeBuffer(), blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).replace(/-/g, "");
  const fileName = `${working.name.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "線路圖"}-新舊版比對報告-${stamp}.xlsx`;
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName, markedPages: data.markedPages.length, drawnPages: drawn.length };
}
