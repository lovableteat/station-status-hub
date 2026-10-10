import type { PerformanceReview } from './assessmentTypes';
import { CATEGORIES, readSelfAssessment, readManagerAssessment, SELF_PREFIX, MANAGER_PREFIX } from './rd2Assessment.mjs';
import { buildPerformanceCopyText, buildPerformanceReviewsCopyText } from './performanceCopyText.ts';
import { buildPerformanceExcel, buildPerformanceHtml, type ExportOptions } from './performanceExport.ts';

// Bound the working set: source envelopes, decoded evidence and generated reports
// coexist while JSZip writes the archive in the browser.
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 2000;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
type EvidenceFile = { path: string; name: string; bytes: Uint8Array };

function checkAccess(options: ExportOptions) {
  if (options.canDownload && !options.canDownload()) throw new Error('資料保護狀態已更新。');
}

function component(value: unknown, fallback: string) {
  const cleaned = String(value || '').normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '_').replace(/\p{Cc}/gu, '_')
    .replace(/^\.+|[. ]+$/g, '').trim();
  return (cleaned || fallback).slice(0, 120);
}

function fileComponent(value: unknown, fallback: string) {
  const name = String(value || '');
  const suffix = /\.([a-z0-9]{1,12})$/i.exec(name)?.[0] || '';
  const stem = component(suffix ? name.slice(0, -suffix.length) : name, fallback);
  return `${stem.slice(0, 120 - suffix.length)}${suffix}`;
}

function memberFolder(review: PerformanceReview, index: number) {
  const self = readSelfAssessment(review.selfFeedback);
  return `${String(index + 1).padStart(3, '0')}-${component(review.employeeName, '未命名員工')}-${component(self.employeeNumber || review.employeeId, '無工號')}`;
}

function decodeEvidence(dataUrl: unknown, name: string, declaredSize?: unknown) {
  const source = typeof dataUrl === 'string' ? dataUrl : '';
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(source);
  if (!match) throw new Error(`附件「${name}」無法讀取，請重新附加後再匯出。`);
  const encoded = match[2];
  const unpadded = encoded.replace(/=+$/, '');
  const padding = encoded.length - unpadded.length;
  if (unpadded.length % 4 === 1 || (padding && (encoded.length % 4 !== 0 || padding !== (4 - unpadded.length % 4) % 4))) {
    throw new Error(`附件「${name}」內容不完整，請重新附加後再匯出。`);
  }
  const size = Math.floor(unpadded.length * 3 / 4);
  if (size > MAX_ATTACHMENT_BYTES) throw new Error(`附件「${name}」超過 4 MB，請重新附加較小的檔案。`);
  if (declaredSize !== undefined && (!Number.isFinite(Number(declaredSize)) || Number(declaredSize) !== size)) {
    throw new Error(`附件「${name}」大小與內容不一致，請重新附加後再匯出。`);
  }
  try {
    const decoded = atob(encoded);
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    if (bytes.byteLength !== size) throw new Error('size');
    return { bytes, mimeType: match[1].toLowerCase() };
  } catch {
    throw new Error(`附件「${name}」內容不完整，請重新附加後再匯出。`);
  }
}

// Normalization intentionally drops malformed saved evidence. A ZIP must fail
// visibly instead of claiming that those missing files were packaged.
function rawSelf(review: PerformanceReview): Record<string, unknown> {
  if (!review.selfFeedback.startsWith(SELF_PREFIX)) return {};
  try {
    const parsed = JSON.parse(review.selfFeedback.slice(SELF_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error(`「${review.employeeName}」的自評資料不完整，請重新讀取後再匯出。`);
  }
}

function collectEvidence(review: PerformanceReview, folder: string, selfOnly: boolean): EvidenceFile[] {
  const self = readSelfAssessment(review.selfFeedback);
  const raw = rawSelf(review) as { sections?: Record<string, { entries?: Array<{ attachments?: unknown[] }>; images?: unknown[] }> };
  const files: EvidenceFile[] = [];
  for (const category of CATEGORIES) {
    const section = self.sections[category];
    const rawSection = raw.sections?.[category];
    const rawAttachments = (Array.isArray(rawSection?.entries) ? rawSection.entries : [])
      .flatMap(entry => Array.isArray(entry?.attachments) ? entry.attachments : []);
    const entries = section.entries || [];
    const attachments = entries.flatMap(entry => entry.attachments || []);
    const rawImages = Array.isArray(rawSection?.images) ? rawSection.images : [];
    if (rawAttachments.length !== attachments.length || rawImages.length !== section.images.length) {
      throw new Error(`「${review.employeeName}」${category} 有無法讀取的佐證檔案，請重新附加後再匯出。`);
    }
    entries.forEach((entry, entryIndex) => {
      (entry.attachments || []).forEach((attachment, fileIndex) => {
        const name = fileComponent(attachment.name, '未命名附件');
        const { bytes } = decodeEvidence(attachment.dataUrl, attachment.name, attachment.size);
        files.push({ path: `佐證檔案/${folder}/${category}/實績-${entryIndex + 1}/${String(fileIndex + 1).padStart(2, '0')}-${name}`, name: attachment.name, bytes });
      });
    });
    section.images.forEach((image, index) => {
      const { bytes, mimeType } = decodeEvidence(image.dataUrl, image.name || '未命名圖片');
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
      let name = fileComponent(image.name, '圖片');
      if (!/\.(png|jpe?g|webp)$/i.test(name)) name += `.${extension}`;
      files.push({ path: `佐證檔案/${folder}/${category}/圖片/${String(index + 1).padStart(2, '0')}-${name}`, name: image.name, bytes });
    });
  }
  if (!selfOnly) {
    const manager = readManagerAssessment(review.managerFeedback);
    let rawManager: { entryReviews?: Record<string, Record<string, { attachments?: unknown[] }>>; returnHistory?: Array<{ entries?: Array<{ attachments?: Array<{ id?: string; dataUrl?: string }> }> }> } = {};
    if (review.managerFeedback.startsWith(MANAGER_PREFIX)) {
      try { rawManager = JSON.parse(review.managerFeedback.slice(MANAGER_PREFIX.length)) || {}; }
      catch { throw new Error(`「${review.employeeName}」的主管資料不完整，請重新讀取後再匯出。`); }
    }
    // Returning resets returnRequested; compare history as well, otherwise old
    // return evidence would silently enter a later approved export.
    const returnedFiles = (Array.isArray(rawManager.returnHistory) ? rawManager.returnHistory : [])
      .flatMap(event => (Array.isArray(event?.entries) ? event.entries : []).flatMap(entry => Array.isArray(entry?.attachments) ? entry.attachments : []));
    for (const category of CATEGORIES) {
      const entries = (self.sections[category].entries || []).filter(entry => entry.text.trim());
      entries.forEach((entry, entryIndex) => {
        const response = manager.entryReviews[category]?.[entry.id];
        if (!response || response.returnRequested) return;
        const rawFiles = rawManager.entryReviews?.[category]?.[entry.id]?.attachments;
        if ((Array.isArray(rawFiles) ? rawFiles.length : 0) !== response.attachments.length) {
          throw new Error(`「${review.employeeName}」${category} 有無法讀取的主管回覆附件，請重新附加後再匯出。`);
        }
        response.attachments.forEach((attachment, fileIndex) => {
          if (returnedFiles.some(file => file?.id === attachment.id || file?.dataUrl === attachment.dataUrl)) return;
          const name = fileComponent(attachment.name, '未命名附件');
          const { bytes } = decodeEvidence(attachment.dataUrl, attachment.name, attachment.size);
          files.push({ path: `主管回覆附件/${folder}/${category}/實績-${entryIndex + 1}/${String(fileIndex + 1).padStart(2, '0')}-${name}`, name: attachment.name, bytes });
        });
      });
    }
  }
  return files;
}

/** All evidence is local data URL content; external HTTPS links remain links. */
export async function buildPerformanceArchive(reviews: PerformanceReview[], cycle: string, options: ExportOptions = {}): Promise<Blob> {
  checkAccess(options);
  if (!reviews.length) throw new Error('目前沒有可匯出的考核資料。');
  if (reviews.some(review => review.contentLoaded === false)) throw new Error('考核詳細資料尚未讀取完成，請完成讀取後再匯出。');
  const sourceBytes = reviews.reduce((total, review) => total + new TextEncoder().encode(review.selfFeedback + (options.selfOnly ? '' : review.managerFeedback)).byteLength, 0);
  if (sourceBytes > MAX_ARCHIVE_BYTES) throw new Error('匯出資料超過 128 MB，請減少勾選人數後分批匯出。');
  // Preserve the selected version across asynchronous workbook/compression work.
  const snapshots = reviews.map(review => ({ ...review, goals: [...review.goals] }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'zh-Hant'));
  const groups = snapshots.map((review, index) => ({ review, folder: memberFolder(review, index) }));
  options.onProgress?.('檢查佐證檔案…');
  await new Promise(resolve => setTimeout(resolve, 0));
  checkAccess(options);
  let fileCount = 0, evidenceBytes = 0;
  const evidence: EvidenceFile[] = [];
  for (const [index, group] of groups.entries()) {
    const files = collectEvidence(group.review, group.folder, options.selfOnly === true);
    fileCount += files.length;
    evidenceBytes += files.reduce((total, file) => total + file.bytes.byteLength, 0);
    if (fileCount > MAX_EVIDENCE_FILES || evidenceBytes > MAX_ARCHIVE_BYTES) throw new Error('佐證檔案過多，請減少勾選人數後分批匯出。');
    evidence.push(...files);
    if (index % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 0));
      checkAccess(options);
    }
  }
  checkAccess(options);
  const JSZip = (await import('jszip')).default;
  checkAccess(options);
  const zip = new JSZip();
  options.onProgress?.('建立 Excel 與 HTML…');
  const excel = await buildPerformanceExcel(snapshots, cycle, options);
  checkAccess(options);
  const excelBytes = await excel.arrayBuffer();
  checkAccess(options);
  const html = buildPerformanceHtml(snapshots, cycle, options);
  const combinedText = buildPerformanceReviewsCopyText(snapshots, cycle);
  const title = options.selfOnly ? '員工自評' : '績效考核';
  zip.file(`${title}.xlsx`, excelBytes);
  zip.file(`${title}.html`, html);
  zip.file('一鍵複製_全部自評.txt', combinedText);
  groups.forEach(group => zip.file(`一鍵複製/${group.folder}.txt`, buildPerformanceCopyText(group.review)));
  evidence.forEach(file => zip.file(file.path, file.bytes));
  const manifest = [
    `${title}匯出包｜${cycle}`,
    `匯出人數：${snapshots.length}；佐證檔案：${fileCount} 個`,
    '',
    'Excel 首頁與個人頁保留原有導覽；HTML 可直接在瀏覽器開啟。',
    '一鍵複製文字將 IDP、OKR、KPI 合併，可貼到公司系統的單一大欄位。',
    '佐證檔案資料夾依員工、類別、實績分類；檔名前的編號避免同名覆蓋。',
    options.selfOnly ? '只包含員工自評佐證檔案與圖片，不包含主管資料。' : '包含自評佐證檔案、圖片及目前逐項主管回覆附件；不包含退回歷史、退回原因或退回附件。主管整體附件沿用原匯出排除退回附件的範圍，不納入。',
    '外部證明連結保留在報表與文字中，未下載外部網站的檔案。',
    '',
    ...groups.map(group => `人員：${group.review.employeeName} → ${group.folder}`),
    '',
    ...evidence.map(file => `${file.name || '未命名圖片'} → ${file.path}`),
  ].join('\r\n');
  zip.file('檔案索引與使用說明.txt', manifest);
  const generatedBytes = excelBytes.byteLength + new TextEncoder().encode(html + combinedText + manifest + groups.map(group => buildPerformanceCopyText(group.review)).join('')).byteLength;
  if (generatedBytes + evidenceBytes > MAX_ARCHIVE_BYTES) throw new Error('匯出資料超過 128 MB，請減少勾選人數後分批匯出。');
  checkAccess(options);
  options.onProgress?.('壓縮檔案…');
  let lastPercent = -1;
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } }, metadata => {
    checkAccess(options);
    const percent = Math.floor(metadata.percent);
    if (percent !== lastPercent) { lastPercent = percent; options.onProgress?.(`壓縮檔案 ${percent}%…`); }
  });
  checkAccess(options);
  return new Blob([output], { type: 'application/zip' });
}
