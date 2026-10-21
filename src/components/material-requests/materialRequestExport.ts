import type { MaterialGroup, MaterialWorkbookRecord } from "./materialRequestUtils";

export interface MaterialReportImage {
  dataUrl: string;
  id: string;
  mimeType: string;
  name: string;
}

export interface MaterialReportRow {
  /** Legacy snapshots only; the 建料狀態 column no longer exists. */
  actionStatus?: string;
  assembly: string;
  footprint: string;
  internalPartNumber: string;
  item: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  manufacturerPartNumberAlt?: string;
  /** Legacy snapshots only; the 標記 column no longer exists. */
  marked?: boolean;
  materialName: string;
  remark?: string;
  specDocumentName?: string;
  partName?: string;
  partUsageStatus?: string;
  phaseOutStatus?: string;
  qty: string;
  refDes: string;
  refGroup: string;
  requestInfo: string;
  requestTicket: string;
  requestUrl: string;
  sourcingStatus: string;
  specification: string;
  symbol: string;
  trackingOwner: string;
  trackingStatus: string;
  trackingSummary: string;
  trackingUpdatedAt?: string;
  tx: string;
  images: MaterialReportImage[];
}

export interface MaterialReportSnapshot {
  dataAsOf: string;
  exportedAt: string;
  exportedBy: string;
  filteredGroupCount: number;
  filterSummary: string[];
  id: string;
  originalGroupCount: number;
  reportName: string;
  rows: MaterialReportRow[];
  sheetName: string;
  scopeLabel: string;
  sourceFile: string;
  statusCounts: Record<string, number>;
  workspaceName: string;
}

export type MaterialExportPhase =
  | "snapshot"
  | "images"
  | "excel"
  | "html"
  | "complete";

export interface MaterialExportProgress {
  current?: number;
  phase: MaterialExportPhase;
  total?: number;
}

type ProgressHandler = (progress: MaterialExportProgress) => void;

// The report mirrors the 料號申請 table: the CE workbook columns in workbook
// order, then the website-maintained tracking columns.
const EXCEL_HEADERS = [
  "Item",
  "Name",
  "Qty",
  "Ref Des",
  "Manufacturer Part Number",
  "Manufacturer",
  "Sourcing Status",
  "虛擬料號",
  "實體料號",
  "Part Name",
  "Part Spec",
  "Schematic_Part",
  "PCB_Footprint",
  "phase out",
  "零件狀態",
  "狀態追蹤",
  "追蹤內容",
  "單號",
  "單號連結",
  "申請資訊",
  "最後更新人",
  "最後追蹤時間",
  "模組",
  "備註",
  "SPEC 文件",
  "圖片",
] as const;

const EXCEL_COLUMN_WIDTHS = [8, 34, 7, 22, 28, 24, 16, 16, 16, 24, 30, 20, 20, 14, 30, 12, 34, 16, 28, 24, 14, 18, 16, 28, 24, 18];
const EXCEL_CENTERED_COLUMNS = new Set(
  (["Item", "Qty", "phase out", "零件狀態", "狀態追蹤"] as const)
    .map((header) => EXCEL_HEADERS.indexOf(header) + 1),
);
const EXCEL_REQUEST_LINK_COLUMN = EXCEL_HEADERS.indexOf("單號連結") + 1;
const EXCEL_IMAGE_COLUMN_INDEX = EXCEL_HEADERS.indexOf("圖片");
// CE workbook meanings (row 5 of the 交付格式) as header notes; kept in step with materialUploadContract.mjs.
const EXCEL_HEADER_NOTES: Partial<Record<(typeof EXCEL_HEADERS)[number], string>> = {
  Name: "設計 BOM 的料件名稱",
  Qty: "單一產品的用量",
  "Ref Des": "電路位號，例如 C101、R1",
  "Manufacturer Part Number": "單一廠商的單一原廠料號（MPN）",
  Manufacturer: "該列 MPN 的製造商",
  "Sourcing Status": "供應／核准來源狀態，保留原文",
  虛擬料號: "可共用多個實體料的上層料號",
  實體料號: "已申請的單一廠商、單一 MPN 實體料號",
  "Part Name": "實體料號對應的公司料名",
  "Part Spec": "料件規格，保留原內容",
  Schematic_Part: "原理圖符號(orcad要能叫出原理圖符號)",
  PCB_Footprint: "零件footprint",
  "phase out": "零件狀態（保留公司原文）",
  零件狀態: "新設計使用限制；不明填待確認",
  Item: "網站列號",
  狀態追蹤: "網站人工維護的追蹤狀態，不是 CE Excel 欄位",
  追蹤內容: "最新一筆追蹤的說明",
  單號: "申請單號",
  單號連結: "申請單連結",
  申請資訊: "最新追蹤附帶的申請資訊",
  最後更新人: "最新一筆追蹤的建立者",
  最後追蹤時間: "最新一筆追蹤的時間",
  模組: "網站的模組分組",
  備註: "網站維護的申請狀態／備註",
  "SPEC 文件": "附在料件上的 SPEC 檔名",
  圖片: "追蹤紀錄的第一張圖片（HTML 匯出含全部圖片）",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getTimestamp(value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}_${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "料號申請篩選報表";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderCollapsibleRefDes(value: string) {
  const items = value
    .split(/[\n,;，；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) return '<small class="muted">未填寫</small>';
  if (items.length <= 4 && value.length <= 120) {
    return `<small class="ref-preview">${escapeHtml(items.join(", "))}</small>`;
  }

  const preview = items.slice(0, 2).join(", ");
  return `<details class="cell-details">
    <summary class="cell-details__summary">
      <span class="cell-details__preview">${escapeHtml(preview)}</span>
      <span class="cell-details__count">共 ${items.length.toLocaleString()} 項</span>
      <span class="cell-details__chevron" aria-hidden="true"></span>
    </summary>
    <div class="cell-details__content">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
  </details>`;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1] || "application/octet-stream", base64: match[2] };
}

async function createJpegThumbnail(dataUrl: string, maxWidth = 320, maxHeight = 220) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is unavailable"));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    image.onerror = () => reject(new Error("Image thumbnail generation failed"));
    image.src = dataUrl;
  });
}

function rowToValues(row: MaterialReportRow) {
  return [
    row.item,
    row.materialName,
    row.qty,
    row.refDes,
    row.manufacturerPartNumber,
    row.manufacturer,
    row.sourcingStatus,
    row.tx,
    row.internalPartNumber,
    row.partName ?? "",
    row.specification,
    row.symbol,
    row.footprint,
    row.phaseOutStatus ?? "",
    row.partUsageStatus ?? "",
    row.trackingStatus,
    row.trackingSummary,
    row.requestTicket,
    row.requestUrl,
    row.requestInfo,
    row.trackingOwner,
    row.trackingUpdatedAt ? formatDateTime(row.trackingUpdatedAt) : "",
    row.assembly,
    row.remark ?? "",
    row.specDocumentName ?? "",
    row.images.length > 0 ? `${row.images[0].name}${row.images.length > 1 ? `（共 ${row.images.length} 張）` : ""}` : "",
  ];
}

export async function exportMaterialReportExcel(
  snapshot: MaterialReportSnapshot,
  onProgress?: ProgressHandler,
) {
  onProgress?.({ phase: "images", current: 0, total: snapshot.rows.length });
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = snapshot.exportedBy;
  workbook.created = new Date(snapshot.exportedAt);
  workbook.modified = new Date(snapshot.exportedAt);
  workbook.subject = snapshot.filterSummary.join("；") || "全部資料";
  workbook.title = snapshot.reportName;

  const sheet = workbook.addWorksheet("料號申請報表", {
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      orientation: "landscape",
      paperSize: 9,
    },
    properties: { defaultRowHeight: 22 },
  });
  sheet.columns = EXCEL_COLUMN_WIDTHS.map((width) => ({ width }));

  sheet.mergeCells(1, 1, 1, EXCEL_HEADERS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = snapshot.reportName;
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 20 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12355B" } };
  sheet.getRow(1).height = 34;

  const summaryRows = [
    ["BOM", snapshot.workspaceName, "來源檔案", snapshot.sourceFile],
    ["匯出範圍", snapshot.scopeLabel, "資料截止時間", formatDateTime(snapshot.dataAsOf)],
    ["匯出人員", snapshot.exportedBy, "匯出時間", formatDateTime(snapshot.exportedAt)],
    ["工作表", snapshot.sheetName, "匯出明細數", snapshot.rows.length],
    ["原始主料數", snapshot.originalGroupCount, "篩選後主料數", snapshot.filteredGroupCount],
    ["篩選條件", snapshot.filterSummary.join("；") || "全部資料", "報表識別", snapshot.id],
  ];

  summaryRows.forEach((values, index) => {
    const row = sheet.getRow(index + 3);
    row.values = values;
    row.height = index === summaryRows.length - 1 ? 36 : 24;
    [1, 3].forEach((column) => {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: "FF164E63" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F6FA" } };
    });
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD9E7EF" } },
        left: { style: "thin", color: { argb: "FFD9E7EF" } },
        right: { style: "thin", color: { argb: "FFD9E7EF" } },
        top: { style: "thin", color: { argb: "FFD9E7EF" } },
      };
    });
    sheet.mergeCells(index + 3, 4, index + 3, EXCEL_HEADERS.length);
  });

  const statusEntries = Object.entries(snapshot.statusCounts);
  const statusRow = sheet.getRow(9);
  statusRow.values = ["狀態摘要", ...statusEntries.flatMap(([label, count]) => [`${label}：${count}`])];
  statusRow.height = 26;
  statusRow.eachCell((cell, column) => {
    cell.font = { bold: true, color: { argb: column === 1 ? "FFFFFFFF" : "FF0F5132" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column === 1 ? "FF176B87" : "FFDDF4E8" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const headerRowNumber = 11;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = [...EXCEL_HEADERS];
  headerRow.height = 30;
  headerRow.eachCell((cell, column) => {
    const note = EXCEL_HEADER_NOTES[EXCEL_HEADERS[column - 1]];
    if (note) cell.note = note;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D5F8A" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF9EC5DD" } },
      left: { style: "thin", color: { argb: "FF9EC5DD" } },
      right: { style: "thin", color: { argb: "FF9EC5DD" } },
      top: { style: "thin", color: { argb: "FF9EC5DD" } },
    };
  });

  for (let index = 0; index < snapshot.rows.length; index += 1) {
    const reportRow = snapshot.rows[index];
    const excelRow = sheet.addRow(rowToValues(reportRow));
    excelRow.height = reportRow.images.length > 0 ? 66 : 38;
    excelRow.eachCell((cell, column) => {
      cell.alignment = {
        horizontal: EXCEL_CENTERED_COLUMNS.has(column) ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFD5E3EC" } },
        left: { style: "hair", color: { argb: "FFD5E3EC" } },
        right: { style: "hair", color: { argb: "FFD5E3EC" } },
        top: { style: "hair", color: { argb: "FFD5E3EC" } },
      };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8FB" } };
      }
    });

    if (reportRow.requestUrl) {
      const linkCell = excelRow.getCell(EXCEL_REQUEST_LINK_COLUMN);
      linkCell.value = { text: reportRow.requestUrl, hyperlink: reportRow.requestUrl };
      linkCell.font = { color: { argb: "FF0563C1" }, underline: true };
    }

    const firstImage = reportRow.images[0];
    if (firstImage?.dataUrl) {
      try {
        const thumbnail = await createJpegThumbnail(firstImage.dataUrl);
        const parsedThumbnail = parseDataUrl(thumbnail);
        if (parsedThumbnail) {
          const imageId = workbook.addImage({ base64: parsedThumbnail.base64, extension: "jpeg" });
          sheet.addImage(imageId, {
            tl: { col: EXCEL_IMAGE_COLUMN_INDEX + 0.12, row: excelRow.number - 0.9 },
            ext: { width: 84, height: 56 },
          });
        }
      } catch {
        // Keep the image name in the cell when a source image cannot be decoded.
      }
    }
    onProgress?.({ phase: "images", current: index + 1, total: snapshot.rows.length });
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNumber, xSplit: 2 }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: EXCEL_HEADERS.length },
  };
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

  onProgress?.({ phase: "excel" });
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${sanitizeFileName(snapshot.reportName)}_${getTimestamp(new Date(snapshot.exportedAt))}.xlsx`;
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName,
  );
  onProgress?.({ phase: "complete" });
  return fileName;
}

function buildHtmlReport(snapshot: MaterialReportSnapshot, imagePathById?: Map<string, string>) {
  const filterBadges = snapshot.filterSummary.length > 0
    ? snapshot.filterSummary.map((filter) => `<span class="filter">${escapeHtml(filter)}</span>`).join("")
    : '<span class="filter">全部資料</span>';
  const statusCards = Object.entries(snapshot.statusCounts)
    .map(([label, count]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${count.toLocaleString()}</strong></div>`)
    .join("");
  const bodyRows = snapshot.rows.map((row) => {
    const images = row.images.length > 0
      ? `<div class="images">${row.images.map((image, imageIndex) => {
          const src = imagePathById?.get(image.id) ?? image.dataUrl;
          return `<a class="image-link" href="${escapeHtml(src)}" data-image-src="${escapeHtml(src)}" data-image-name="${escapeHtml(image.name)}" aria-label="放大檢視 ${escapeHtml(image.name)}"><img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(image.name)}"><small>${escapeHtml(image.name)}${imageIndex === 0 && row.images.length > 1 ? `（共 ${row.images.length} 張）` : ""}</small></a>`;
        }).join("")}</div>`
      : '<span class="muted">無圖片</span>';
    const requestLink = row.requestUrl
      ? `<a class="link" href="${escapeHtml(row.requestUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.requestTicket || "開啟連結")}</a>`
      : escapeHtml(row.requestTicket);

    const trackingTime = row.trackingUpdatedAt ? formatDateTime(row.trackingUpdatedAt) : "";
    const trackingMeta = [row.trackingOwner, trackingTime].filter(Boolean).join(" · ");

    return `<tr>
      <td>${escapeHtml(row.item)}</td>
      <td><strong>${escapeHtml(row.materialName)}</strong>${row.assembly ? `<small>模組：${escapeHtml(row.assembly)}</small>` : ""}</td>
      <td>${escapeHtml(row.qty)}</td>
      <td class="ref-cell">${renderCollapsibleRefDes(row.refDes)}</td>
      <td>${escapeHtml(row.manufacturerPartNumber)}</td>
      <td>${escapeHtml(row.manufacturer)}</td>
      <td>${escapeHtml(row.sourcingStatus)}</td>
      <td>${escapeHtml(row.tx)}</td>
      <td>${escapeHtml(row.internalPartNumber)}</td>
      <td>${escapeHtml(row.partName)}</td>
      <td>${escapeHtml(row.specification)}</td>
      <td>${escapeHtml(row.symbol)}</td>
      <td>${escapeHtml(row.footprint)}</td>
      <td>${escapeHtml(row.phaseOutStatus)}</td>
      <td>${escapeHtml(row.partUsageStatus)}</td>
      <td><span class="status">${escapeHtml(row.trackingStatus || "未設定")}</span>${row.trackingSummary ? `<small>${escapeHtml(row.trackingSummary)}</small>` : ""}${trackingMeta ? `<small>${escapeHtml(trackingMeta)}</small>` : ""}</td>
      <td>${requestLink}${row.requestInfo ? `<small>${escapeHtml(row.requestInfo)}</small>` : ""}</td>
      <td>${escapeHtml(row.remark)}</td>
      <td>${escapeHtml(row.specDocumentName)}</td>
      <td>${images}</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(snapshot.reportName)}</title>
<style>
:root{color-scheme:light;--ink:#102033;--muted:#587086;--line:#cddce7;--blue:#155e85;--cyan:#dff3f7;--paper:#f4f8fb}*{box-sizing:border-box}body{margin:0;background:#e9f0f5;color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}.report{max-width:1800px;margin:0 auto;background:white;min-height:100vh}.hero{padding:28px 32px;background:linear-gradient(135deg,#123a61,#17677c);color:white}.hero h1{margin:0;font-size:28px}.hero p{margin:8px 0 0;color:#d7eef5}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:18px 32px;background:#f7fafc;border-bottom:1px solid var(--line)}.meta div,.stat{border:1px solid var(--line);border-radius:10px;background:white;padding:12px 14px}.meta span,.stat span{display:block;color:var(--muted);font-size:12px}.meta strong,.stat strong{display:block;margin-top:4px;font-size:16px}.filters,.stats{display:flex;flex-wrap:wrap;gap:8px;padding:14px 32px;border-bottom:1px solid var(--line)}.filter{border:1px solid #8ac6d5;border-radius:999px;background:var(--cyan);padding:6px 10px;font-size:12px}.stats .stat{min-width:140px}.table-wrap{overflow:auto;padding:0 24px 32px}table{width:100%;min-width:1500px;border-collapse:separate;border-spacing:0;font-size:12px}thead th{position:sticky;top:0;z-index:2;background:var(--blue);color:white;text-align:left;padding:11px 10px;border-right:1px solid rgba(255,255,255,.2)}tbody td{vertical-align:top;padding:10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);max-width:260px;overflow-wrap:anywhere}tbody tr:nth-child(even){background:var(--paper)}td small{display:block;margin-top:5px;color:var(--muted);line-height:1.45}.status{display:inline-block;border:1px solid #7bb8c7;border-radius:999px;background:#e5f5f7;padding:4px 8px;font-weight:700}.link{color:#075f9a}.images{display:flex;flex-wrap:wrap;gap:6px}.images a{display:block;color:var(--muted);text-decoration:none}.images img{display:block;width:96px;height:68px;object-fit:cover;border:1px solid var(--line);border-radius:6px}.images small{max-width:110px}.muted{color:var(--muted)}.footer{padding:16px 32px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:900px){.meta{grid-template-columns:1fr}.hero,.meta,.filters,.stats{padding-left:18px;padding-right:18px}}@media print{body{background:white}.report{max-width:none}.hero{print-color-adjust:exact;-webkit-print-color-adjust:exact}.table-wrap{overflow:visible;padding:0}table{min-width:0;font-size:8px}thead{display:table-header-group}.images img{width:56px;height:40px}.footer{page-break-before:avoid}}
</style>
<style>
.report-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 32px;border-bottom:1px solid var(--line);background:#f7fafc}.report-actions__hint{color:var(--muted);font-size:12px}.report-actions__buttons{display:flex;gap:8px}.report-actions button{border:1px solid #8ac6d5;border-radius:8px;background:#fff;color:#164e63;padding:7px 12px;font:inherit;font-weight:700;cursor:pointer}.report-actions button:hover,.report-actions button:focus-visible{background:var(--cyan);border-color:#3c9db3;outline:none}.ref-cell{min-width:220px}.ref-preview{line-height:1.5}.cell-details{margin-top:7px}.cell-details__summary{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px;min-height:36px;padding:7px 8px;border:1px solid #b7cedd;border-radius:8px;background:#f7fbfd;color:var(--ink);cursor:pointer;list-style:none}.cell-details__summary::-webkit-details-marker{display:none}.cell-details__summary:hover,.cell-details__summary:focus-visible{border-color:#4ba7ba;background:#eaf7fa;outline:none}.cell-details__preview{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.45}.cell-details__count{white-space:nowrap;border-radius:999px;background:#dff3f7;color:#155e75;padding:3px 7px;font-size:11px;font-weight:700}.cell-details__chevron::before{content:"展開";color:#0d6f89;font-size:11px;font-weight:700}.cell-details[open] .cell-details__chevron::before{content:"收合"}.cell-details[open] .cell-details__summary{border-bottom-left-radius:0;border-bottom-right-radius:0;background:#eaf7fa}.cell-details__content{display:flex;flex-wrap:wrap;gap:5px;padding:9px;border:1px solid #8ac6d5;border-top:0;border-radius:0 0 8px 8px;background:#fff}.cell-details__content span{border:1px solid #d4e3ec;border-radius:6px;background:#f4f8fb;padding:3px 6px;line-height:1.35}
.image-link{cursor:zoom-in}.image-link img{transition:transform .18s ease,box-shadow .18s ease}.image-link:hover img,.image-link:focus-visible img{transform:scale(1.04);box-shadow:0 8px 22px rgba(16,32,51,.2)}.image-link:focus-visible{outline:2px solid #155e85;outline-offset:3px;border-radius:8px}.image-lightbox{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:clamp(16px,4vw,48px);background:rgba(4,14,25,.84);backdrop-filter:blur(8px)}.image-lightbox[hidden]{display:none}.image-lightbox__backdrop{position:absolute;inset:0;border:0;background:transparent;cursor:zoom-out}.image-lightbox__content{position:relative;z-index:1;max-width:min(1200px,92vw);max-height:90vh;margin:0;border:1px solid #8ac6d5;border-radius:16px;background:#fff;padding:12px;box-shadow:0 24px 70px rgba(4,14,25,.45)}.image-lightbox__content img{display:block;max-width:calc(92vw - 24px);max-height:calc(84vh - 52px);width:auto;height:auto;object-fit:contain;border-radius:10px}.image-lightbox__content figcaption{padding:10px 4px 2px;color:var(--muted);font-size:12px}.image-lightbox__close{position:absolute;right:10px;top:10px;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:rgba(16,32,51,.85);color:#fff;cursor:pointer;font-size:24px;line-height:1}
body.image-preview-open{overflow:hidden}
@media(max-width:900px){.report-actions{align-items:flex-start;flex-direction:column;padding-left:18px;padding-right:18px}}@media print{.report-actions{display:none}.cell-details__summary{display:none}.cell-details__content{display:flex!important;border:0;padding:0}.cell-details__content span{border:0;background:transparent;padding:0}.cell-details__content span:not(:last-child)::after{content:", "}}
</style>
</head><body><main class="report">
<header class="hero"><h1>${escapeHtml(snapshot.reportName)}</h1><p>${escapeHtml(snapshot.workspaceName)} · 資料截至 ${escapeHtml(formatDateTime(snapshot.dataAsOf))}</p></header>
<section class="meta"><div><span>匯出範圍</span><strong>${escapeHtml(snapshot.scopeLabel)}</strong></div><div><span>匯出人員</span><strong>${escapeHtml(snapshot.exportedBy)}</strong></div><div><span>匯出時間</span><strong>${escapeHtml(formatDateTime(snapshot.exportedAt))}</strong></div><div><span>來源</span><strong>${escapeHtml(snapshot.sourceFile)} / ${escapeHtml(snapshot.sheetName)}</strong></div><div><span>原始主料數</span><strong>${snapshot.originalGroupCount.toLocaleString()}</strong></div><div><span>篩選後主料數</span><strong>${snapshot.filteredGroupCount.toLocaleString()}</strong></div><div><span>匯出明細數</span><strong>${snapshot.rows.length.toLocaleString()}</strong></div></section>
<section class="filters">${filterBadges}</section><section class="stats">${statusCards}</section>
<section class="report-actions"><span class="report-actions__hint">長內容已預設收合，可逐筆展開或一次控制全部資料。</span><div class="report-actions__buttons"><button type="button" data-details-action="expand">全部展開</button><button type="button" data-details-action="collapse">全部收合</button></div></section>
<div class="table-wrap"><table><thead><tr><th>Item</th><th>Name</th><th>Qty</th><th>Ref Des</th><th>Manufacturer Part Number</th><th>Manufacturer</th><th>Sourcing Status</th><th>虛擬料號</th><th>實體料號</th><th>Part Name</th><th>Part Spec</th><th>Schematic_Part</th><th>PCB_Footprint</th><th>phase out</th><th>零件狀態</th><th>狀態追蹤</th><th>單號</th><th>備註</th><th>SPEC 文件</th><th>圖片</th></tr></thead><tbody>${bodyRows}</tbody></table></div>
<footer class="footer">報表識別：${escapeHtml(snapshot.id)} · 本報表為 ${escapeHtml(formatDateTime(snapshot.dataAsOf))} 的固定查詢快照，不會隨系統後續更新自動改變。</footer>
</main>
<div class="image-lightbox" id="image-lightbox" hidden role="dialog" aria-modal="true" aria-label="圖片放大預覽">
  <button class="image-lightbox__backdrop" type="button" data-close-image aria-label="關閉圖片預覽"></button>
  <figure class="image-lightbox__content">
    <button class="image-lightbox__close" type="button" data-close-image aria-label="關閉圖片預覽">×</button>
    <img id="image-lightbox-image" alt="">
    <figcaption id="image-lightbox-caption"></figcaption>
  </figure>
</div>
<script>
(() => {
  const details = Array.from(document.querySelectorAll(".cell-details"));
  const controls = document.querySelectorAll("[data-details-action]");
  const setAllDetails = (open) => details.forEach((entry) => { entry.open = open; });

  controls.forEach((control) => control.addEventListener("click", () => {
    setAllDetails(control.getAttribute("data-details-action") === "expand");
  }));

  let printState = [];
  window.addEventListener("beforeprint", () => {
    printState = details.map((entry) => entry.open);
    setAllDetails(true);
  });
  window.addEventListener("afterprint", () => {
    details.forEach((entry, index) => { entry.open = Boolean(printState[index]); });
  });
})();

(() => {
  const lightbox = document.getElementById("image-lightbox");
  const previewImage = document.getElementById("image-lightbox-image");
  const caption = document.getElementById("image-lightbox-caption");
  const links = Array.from(document.querySelectorAll(".image-link"));
  if (!lightbox || !previewImage || !caption) return;

  let lastFocusedElement = null;
  const close = () => {
    lightbox.hidden = true;
    document.body.classList.remove("image-preview-open");
    previewImage.removeAttribute("src");
    lastFocusedElement?.focus();
  };
  const open = (link) => {
    const src = link.getAttribute("data-image-src") || link.getAttribute("href");
    if (!src) return;
    lastFocusedElement = link;
    previewImage.src = src;
    previewImage.alt = link.getAttribute("data-image-name") || "報表圖片";
    caption.textContent = previewImage.alt;
    lightbox.hidden = false;
    document.body.classList.add("image-preview-open");
    lightbox.querySelector("[data-close-image]")?.focus();
  };

  links.forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    open(link);
  }));
  lightbox.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-close-image]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) close();
  });
})();
</script>
</body></html>`;
}

export async function exportMaterialReportHtml(
  snapshot: MaterialReportSnapshot,
  onProgress?: ProgressHandler,
) {
  onProgress?.({ phase: "html" });
  const html = buildHtmlReport(snapshot);
  const fileName = `${sanitizeFileName(snapshot.reportName)}_${getTimestamp(new Date(snapshot.exportedAt))}.html`;
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName);
  onProgress?.({ phase: "complete" });
  return fileName;
}

export async function exportMaterialReportHtmlZip(
  snapshot: MaterialReportSnapshot,
  onProgress?: ProgressHandler,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const imagePathById = new Map<string, string>();
  const images = snapshot.rows.flatMap((row) => row.images);
  const usedPaths = new Set<string>();

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const parsed = parseDataUrl(image.dataUrl);
    if (!parsed) continue;
    const extension = parsed.mimeType.includes("png") ? "png" : parsed.mimeType.includes("webp") ? "webp" : "jpg";
    const safeBaseName = sanitizeFileName(image.name.replace(/\.[^.]+$/, "")) || `image-${index + 1}`;
    let path = `images/${String(index + 1).padStart(4, "0")}-${safeBaseName}.${extension}`;
    let suffix = 2;
    while (usedPaths.has(path)) {
      path = `images/${String(index + 1).padStart(4, "0")}-${safeBaseName}-${suffix}.${extension}`;
      suffix += 1;
    }
    usedPaths.add(path);
    imagePathById.set(image.id, path);
    zip.file(path, parsed.base64, { base64: true });
    onProgress?.({ phase: "images", current: index + 1, total: images.length });
  }

  onProgress?.({ phase: "html" });
  zip.file("料號申請篩選報表.html", buildHtmlReport(snapshot, imagePathById));
  zip.file("README.txt", `請以瀏覽器開啟「料號申請篩選報表.html」。\r\n資料截至：${formatDateTime(snapshot.dataAsOf)}\r\n報表識別：${snapshot.id}\r\n請保留 images 資料夾與 HTML 在同一目錄。`);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const fileName = `${sanitizeFileName(snapshot.reportName)}_${getTimestamp(new Date(snapshot.exportedAt))}_HTML.zip`;
  downloadBlob(blob, fileName);
  onProgress?.({ phase: "complete" });
  return fileName;
}

export interface DiscouragedMaterialRow {
  refDes: string;
  name: string;
  manufacturerPartNumber: string;
  manufacturer: string;
  partNumber: string;
  virtualAlternative: string;
  partUsageStatus: string;
}

const DISCOURAGED_USAGE_PATTERN = /不建議/;

/**
 * Physical part numbers whose 零件狀態 says the part is not recommended
 * (「新設計產品不建議使用 - ODM不建議用料」 and the like), one row per record.
 */
export function collectDiscouragedMaterialRows(
  records: ReadonlyArray<Pick<MaterialWorkbookRecord, "refDes" | "refGroup" | "name" | "manufacturerPartNumber" | "manufacturer" | "partNumber" | "virtualAlternative" | "partUsageStatus">>,
): DiscouragedMaterialRow[] {
  return records
    .filter((record) => DISCOURAGED_USAGE_PATTERN.test(record.partUsageStatus ?? ""))
    .map((record) => ({
      refDes: record.refDes?.trim() || record.refGroup?.trim() || "",
      name: record.name ?? "",
      manufacturerPartNumber: record.manufacturerPartNumber ?? "",
      manufacturer: record.manufacturer ?? "",
      partNumber: record.partNumber?.trim() ?? "",
      virtualAlternative: record.virtualAlternative?.trim() ?? "",
      partUsageStatus: record.partUsageStatus ?? "",
    }))
    .sort((left, right) => left.refDes.localeCompare(right.refDes, undefined, { numeric: true }));
}

export const DISCOURAGED_EXPORT_HEADERS = ["Ref Des", "Name", "Manufacturer Part Number", "Manufacturer", "實體料號", "虛擬料號", "零件狀態"];

export async function exportDiscouragedMaterialsExcel({
  rows,
  workspaceName,
  exportedBy,
  exportedAt = new Date(),
}: {
  rows: DiscouragedMaterialRow[];
  workspaceName: string;
  exportedBy: string;
  exportedAt?: Date;
}) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = exportedBy;
  workbook.created = exportedAt;
  workbook.title = `${workspaceName} 不建議料`;
  const sheet = workbook.addWorksheet("不建議料", { properties: { defaultRowHeight: 20 } });
  sheet.columns = [18, 44, 30, 30, 18, 18, 44].map((width) => ({ width }));
  const headerRow = sheet.addRow(DISCOURAGED_EXPORT_HEADERS);
  headerRow.font = { bold: true };
  rows.forEach((row) => {
    sheet.addRow([row.refDes, row.name, row.manufacturerPartNumber, row.manufacturer, row.partNumber, row.virtualAlternative, row.partUsageStatus]);
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DISCOURAGED_EXPORT_HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${sanitizeFileName(`${workspaceName}_不建議料`)}_${getTimestamp(exportedAt)}.xlsx`;
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
  return fileName;
}

export const NON_PVL_APPLY_HEADER = "料號(必填)";

/** Unique physical part numbers, in first-seen order, for the PLM Non PVL apply list. */
export function collectNonPvlPartNumbers(rows: ReadonlyArray<Pick<DiscouragedMaterialRow, "partNumber">>) {
  return Array.from(new Set(rows.map((row) => row.partNumber.trim()).filter(Boolean)));
}

/**
 * PLM's Non PVL 申請 only accepts the sample file layout: one 料號(必填) column,
 * one part number per row, saved as Excel 97-2003 (.xls) with no filter or
 * hidden column, so this writer uses SheetJS BIFF8 instead of ExcelJS.
 */
export async function exportNonPvlApplyList({
  partNumbers,
  workspaceName,
  exportedAt = new Date(),
}: {
  partNumbers: string[];
  workspaceName: string;
  exportedAt?: Date;
}) {
  const xlsx = await import("xlsx");
  const sheet = xlsx.utils.aoa_to_sheet([[NON_PVL_APPLY_HEADER], ...partNumbers.map((partNumber) => [partNumber])]);
  sheet["!cols"] = [{ wch: 24 }];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const output = xlsx.write(workbook, { bookType: "biff8", type: "array" }) as ArrayBuffer;
  const fileName = `applyNonPvlParts_${sanitizeFileName(workspaceName)}_${getTimestamp(exportedAt)}.xls`;
  downloadBlob(new Blob([output], { type: "application/vnd.ms-excel" }), fileName);
  return fileName;
}

export interface VendorMailItem {
  refDes: string;
  name: string;
  manufacturerPartNumber: string;
  qty: string;
  partSpec: string;
  partUsageStatus: string;
}

export interface VendorMailSection {
  vendor: string;
  subject: string;
  items: VendorMailItem[];
}

export const UNKNOWN_VENDOR_LABEL = "未填廠商";

/**
 * One mail per manufacturer: every MPN candidate of the pending groups, grouped
 * by its manufacturer so the same vendor receives a single request.
 */
export function buildVendorMailSections(
  groups: ReadonlyArray<Pick<MaterialGroup, "displayRef" | "name" | "qty" | "records">>,
  workspaceName: string,
): VendorMailSection[] {
  const byVendor = new Map<string, VendorMailItem[]>();
  for (const group of groups) {
    const seen = new Set<string>();
    for (const record of group.records) {
      const vendor = record.manufacturer?.trim() || UNKNOWN_VENDOR_LABEL;
      const mpn = record.manufacturerPartNumber?.trim() ?? "";
      const key = `${vendor}\u0000${mpn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const items = byVendor.get(vendor) ?? [];
      items.push({
        refDes: record.refDes?.trim() || group.displayRef,
        name: record.name || group.name,
        manufacturerPartNumber: mpn,
        qty: String(group.qty ?? ""),
        partSpec: record.partSpec ?? "",
        partUsageStatus: record.partUsageStatus ?? "",
      });
      byVendor.set(vendor, items);
    }
  }
  return [...byVendor.entries()]
    .sort(([left], [right]) => (left === UNKNOWN_VENDOR_LABEL ? 1 : right === UNKNOWN_VENDOR_LABEL ? -1 : left.localeCompare(right, "zh-Hant", { numeric: true })))
    .map(([vendor, items]) => ({
      vendor,
      subject: `【料號申請】${workspaceName} · ${vendor} 共 ${items.length} 項`,
      items: items.sort((left, right) => left.refDes.localeCompare(right.refDes, undefined, { numeric: true })),
    }));
}

export function renderVendorMailText(section: VendorMailSection, message: string) {
  const lines = [
    `主旨：${section.subject}`,
    "",
    ...(message.trim() ? [message.trim(), ""] : []),
    `${section.vendor} 需申請料號（共 ${section.items.length} 項）：`,
    ...section.items.map((item, index) => {
      const extras = [item.qty ? `Qty ${item.qty}` : "", item.partSpec, item.partUsageStatus].filter(Boolean).join("；");
      return `${index + 1}. ${item.refDes} · ${item.name} · MPN ${item.manufacturerPartNumber || "未填"}${extras ? `（${extras}）` : ""}`;
    }),
  ];
  return lines.join("\n");
}

export async function exportVendorMailHtml({
  sections,
  message,
  workspaceName,
  exportedBy,
  exportedAt = new Date(),
}: {
  sections: VendorMailSection[];
  message: string;
  workspaceName: string;
  exportedBy: string;
  exportedAt?: Date;
}) {
  const sectionHtml = sections.map((section, index) => {
    const rows = section.items.map((item, itemIndex) => `<tr><td>${itemIndex + 1}</td><td>${escapeHtml(item.refDes)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.manufacturerPartNumber)}</td><td>${escapeHtml(item.qty)}</td><td>${escapeHtml(item.partSpec)}</td><td>${escapeHtml(item.partUsageStatus)}</td></tr>`).join("");
    const text = renderVendorMailText(section, message);
    return `<section class="mail" id="mail-${index + 1}">
<header><h2>${escapeHtml(section.vendor)}<small>${section.items.length} 項</small></h2><div class="actions"><button type="button" data-copy="text-${index + 1}">複製純文字信件</button><button type="button" data-copy-html="mail-${index + 1}">複製表格版本</button></div></header>
<p class="subject"><strong>主旨：</strong>${escapeHtml(section.subject)}</p>
${message.trim() ? `<div class="message">${escapeHtml(message.trim()).replace(/\n/g, "<br>")}</div>` : ""}
<table><thead><tr><th>#</th><th>Ref Des</th><th>Name</th><th>Manufacturer Part Number</th><th>Qty</th><th>Part Spec</th><th>零件狀態</th></tr></thead><tbody>${rows}</tbody></table>
<textarea id="text-${index + 1}" readonly aria-label="${escapeHtml(section.vendor)} 純文字信件">${escapeHtml(text)}</textarea>
</section>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(workspaceName)} 料號申請信件</title>
<style>
:root{color-scheme:light;--ink:#102033;--muted:#587086;--line:#cddce7;--blue:#155e85;--paper:#f4f8fb}*{box-sizing:border-box}body{margin:0;background:#e9f0f5;color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;font-size:14px}.page{max-width:1100px;margin:0 auto;padding:24px}.hero{padding:22px 24px;border-radius:14px;background:linear-gradient(135deg,#123a61,#17677c);color:#fff}.hero h1{margin:0;font-size:22px}.hero p{margin:8px 0 0;color:#d7eef5}.mail{margin-top:18px;border:1px solid var(--line);border-radius:14px;background:#fff;padding:18px 20px}.mail header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.mail h2{margin:0;font-size:18px}.mail h2 small{margin-left:8px;color:var(--muted);font-size:13px;font-weight:400}.actions{display:flex;gap:8px}.actions button{border:1px solid #8ac6d5;border-radius:8px;background:#fff;color:#164e63;padding:7px 12px;font:inherit;font-weight:700;cursor:pointer}.actions button:hover{background:#dff3f7}.actions button.is-done{background:#dcfce7;border-color:#4ade80;color:#166534}.subject{margin:12px 0 6px}.message{white-space:pre-wrap;margin:0 0 12px;padding:12px;border-left:3px solid #8ac6d5;background:var(--paper)}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}thead th{background:var(--blue);color:#fff}tbody tr:nth-child(even){background:var(--paper)}textarea{position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0}.footer{margin-top:18px;color:var(--muted);font-size:12px}
</style></head><body><main class="page">
<header class="hero"><h1>${escapeHtml(workspaceName)} 料號申請信件</h1><p>共 ${sections.length} 家廠商 · ${sections.reduce((sum, section) => sum + section.items.length, 0)} 項 · 由 ${escapeHtml(exportedBy)} 於 ${escapeHtml(formatDateTime(exportedAt.toISOString()))} 產生。每家廠商一封：按「複製純文字信件」貼到郵件即可群發，「複製表格版本」會連表格一起複製。</p></header>
${sectionHtml}
<footer class="footer">信件內容依產生當下的待處理料整理，後續料況變動不會自動更新。</footer>
</main>
<script>
(() => {
  const mark = (button) => { button.classList.add("is-done"); const label = button.textContent; button.textContent = "已複製"; setTimeout(() => { button.textContent = label; button.classList.remove("is-done"); }, 1600); };
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    const area = document.getElementById(button.getAttribute("data-copy"));
    if (!area) return;
    try { await navigator.clipboard.writeText(area.value); } catch { area.style.position = "static"; area.select(); document.execCommand("copy"); area.style.position = ""; }
    mark(button);
  }));
  document.querySelectorAll("[data-copy-html]").forEach((button) => button.addEventListener("click", async () => {
    const section = document.getElementById(button.getAttribute("data-copy-html"));
    if (!section) return;
    const clone = section.cloneNode(true);
    clone.querySelectorAll(".actions, textarea").forEach((node) => node.remove());
    const html = clone.innerHTML;
    const text = section.querySelector("textarea")?.value ?? "";
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    } catch { await navigator.clipboard.writeText(text); }
    mark(button);
  }));
})();
</script></body></html>`;
  const fileName = `${sanitizeFileName(`${workspaceName}_料號申請信件`)}_${getTimestamp(exportedAt)}.html`;
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName);
  return fileName;
}
