import { filePath, isSafeRelativePath } from "./files.ts";

const MiB = 1024 * 1024;
export const DATASHEET_FILE_LIMIT = 64 * MiB;
export const DATASHEET_BATCH_LIMIT = 128 * MiB;
export const DATASHEET_COUNT_LIMIT = 1000;

export interface DatasheetFileSelection {
  files: File[];
  added: number;
  duplicates: number;
  skipped: number;
  totalBytes: number;
}

export interface DatasheetFileSelectionOptions {
  maxTotalBytes?: number;
}

function checkedPath(file: File): string {
  const path = filePath(file);
  if (!isSafeRelativePath(path)) throw new Error(`不安全的檔案路徑：${path}`);
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`${path}：PDF 檔案是空的或大小無效`);
  if (file.size > DATASHEET_FILE_LIMIT) throw new Error(`${path}：單一 Datasheet PDF 不可超過 64 MiB`);
  if (!Number.isSafeInteger(file.lastModified)) throw new Error(`${path}：檔案修改時間無效，請重新選取`);
  return path;
}

/** Merge picker results without reading bytes or changing the previous selection. */
export function mergeDatasheetFiles(previous: readonly File[], incoming: readonly File[], options: DatasheetFileSelectionOptions = {}): DatasheetFileSelection {
  const maxTotalBytes = options.maxTotalBytes ?? DATASHEET_BATCH_LIMIT;
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes <= 0) throw new Error("Datasheet PDF 批次大小上限無效");
  const files: File[] = [];
  const paths = new Map<string, File>();
  let totalBytes = 0;
  let added = 0;
  let duplicates = 0;
  let skipped = 0;
  let pdfCount = 0;

  const append = (file: File, isNew: boolean) => {
    const path = checkedPath(file);
    const key = path.toLowerCase();
    const existing = paths.get(key);
    if (existing) {
      if (existing.size !== file.size || existing.lastModified !== file.lastModified) {
        throw new Error(`同一路徑有不同檔案：${path}。請先移除原檔，或放進不同資料夾再選取`);
      }
      if (isNew) duplicates++;
      return;
    }
    if (files.length >= DATASHEET_COUNT_LIMIT) throw new Error("Datasheet PDF 最多選取 1000 份，請分批匯入");
    const nextTotal = totalBytes + file.size;
    if (!Number.isSafeInteger(nextTotal) || nextTotal > maxTotalBytes) throw new Error(maxTotalBytes === DATASHEET_BATCH_LIMIT ? "Datasheet PDF 總量不可超過 128 MiB，請分批匯入" : "Datasheet PDF 總量超過目前批次上限，請分批匯入");
    paths.set(key, file);
    files.push(file);
    totalBytes = nextTotal;
    if (isNew) added++;
  };

  for (const file of previous) {
    if (!/\.pdf$/i.test(file.name)) throw new Error(`原本選取的檔案不是 PDF：${filePath(file)}`);
    append(file, false);
  }
  for (const file of incoming) {
    if (!/\.pdf$/i.test(file.name)) { skipped++; continue; }
    pdfCount++;
    append(file, true);
  }
  if (!pdfCount) throw new Error(incoming.length ? `沒有找到 PDF，已略過 ${skipped} 份其他檔案。請選擇包含 Datasheet PDF 的資料夾或檔案` : "沒有選到 PDF。請選擇包含 Datasheet PDF 的資料夾或檔案");
  return { files, added, duplicates, skipped, totalBytes };
}
