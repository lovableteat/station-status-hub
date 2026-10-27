import { formatTestPlanFileSize } from "./files.ts";

/** Whole percent for a transfer; never above 100 and 0 while the size is unknown. */
export function transferPercent(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}

export function formatTransferRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  return `${formatTestPlanFileSize(bytesPerSecond)}/s`;
}

export interface TransferSink {
  write(chunk: Uint8Array): Promise<void> | void;
  close(): Promise<void> | void;
  abort?(): Promise<void> | void;
}

interface SaveFilePickerHandle {
  createWritable(): Promise<{ write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Where the bytes go. Chrome/Edge offer a save dialog that streams straight to
 * disk (so a 600 MB datasheet never sits in memory); other browsers collect the
 * chunks and hand the blob to the download manager. Must be called inside the
 * user's click so the dialog is allowed to open.
 */
export async function openDefaultSink(fileName: string, maxBufferedBytes = Infinity, expectedSize = 0): Promise<TransferSink | "cancelled"> {
  const picker = (globalThis as { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveFilePickerHandle> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName });
      const writable = await handle.createWritable();
      return { write: (chunk) => writable.write(chunk), close: () => writable.close(), abort: () => writable.abort() };
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
      // No user activation or an unsupported context: fall through to the blob download.
    }
  }
  if (expectedSize > maxBufferedBytes) throw new Error("此瀏覽器無法串流儲存大型 ZIP，請改用 Chrome／Edge，或減少選取檔案至 128 MiB 內。");
  const chunks: Uint8Array[] = [];
  let buffered = 0;
  return {
    write: (chunk) => {
      buffered += chunk.byteLength;
      if (buffered > maxBufferedBytes) throw new Error("此瀏覽器的 ZIP 暫存已達 128 MiB，請改用 Chrome／Edge，或減少選取檔案。");
      chunks.push(chunk);
    },
    close: () => saveBlob(new Blob(chunks as BlobPart[]), fileName),
    abort: () => { chunks.length = 0; },
  };
}

interface DirectoryFileHandle {
  createWritable(): Promise<{ write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}

export interface DownloadDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<DirectoryFileHandle>;
}

/**
 * Asks once for a folder so a multi-file download does not open one save
 * dialog per file. Returns null when the browser has no folder picker.
 * Must be called inside the user's click.
 */
export async function pickDownloadDirectory(): Promise<DownloadDirectoryHandle | null | "cancelled"> {
  const picker = (globalThis as { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<DownloadDirectoryHandle> }).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: "readwrite" });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return "cancelled";
    return null;
  }
}

/** "report.pdf" -> "report (1).pdf" -> "report (2).pdf" ... */
export function numberedFileName(fileName: string, attempt: number): string {
  if (attempt === 0) return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? `${fileName.slice(0, dot)} (${attempt})${fileName.slice(dot)}`
    : `${fileName} (${attempt})`;
}

/** Writes into the picked folder without overwriting a file that is already there. */
export async function openDirectorySink(directory: DownloadDirectoryHandle, fileName: string): Promise<TransferSink> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = numberedFileName(fileName, attempt);
    try {
      await directory.getFileHandle(candidate);
      continue;
    } catch (error) {
      if ((error as { name?: string })?.name !== "NotFoundError") throw error;
    }
    const handle = await directory.getFileHandle(candidate, { create: true });
    const writable = await handle.createWritable();
    return { write: (chunk) => writable.write(chunk), close: () => writable.close(), abort: () => writable.abort() };
  }
  throw new Error(`資料夾裡已有太多同名檔案：${fileName}`);
}

export interface DownloadWithProgressOptions {
  fileName: string;
  expectedSize?: number;
  /** Short-lived direct link; `null` means the storage cannot stream and the blob fallback is used. */
  resolveUrl: () => Promise<string | null>;
  fallback: () => Promise<Blob>;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  openSink?: (fileName: string) => Promise<TransferSink | "cancelled">;
  fetchImpl?: typeof fetch;
}

/**
 * Download one file while reporting bytes as they arrive. Opens the sink first
 * (inside the click), then streams the signed link; a storage without links
 * falls back to the whole blob, reported as a single step.
 */
export async function downloadWithProgress(options: DownloadWithProgressOptions): Promise<"saved" | "cancelled"> {
  const { fileName, expectedSize = 0, resolveUrl, fallback, onProgress, signal } = options;
  const sink = await (options.openSink ?? openDefaultSink)(fileName);
  if (sink === "cancelled") return "cancelled";
  const fetchImpl = options.fetchImpl ?? fetch;
  const cancelled = async () => {
    await sink.abort?.();
    return "cancelled" as const;
  };
  try {
    if (signal?.aborted) return cancelled();
    const url = await resolveUrl().catch(() => null);
    if (!url) {
      const blob = await fallback();
      if (signal?.aborted) return cancelled();
      onProgress?.(0, blob.size);
      await sink.write(new Uint8Array(await blob.arrayBuffer()));
      onProgress?.(blob.size, blob.size);
      if (signal?.aborted) return cancelled();
      await sink.close();
      return "saved";
    }
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`下載連結回應 ${response.status}`);
    const headerSize = Number(response.headers.get("content-length"));
    let total = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : expectedSize;
    let loaded = 0;
    onProgress?.(0, total);
    if (!response.body) {
      const blob = await response.blob();
      loaded = blob.size;
      total = Math.max(total, loaded);
      await sink.write(new Uint8Array(await blob.arrayBuffer()));
    } else {
      const reader = response.body.getReader();
      try {
        for (;;) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          signal?.throwIfAborted();
          loaded += value.byteLength;
          if (loaded > total) total = loaded;
          await sink.write(value);
          onProgress?.(loaded, total);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    if (signal?.aborted) return cancelled();
    onProgress?.(loaded, Math.max(total, loaded));
    await sink.close();
    return "saved";
  } catch (error) {
    if (signal?.aborted || (error as { name?: string })?.name === "AbortError") return cancelled();
    await sink.abort?.();
    throw error;
  }
}
