import { feedbackDate, feedbackExportPath, MAX_FEEDBACK_EXPORT_BYTES } from "./core.ts";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, FEEDBACK_TABS } from "./types.ts";
import type { FeedbackReport } from "./types.ts";

export async function exportFeedbackZip(
  source: readonly FeedbackReport[], download: (path: string) => Promise<Blob>, assertCurrent: () => void,
  progress?: (message: string) => void, now = new Date(),
) {
  if (!source.length) throw new Error("沒有可匯出的回報。");
  const reports = structuredClone(source);
  if (reports.some(report => !report.isSubmitted)) throw new Error("尚未送出的回報不能匯出。");
  const totalBytes = reports.reduce((sum, report) => sum + report.screenshots.reduce((size, image) => size + image.size, 0), 0);
  if (totalBytes > MAX_FEEDBACK_EXPORT_BYTES) throw new Error("截圖總量超過 500 MB，請使用篩選條件分批匯出。");
  assertCurrent();
  const [{ default: JSZip }, { default: ExcelJS }] = await Promise.all([import("jszip"), import("exceljs")]);
  assertCurrent();
  const zip = new JSZip(); const workbook = new ExcelJS.Workbook();
  workbook.creator = "Station Status Hub"; workbook.created = now;
  const sheet = workbook.addWorksheet("問題清單", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "回報編號", key: "id", width: 38 }, { header: "狀態", key: "status", width: 12 },
    { header: "分類", key: "category", width: 14 }, { header: "標題", key: "title", width: 32 },
    { header: "問題說明", key: "description", width: 60 }, { header: "回報者", key: "reporter", width: 26 },
    { header: "帳號", key: "username", width: 22 }, { header: "比對頁籤", key: "tab", width: 18 },
    { header: "比對名稱", key: "project", width: 26 }, { header: "A 版本", key: "a", width: 16 }, { header: "B 版本", key: "b", width: 16 },
    { header: "管理員處理備註", key: "note", width: 50 }, { header: "回報時間（台北）", key: "created", width: 23 },
    { header: "更新時間（台北）", key: "updated", width: 23 }, { header: "截圖數", key: "images", width: 10 },
    { header: "瀏覽器", key: "browser", width: 50 }, { header: "畫面尺寸", key: "viewport", width: 16 },
  ];
  const imageSheet = workbook.addWorksheet("截圖索引", { views: [{ state: "frozen", ySplit: 1 }] });
  imageSheet.columns = [{ header: "回報編號", key: "report", width: 38 }, { header: "問題標題", key: "title", width: 32 },
    { header: "原始截圖名稱", key: "name", width: 36 }, { header: "ZIP 內路徑", key: "path", width: 90 },
    { header: "大小（Bytes）", key: "size", width: 18 }, { header: "開啟截圖", key: "link", width: 16 }];
  const images = reports.flatMap(report => {
    sheet.addRow({ id: report.id, status: FEEDBACK_STATUSES[report.status], category: FEEDBACK_CATEGORIES[report.category], title: report.title,
      description: report.description, reporter: report.reporterName, username: report.reporterUsername, tab: FEEDBACK_TABS[report.tab], project: report.projectName,
      a: report.context.revisionA ?? "", b: report.context.revisionB ?? "", note: report.adminNote, created: feedbackDate(report.submittedAt ?? report.createdAt),
      updated: feedbackDate(report.updatedAt), images: report.screenshots.length, browser: report.context.browser ?? "", viewport: `${report.context.width ?? ""} × ${report.context.height ?? ""}` });
    return report.screenshots.map(image => ({ report, image, path: feedbackExportPath(report, image) }));
  });
  for (let index = 0; index < images.length; index++) {
    const { report, image, path } = images[index]; assertCurrent();
    progress?.(`正在整理截圖 ${index + 1}／${images.length}…`);
    const blob = await download(image.path); assertCurrent();
    if (blob.size !== image.size) throw new Error(`「${image.name}」下載不完整，匯出已停止，請重試。`);
    const bytes = await blob.arrayBuffer(); assertCurrent();
    zip.file(path, bytes);
    imageSheet.addRow({ report: report.id, title: report.title, name: image.name, path, size: image.size,
      link: { text: "開啟截圖", hyperlink: path, tooltip: "先解壓縮 ZIP，再從 Excel 開啟截圖" } });
  }
  for (const tab of [sheet, imageSheet]) {
    tab.autoFilter = { from: "A1", to: { row: Math.max(1, tab.rowCount), column: tab.columnCount } };
    tab.getRow(1).height = 30;
    tab.getRow(1).eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF214B40" } }; cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
    tab.eachRow((row, index) => { if (index === 1) return; row.height = 54; row.eachCell(cell => { cell.font = { ...cell.font, name: "Calibri", size: 11 }; cell.alignment = { vertical: "top", wrapText: true }; if (index % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F3" } }; }); });
  }
  progress?.("正在建立 Excel 與 ZIP…"); assertCurrent();
  const excel = await workbook.xlsx.writeBuffer(); assertCurrent();
  zip.file("AutoCheck-feedback.xlsx", excel);
  zip.file("reports.json", JSON.stringify({ exportedAt: now.toISOString(), reports: reports.map(report => ({ ...report, screenshots: report.screenshots.map(image => ({ ...image, archivePath: feedbackExportPath(report, image) })) })) }, null, 2));
  zip.file("使用說明.txt", `AutoCheck 意見收集\n匯出時間（台北）：${feedbackDate(now)}\n共 ${reports.length} 份回報、${images.length} 張截圖\n\n請先解壓縮 ZIP，再開啟 AutoCheck-feedback.xlsx。\n「問題清單」收錄問題說明、回報者、處理狀態與備註。\n「截圖索引」可依回報編號找到附圖，並使用相對連結開啟。\nreports.json 保留完整的回報資料，方便後續整理與修正。\n`);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); assertCurrent();
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(/[-: ]/g, "");
  return { bytes, name: `AutoCheck-feedback-${stamp}.zip`, reportCount: reports.length, imageCount: images.length };
}
