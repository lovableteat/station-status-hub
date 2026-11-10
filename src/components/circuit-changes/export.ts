import { CIRCUIT_CHANGE_STATUS_LABELS, CIRCUIT_IMAGE_SIDE_LABELS, type CircuitChangeEvent, type CircuitChangeItem, type CircuitChangeSet, type CircuitImage } from "./types";
import { createCircuitImageUrls } from "./files";
import { loadCircuitChangeEventsForExport, loadCircuitChangeItemsForExport } from "./storage";

const date = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const EVENT_LABELS: Record<string, string> = { created: "建立", edited: "修改", submit: "回報改善", approve: "確認結案", request_changes: "退回重改", comment: "留言" };

export function circuitChangeExportRows(items: CircuitChangeItem[], events: CircuitChangeEvent[] = []) {
  const creators = new Map(events.filter(event => event.type === "created").map(event => [event.itemId, event.actorName || event.actorId]));
  const actors = new Map(events.map(event => [`${event.itemId}:${event.revision}`, event.actorName || event.actorId]));
  return items.map(item => [item.number, item.content.title, CIRCUIT_CHANGE_STATUS_LABELS[item.status], item.revision,
    item.content.owner, item.content.reason, item.content.description, item.content.refs, item.content.net, item.content.page,
    item.content.images.length, creators.get(item.id) || item.createdBy, date(item.createdAt), actors.get(`${item.id}:${item.revision}`) || item.updatedBy, date(item.updatedAt)]);
}

async function imagePreview(image: CircuitImage, url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`無法下載匯出圖片：${image.name}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`匯出圖片是空的：${image.name}`);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const element = new Image(); element.src = objectUrl; await element.decode();
    const scale = Math.min(1, 960 / Math.max(element.naturalWidth, element.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(element.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立圖片預覽，匯出已停止。");
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const radius = Math.max(9, Math.min(canvas.width, canvas.height) * .025);
    image.marks.forEach((mark, index) => {
      const x = mark.x * canvas.width, y = mark.y * canvas.height;
      context.strokeStyle = "#d97706"; context.lineWidth = Math.max(2, radius / 5);
      if (mark.kind === "box") { context.fillStyle = "#fbbf2420"; context.fillRect(x, y, (mark.width ?? 0) * canvas.width, (mark.height ?? 0) * canvas.height); context.strokeRect(x, y, (mark.width ?? 0) * canvas.width, (mark.height ?? 0) * canvas.height); }
      const cx = Math.min(canvas.width - radius, Math.max(radius, x)), cy = Math.min(canvas.height - radius, Math.max(radius, y));
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fillStyle = "#fbbf24"; context.fill(); context.stroke();
      context.font = `bold ${Math.round(radius * 1.2)}px sans-serif`; context.fillStyle = "#111827"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(index + 1), cx, cy);
    });
    return { base64: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function exportCircuitChangeList(set: CircuitChangeSet, source: CircuitChangeItem[], suppliedEvents?: CircuitChangeEvent[]): Promise<void> {
  if (!source.length) throw new Error("目前範圍沒有可匯出的問題。");
  const ids = source.map(item => item.id);
  const loaded = await loadCircuitChangeItemsForExport(ids);
  const [events, { default: ExcelJS }] = await Promise.all([
    suppliedEvents ? Promise.resolve(suppliedEvents) : loadCircuitChangeEventsForExport(ids), import("exceljs"),
  ]);
  const byId = new Map(loaded.map(item => [item.id, item]));
  const items = ids.map(id => { const item = byId.get(id); if (!item || item.setId !== set.id) throw new Error("匯出範圍已變更，請重新載入後重試。"); return item; });
  const images = items.flatMap(item => item.content.images), urls = await createCircuitImageUrls(images);
  const workbook = new ExcelJS.Workbook(); workbook.creator = "工作平台"; workbook.created = new Date();
  const summary = workbook.addWorksheet("Change List", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.addRow([set.title]); summary.addRow(["來源版次", set.fromLabel, "目標版次", set.toLabel]); summary.addRow(["匯出範圍", `${items.length} 個問題／${images.length} 張圖片`, "修改批次 ID", set.id]);
  summary.addRow(["項目", "標題", "狀態", "修訂", "負責人", "問題說明", "改善說明", "Ref", "Net", "頁碼", "圖片數", "建立人", "建立時間（台北）", "最後更新人", "更新時間（台北）"]);
  summary.addRows(circuitChangeExportRows(items, events)); summary.columns.forEach((column, index) => { column.width = [8, 32, 16, 8, 20, 40, 60, 24, 24, 14, 10, 26, 23, 26, 23][index]; });
  summary.autoFilter = { from: "A4", to: { row: Math.max(4, summary.rowCount), column: 15 } };
  const history = workbook.addWorksheet("追蹤紀錄", { views: [{ state: "frozen", ySplit: 1 }] });
  history.columns = [{ header: "項目", width: 9 }, { header: "修訂", width: 9 }, { header: "操作", width: 20 }, { header: "操作者", width: 26 }, { header: "時間（台北）", width: 24 }, { header: "意見", width: 70 }];
  const numbers = new Map(items.map(item => [item.id, item.number]));
  events.filter(event => numbers.has(event.itemId) && event.revision <= byId.get(event.itemId)!.revision).forEach(event => history.addRow([numbers.get(event.itemId), event.revision, EVENT_LABELS[event.type] || event.type, event.actorName || event.actorId, date(event.createdAt), event.note]));
  for (const item of items) {
    if (!item.content.images.length) continue;
    const sheet = workbook.addWorksheet(`修改 ${item.number} 圖片`);
    sheet.columns = [{ width: 28 }, { width: 28 }, { width: 28 }, { width: 28 }];
    sheet.addRow([`#${item.number} ${item.content.title} · 修訂 ${item.revision}`]);
    sheet.mergeCells("A1:D1"); sheet.addRow(["圖片為可攜式標註預覽；原圖與舊修訂保存在工作平台。"]); sheet.mergeCells("A2:D2");
    for (const image of item.content.images) {
      const heading = sheet.addRow([CIRCUIT_IMAGE_SIDE_LABELS[image.side], image.name, `${image.width} × ${image.height}`, `${image.size.toLocaleString()} bytes`]);
      const preview = await imagePreview(image, urls[image.id].thumbnail);
      const imageId = workbook.addImage({ base64: preview.base64, extension: "png" });
      const top = heading.number, displayWidth = Math.min(720, preview.width), displayHeight = preview.height * displayWidth / preview.width;
      const rows = Math.max(3, Math.ceil(displayHeight / 24));
      for (let index = 0; index < rows; index++) sheet.addRow([]).height = 18;
      sheet.addImage(imageId, { tl: { col: 0, row: top }, ext: { width: displayWidth, height: displayHeight }, editAs: "oneCell" });
      sheet.addRow(["圖片說明", image.caption]);
      for (const [index, mark] of image.marks.entries()) sheet.addRow([`標記 ${index + 1}`, mark.text, mark.kind === "box" ? "框選" : "位置標記", `${Math.round(mark.x * 100)}%, ${Math.round(mark.y * 100)}%`]);
      sheet.addRow([]);
    }
  }
  for (const sheet of workbook.worksheets) sheet.eachRow(row => row.eachCell(cell => { cell.font = { name: "Calibri", size: 11 }; cell.alignment = { vertical: "top", wrapText: true }; }));
  for (const [sheet, headerRow] of [[summary, 4], [history, 1]] as const) sheet.getRow(headerRow).eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF214B40" } }; cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }; });
  const buffer = await workbook.xlsx.writeBuffer(), blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${set.title.replace(/[\\/:*?"<>|]/g, "-") || "線路修改"}-Change-List.xlsx`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
