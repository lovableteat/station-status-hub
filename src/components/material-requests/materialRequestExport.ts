export interface MaterialReportImage {
  dataUrl: string;
  id: string;
  mimeType: string;
  name: string;
}

export interface MaterialReportRow {
  actionStatus: string;
  assembly: string;
  footprint: string;
  internalPartNumber: string;
  item: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  manufacturerPartNumberAlt: string;
  marked: boolean;
  materialName: string;
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

const EXCEL_HEADERS = [
  "項次",
  "標記",
  "Ref Group",
  "REF DES",
  "料件名稱",
  "模組",
  "Qty",
  "Symbol",
  "Footprint",
  "廠商",
  "Manufacturer P/N",
  "Manufacturer P/N 2",
  "TX",
  "目前狀態",
  "狀態追蹤",
  "單號",
  "申請連結",
  "申請狀態資訊",
  "最後更新人",
  "Sourcing Status",
  "建料狀態",
  "內部料號",
  "規格 / 備註",
  "圖片",
] as const;

const EXCEL_COLUMN_WIDTHS = [10, 8, 20, 20, 30, 22, 9, 20, 20, 20, 24, 24, 22, 16, 34, 18, 30, 26, 18, 18, 18, 22, 38, 18];

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
    row.marked ? "★" : "",
    row.refGroup,
    row.refDes,
    row.materialName,
    row.assembly,
    row.qty,
    row.symbol,
    row.footprint,
    row.manufacturer,
    row.manufacturerPartNumber,
    row.manufacturerPartNumberAlt,
    row.tx,
    row.trackingStatus,
    row.trackingSummary,
    row.requestTicket,
    row.requestUrl,
    row.requestInfo,
    row.trackingOwner,
    row.sourcingStatus,
    row.actionStatus,
    row.internalPartNumber,
    row.specification,
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
    ["匯出人員", snapshot.exportedBy, "匯出時間", formatDateTime(snapshot.exportedAt)],
    ["資料截止時間", formatDateTime(snapshot.dataAsOf), "工作表", snapshot.sheetName],
    ["原始主料數", snapshot.originalGroupCount, "篩選後主料數", snapshot.filteredGroupCount],
    ["匯出明細數", snapshot.rows.length, "篩選條件", snapshot.filterSummary.join("；") || "全部資料"],
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
  headerRow.eachCell((cell) => {
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
        horizontal: [1, 2, 7, 14, 21].includes(column) ? "center" : "left",
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
      const linkCell = excelRow.getCell(17);
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
            tl: { col: 23.12, row: excelRow.number - 0.9 },
            ext: { width: 84, height: 56 },
          });
        }
      } catch {
        // Keep the image name in the cell when a source image cannot be decoded.
      }
    }
    onProgress?.({ phase: "images", current: index + 1, total: snapshot.rows.length });
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNumber, xSplit: 3 }];
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

    return `<tr>
      <td>${escapeHtml(row.item)}</td>
      <td>${row.marked ? "★" : ""}</td>
      <td><strong>${escapeHtml(row.refGroup)}</strong><small>${escapeHtml(row.refDes)}</small></td>
      <td><strong>${escapeHtml(row.materialName)}</strong><small>${escapeHtml(row.assembly)} · Qty ${escapeHtml(row.qty)}</small></td>
      <td>${escapeHtml(row.manufacturer)}<small>${escapeHtml(row.manufacturerPartNumber)}${row.manufacturerPartNumberAlt ? `<br>${escapeHtml(row.manufacturerPartNumberAlt)}` : ""}</small></td>
      <td>${escapeHtml(row.internalPartNumber)}<small>${escapeHtml(row.symbol)} / ${escapeHtml(row.footprint)}</small></td>
      <td>${escapeHtml(row.tx)}</td>
      <td><span class="status">${escapeHtml(row.trackingStatus || "未設定")}</span><small>${escapeHtml(row.trackingSummary)}</small></td>
      <td>${requestLink}<small>${escapeHtml(row.requestInfo)}${row.trackingOwner ? `<br>更新：${escapeHtml(row.trackingOwner)}` : ""}</small></td>
      <td>${escapeHtml(row.specification)}</td>
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
.image-link{cursor:zoom-in}.image-link img{transition:transform .18s ease,box-shadow .18s ease}.image-link:hover img,.image-link:focus-visible img{transform:scale(1.04);box-shadow:0 8px 22px rgba(16,32,51,.2)}.image-link:focus-visible{outline:2px solid #155e85;outline-offset:3px;border-radius:8px}.image-lightbox{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:clamp(16px,4vw,48px);background:rgba(4,14,25,.84);backdrop-filter:blur(8px)}.image-lightbox[hidden]{display:none}.image-lightbox__backdrop{position:absolute;inset:0;border:0;background:transparent;cursor:zoom-out}.image-lightbox__content{position:relative;z-index:1;max-width:min(1200px,92vw);max-height:90vh;margin:0;border:1px solid #8ac6d5;border-radius:16px;background:#fff;padding:12px;box-shadow:0 24px 70px rgba(4,14,25,.45)}.image-lightbox__content img{display:block;max-width:calc(92vw - 24px);max-height:calc(84vh - 52px);width:auto;height:auto;object-fit:contain;border-radius:10px}.image-lightbox__content figcaption{padding:10px 4px 2px;color:var(--muted);font-size:12px}.image-lightbox__close{position:absolute;right:10px;top:10px;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:rgba(16,32,51,.85);color:#fff;cursor:pointer;font-size:24px;line-height:1}
body.image-preview-open{overflow:hidden}
</style>
</head><body><main class="report">
<header class="hero"><h1>${escapeHtml(snapshot.reportName)}</h1><p>${escapeHtml(snapshot.workspaceName)} · 資料截至 ${escapeHtml(formatDateTime(snapshot.dataAsOf))}</p></header>
<section class="meta"><div><span>匯出人員</span><strong>${escapeHtml(snapshot.exportedBy)}</strong></div><div><span>匯出時間</span><strong>${escapeHtml(formatDateTime(snapshot.exportedAt))}</strong></div><div><span>來源</span><strong>${escapeHtml(snapshot.sourceFile)} / ${escapeHtml(snapshot.sheetName)}</strong></div><div><span>原始主料數</span><strong>${snapshot.originalGroupCount.toLocaleString()}</strong></div><div><span>篩選後主料數</span><strong>${snapshot.filteredGroupCount.toLocaleString()}</strong></div><div><span>匯出明細數</span><strong>${snapshot.rows.length.toLocaleString()}</strong></div></section>
<section class="filters">${filterBadges}</section><section class="stats">${statusCards}</section>
<div class="table-wrap"><table><thead><tr><th>項次</th><th>標記</th><th>REF</th><th>料件</th><th>廠商 / MPN</th><th>內部料號 / 圖面</th><th>TX</th><th>狀態追蹤</th><th>申請資訊</th><th>規格 / 備註</th><th>圖片</th></tr></thead><tbody>${bodyRows}</tbody></table></div>
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
