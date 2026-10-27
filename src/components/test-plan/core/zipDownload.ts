import type { TestPlanEntry, TestPlanFileRecord, TestPlanFolder } from "../types.ts";
import { downloadWithProgress, numberedFileName, openDefaultSink, type TransferSink } from "./transfers.ts";

export interface ZipDownloadEntry {
  path: string;
  file?: TestPlanFileRecord;
}

/** Expand selected folders without duplicating descendants also selected by search. */
export function collectDownloadEntries(entries: readonly TestPlanEntry[], folders: readonly TestPlanFolder[], files: readonly TestPlanFileRecord[]): ZipDownloadEntry[] {
  const result: ZipDownloadEntry[] = [];
  const selectedFolders = new Set(entries.filter(entry => entry.kind === "folder").map(entry => entry.id));
  const visited = new Set<string>();
  const paths = new Set<string>();
  const hasSelectedParent = (parentId: string | null) => {
    const ancestors = new Set<string>();
    while (parentId && !ancestors.has(parentId)) {
      if (selectedFolders.has(parentId)) return true;
      ancestors.add(parentId);
      parentId = folders.find(folder => folder.id === parentId)?.parentId ?? null;
    }
    return false;
  };
  const add = (entry: TestPlanEntry, parentPath: string) => {
    const key = `${entry.kind}:${entry.id}`;
    if (visited.has(key)) return;
    visited.add(key);
    const name = (entry.kind === "file" ? entry.originalName : entry.name)
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_").replace(/[. ]+$/g, "") || "未命名";
    let path = parentPath + name;
    for (let attempt = 1; paths.has(path.normalize("NFC").toLowerCase()); attempt++) path = parentPath + numberedFileName(name, attempt);
    paths.add(path.normalize("NFC").toLowerCase());
    if (entry.kind === "file") {
      result.push({ path, file: entry });
      return;
    }
    path += "/";
    result.push({ path });
    for (const folder of folders.filter(folder => folder.parentId === entry.id && folder.spaceId === entry.spaceId)) add({ ...folder, kind: "folder" }, path);
    for (const file of files.filter(file => file.folderId === entry.id && file.spaceId === entry.spaceId)) add({ ...file, kind: "file" }, path);
  };
  for (const entry of entries) {
    if (!hasSelectedParent(entry.kind === "file" ? entry.folderId : entry.parentId)) add(entry, "");
  }
  return result;
}

interface ZipDownloadOptions {
  fileName: string;
  entries: readonly ZipDownloadEntry[];
  resolveUrl: (file: TestPlanFileRecord) => Promise<string | null>;
  fallback: (file: TestPlanFileRecord) => Promise<Blob>;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  openSink?: (fileName: string) => Promise<TransferSink | "cancelled">;
  fetchImpl?: typeof fetch;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const ZIP_LIMIT = 0xffffffff;
const ZIP_MEMORY_LIMIT = 128 * 1024 * 1024;

/** STORE keeps already compressed Excel files unchanged and streams with disk backpressure. */
export async function downloadZipWithProgress(options: ZipDownloadOptions): Promise<"saved" | "cancelled"> {
  const { entries, signal, onProgress } = options;
  const names = entries.map(entry => new TextEncoder().encode(entry.path));
  let total = entries.reduce((sum, entry) => sum + (entry.file?.fileSize ?? 0), 0);
  const expectedSize = total + names.reduce((sum, name) => sum + 92 + 2 * name.length, 22);
  // shortcut: classic ZIP stays below 4 GiB and 65535 entries; add ZIP64 when larger batch exports are needed.
  if (entries.length >= 65535 || names.some(name => name.length > 65535) || !Number.isFinite(total) || total < 0 || expectedSize >= ZIP_LIMIT) {
    throw new Error("單次 ZIP 須小於 4 GiB 且少於 65,535 個項目，請分批下載；單一檔案可直接下載。");
  }
  if (signal?.aborted) return "cancelled";
  const sink = await (options.openSink ? options.openSink(options.fileName) : openDefaultSink(options.fileName, ZIP_MEMORY_LIMIT, expectedSize));
  if (sink === "cancelled") return "cancelled";
  const central: Uint8Array[] = [];
  let offset = 0;
  let loaded = 0;
  const write = async (bytes: Uint8Array) => {
    signal?.throwIfAborted();
    if (offset + bytes.byteLength >= ZIP_LIMIT) throw new Error("ZIP 已達 4 GiB，請減少選取檔案後分批下載。");
    await sink.write(bytes);
    offset += bytes.byteLength;
  };
  try {
    onProgress?.(0, total);
    for (let index = 0; index < entries.length; index++) {
      signal?.throwIfAborted();
      const entry = entries[index];
      const name = names[index];
      const start = offset;
      const local = new Uint8Array(30 + name.length);
      const header = new DataView(local.buffer);
      header.setUint32(0, 0x04034b50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 0x0808, true); // UTF-8 and a trailing size/CRC descriptor.
      header.setUint16(12, 0x21, true);
      header.setUint16(26, name.length, true);
      local.set(name, 30);
      await write(local);
      let crc = 0xffffffff;
      let size = 0;
      if (entry.file) {
        const before = loaded;
        const expected = entry.file.fileSize;
        const outcome = await downloadWithProgress({
          fileName: entry.file.originalName, expectedSize: expected, signal,
          resolveUrl: () => options.resolveUrl(entry.file!), fallback: () => options.fallback(entry.file!),
          fetchImpl: options.fetchImpl,
          openSink: async () => ({
            write: async chunk => {
              for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
              size += chunk.byteLength;
              await write(chunk);
            },
            close() {},
          }),
          onProgress: (current, currentTotal) => {
            loaded = before + current;
            onProgress?.(loaded, Math.max(loaded, total - expected + currentTotal));
          },
        });
        if (outcome === "cancelled") {
          await sink.abort?.();
          return "cancelled";
        }
        total += size - expected;
      }
      const descriptor = new Uint8Array(16);
      const data = new DataView(descriptor.buffer);
      data.setUint32(0, 0x08074b50, true);
      data.setUint32(4, (crc ^ 0xffffffff) >>> 0, true);
      data.setUint32(8, size, true);
      data.setUint32(12, size, true);
      await write(descriptor);
      const directory = new Uint8Array(46 + name.length);
      const record = new DataView(directory.buffer);
      record.setUint32(0, 0x02014b50, true);
      record.setUint16(4, 20, true);
      record.setUint16(6, 20, true);
      directory.set(local.subarray(6, 14), 8);
      directory.set(descriptor.subarray(4), 16);
      record.setUint16(28, name.length, true);
      record.setUint32(38, entry.file ? 0 : 0x10, true);
      record.setUint32(42, start, true);
      directory.set(name, 46);
      central.push(directory);
    }
    const centralStart = offset;
    for (const record of central) await write(record);
    const end = new Uint8Array(22);
    const footer = new DataView(end.buffer);
    footer.setUint32(0, 0x06054b50, true);
    footer.setUint16(8, entries.length, true);
    footer.setUint16(10, entries.length, true);
    footer.setUint32(12, offset - centralStart, true);
    footer.setUint32(16, centralStart, true);
    await write(end);
    signal?.throwIfAborted();
    await sink.close();
    onProgress?.(loaded, loaded);
    return "saved";
  } catch (error) {
    await sink.abort?.();
    if (signal?.aborted || (error as { name?: string })?.name === "AbortError") return "cancelled";
    throw error;
  }
}
