import type { PerformanceReview } from "./assessmentTypes";
import {
  ACCOUNTABILITY_QUESTIONS,
  CATEGORIES,
  calculateWeightedManagerScores,
  calculateWeightedSelfScores,
  readManagerAssessment,
  readSelfAssessment,
} from "./rd2Assessment.mjs";
import { PERFORMANCE_STATUS } from "./performanceData.mjs";

type ExcelJsRow = import("exceljs").Row;
type ExcelJsCell = import("exceljs").Cell;
type ExcelValue = string | number;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function dateLabel(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW");
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "performance";
}

function safeSheetName(value: string, used: Set<string>) {
  const base = (value.replace(/[\\/*?:\x5B\]]/g, "_").trim() || "未命名員工").slice(0, 31);
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const ending = `-${suffix++}`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(name);
  return name;
}

function attachmentNames(attachments: Array<{ name?: string; size?: number }> = []) {
  return attachments
    .map((attachment) => `${attachment.name || "未命名附件"}${attachment.size ? ` (${Math.ceil(attachment.size / 1024)} KB)` : ""}`)
    .join("\n");
}

function imageNames(images: Array<{ name?: string }> = []) {
  return images.map((image) => image.name || "未命名圖片").join("\n");
}

const EXCEL_COLUMN_WIDTHS = [12.78, 65.44, 83.44, 14.78, 12.78, 32.78, 36.78, 28.78, 24.78];
const EXCEL_META_HEADERS = ["類別", "資料類型", "內容", "", "", "", "", "", ""];
const EXCEL_DETAIL_HEADERS = ["大類", "實績", "主管評語", "員工自評分數", "主管評分", "主管評語", "證明連結", "自評附件檔名", "自評圖片檔名"];
// Match the two header fills in the supplied 績效考核.xlsx (Johnny!A1:I1 and A15:I15).
const EXCEL_META_HEADER = "FFFFFF00";
const EXCEL_DETAIL_HEADER = "FF1F4E79";
const EXCEL_BORDER = "FFE0E0E0";

function excelFill(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

function estimateRowHeight(values: ExcelValue[]) {
  const lineCounts = values.map((value, index) => {
    const width = EXCEL_COLUMN_WIDTHS[index] || 18;
    return text(value)
      .split(/\r?\n/)
      .reduce((total, line) => total + Math.max(1, Math.ceil([...line].length / Math.max(8, width * 0.5))), 0);
  });
  const lines = Math.max(1, ...lineCounts);
  return Math.min(390, Math.max(24, lines * 17 + 8));
}

function stylePerformanceRow(row: ExcelJsRow, values: ExcelValue[]) {
  row.height = estimateRowHeight(values);
  row.eachCell({ includeEmpty: true }, (cell: ExcelJsCell, column: number) => {
    cell.font = {
      name: "Microsoft JhengHei",
      size: 12,
      color: { argb: "FF111111" },
    };
    cell.alignment = {
      horizontal: [1, 4, 5].includes(column) ? "center" : "left",
      vertical: "top",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: EXCEL_BORDER } },
      bottom: { style: "thin", color: { argb: EXCEL_BORDER } },
      left: { style: "thin", color: { argb: EXCEL_BORDER } },
      right: { style: "thin", color: { argb: EXCEL_BORDER } },
    };
    if (column === 7 && text(values[column - 1]).startsWith("http")) {
      cell.font = { ...cell.font, color: { argb: "FF0563C1" }, underline: true };
    }
  });
}

function styleHeaderRow(row: ExcelJsRow, color: string, textColor: string) {
  const isBasicHeader = color === EXCEL_META_HEADER;
  row.height = isBasicHeader ? 24 : 30;
  row.eachCell({ includeEmpty: true }, (cell: ExcelJsCell) => {
    cell.fill = excelFill(color);
    cell.font = { name: "Microsoft JhengHei", size: isBasicHeader ? 12 : 11, bold: !isBasicHeader, color: { argb: textColor } };
    cell.alignment = { horizontal: isBasicHeader ? "left" : "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: EXCEL_BORDER } },
      bottom: { style: "thin", color: { argb: EXCEL_BORDER } },
      left: { style: "thin", color: { argb: EXCEL_BORDER } },
      right: { style: "thin", color: { argb: EXCEL_BORDER } },
    };
  });
}

function basicInfoRows(review: PerformanceReview): Array<[string, ExcelValue]> {
  const self = readSelfAssessment(review.selfFeedback);
  const manager = readManagerAssessment(review.managerFeedback);
  const weightedSelf = calculateWeightedSelfScores(self.grade, self.sections);
  return [
    ["員工", review.employeeName],
    ["工號", self.employeeNumber || manager.employeeNumber],
    ["部門", review.department],
    ["職務／職級", review.role],
    ["考核人", review.reviewerName],
    ["狀態", PERFORMANCE_STATUS[review.status]?.label || review.status],
    ["截止日期", review.dueDate],
    ["更新時間", dateLabel(review.updatedAt)],
    ["團隊", self.team],
    ["職務角色", self.level],
    ["數字職等", self.grade ? Number(self.grade) : ""],
    ["員工加權自評", weightedSelf?.complete ? weightedSelf.total : ""],
    ["主管加權評分", review.score ?? ""],
  ];
}

function detailRows(review: PerformanceReview): ExcelValue[][] {
  const self = readSelfAssessment(review.selfFeedback);
  const manager = readManagerAssessment(review.managerFeedback);
  const rows: ExcelValue[][] = [];
  for (const category of CATEGORIES) {
    const section = self.sections[category];
    const categoryReview = manager.categoryReviews[category];
    const entries = section.entries?.filter((entry) => entry.text.trim()) || [];
    const contents = entries.length ? entries : section.text.trim() ? [{ id: "", text: section.text, links: section.links, attachments: [] }] : [];
    contents.forEach((entry, index) => {
      if (!entry.text.trim() && index > 0) return;
      const entryReview = manager.entryReviews[category]?.[entry.id];
      rows.push([
        category,
        entry.text,
        entryReview?.returnRequested ? "" : entryReview?.feedback || "",
        index === 0 ? section.selfScore ?? "" : "",
        index === 0 ? categoryReview.score ?? "" : "",
        index === 0 ? categoryReview.feedback : "",
        [...(entry.links || []), ...(index === 0 ? section.links : [])].filter((link, position, all) => all.indexOf(link) === position).join("\n"),
        attachmentNames(entry.attachments || []),
        index === 0 ? imageNames(section.images) : "",
      ]);
    });
    if (!contents.length && (categoryReview.score != null || categoryReview.feedback.trim())) {
      rows.push([category, "類別評分與主管評語", "", "", categoryReview.score ?? "", categoryReview.feedback, "", "", ""]);
    }
  }
  if (self.legacyText.trim()) rows.push(["自評", self.legacyText, "", "", "", "", "", "", ""]);
  const overallFeedback = manager.feedback.split("\n\n【逐筆實績補充要求】\n")[0].trim();
  if (overallFeedback) {
    if (rows.length) rows[0][5] = [rows[0][5], `整體評核：${overallFeedback}`].filter(Boolean).join("\n\n");
    else rows.push(["主管評核", "", "", "", "", overallFeedback, "", "", ""]);
  }
  for (const question of ACCOUNTABILITY_QUESTIONS) {
    const answer = manager.answers[question.id];
    if (answer != null) rows.push(["當責量表", question.text, "", "", answer, "", "", "", ""]);
  }
  return rows;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPerformanceExcel(reviews: PerformanceReview[], cycle: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "工作整合平台";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `績效考核-${cycle}`;
  workbook.subject = "組員績效考核資料";
  const used = new Set<string>();
  [...reviews]
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "zh-Hant"))
    .forEach((review) => {
      const worksheet = workbook.addWorksheet(safeSheetName(review.employeeName, used), {
        properties: { defaultRowHeight: 22 },
        pageSetup: {
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          orientation: "landscape",
          paperSize: 9,
        },
      });
      worksheet.columns = EXCEL_COLUMN_WIDTHS.map((width, index) => ({
        width,
        key: `column${index + 1}`,
      }));

      styleHeaderRow(worksheet.addRow(EXCEL_META_HEADERS), EXCEL_META_HEADER, "FF000000");
      basicInfoRows(review).forEach(([label, value]) => {
        const values: ExcelValue[] = ["基本資料", label, value, "", "", "", "", "", ""];
        const row = worksheet.addRow(values);
        stylePerformanceRow(row, values);
      });
      styleHeaderRow(worksheet.addRow(EXCEL_DETAIL_HEADERS), EXCEL_DETAIL_HEADER, "FFFFFFFF");
      detailRows(review).forEach((values) => {
        const row = worksheet.addRow(values);
        stylePerformanceRow(row, values);
      });

      worksheet.autoFilter = {
        from: { row: 15, column: 1 },
        to: { row: worksheet.rowCount, column: EXCEL_DETAIL_HEADERS.length },
      };
      worksheet.pageSetup.printTitlesRow = "15:15";
    });
  const output = await workbook.xlsx.writeBuffer();
  download(new Blob([output], { type: XLSX_MIME }), `${safeFileName(`績效考核-${cycle}`)}.xlsx`);
}

function escapeHtml(value: unknown) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
}

function linkHtml(value: string) {
  return value
    .split("\n")
    .filter(Boolean)
    .map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)
    .join("<br>");
}

export function downloadPerformanceHtml(reviews: PerformanceReview[], cycle: string) {
  const sections = [...reviews]
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "zh-Hant"))
    .map((review) => {
      const basicRows = basicInfoRows(review).map(([label, value]) => ["基本資料", label, value, "", "", "", "", "", ""]);
      const detail = detailRows(review);
      const rowHtml = (values: ExcelValue[]) => `<tr>${values.map((value, index) => `<td>${index === 7 ? linkHtml(text(value)) : escapeHtml(value)}</td>`).join("")}</tr>`;
      const rows = [
        `<tr class="basic-header">${EXCEL_META_HEADERS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`,
        ...basicRows.map(rowHtml),
        `<tr class="detail-header">${EXCEL_DETAIL_HEADERS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`,
        ...detail.map(rowHtml),
      ].join("");
      return `<section class="member"><h2>${escapeHtml(review.employeeName)}</h2><p class="meta">${escapeHtml(review.department)} · ${escapeHtml(review.role)} · ${escapeHtml(cycle)}</p><table><tbody>${rows}</tbody></table></section>`;
    })
    .join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>績效考核 ${escapeHtml(cycle)}</title><style>body{margin:0;padding:32px;background:#0b1424;color:#e8f0ff;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}h1{margin:0 0 8px;color:#8ab4ff}h2{margin:0;color:#9ed0ff}.meta{color:#98aaca}.member{margin:0 0 32px;padding:20px;border:1px solid #365a86;border-left:5px solid #6ea1ff;border-radius:14px;background:#151f32;overflow:auto}table{border-collapse:collapse;width:100%;min-width:1050px;margin-top:16px}th,td{padding:9px 10px;border:1px solid #365a86;text-align:left;vertical-align:top;white-space:pre-wrap;line-height:1.5;overflow-wrap:anywhere}.basic-header th{background:#ffff00;color:#111;font-weight:400}.detail-header th{background:#1f4e79;color:#fff;white-space:normal}.basic-header th:empty{color:transparent}tbody td{background:#f7f8fa;color:#111}a{color:#0563c1}</style></head><body><h1>績效考核資料</h1><p>匯出週期：${escapeHtml(cycle)}；本報表不包含主管退回紀錄、退回原因或退回附件。</p>${sections || "<p>目前沒有可匯出的組員資料。</p>"}</body></html>`;
  download(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFileName(`績效考核-${cycle}`)}.html`);
}
