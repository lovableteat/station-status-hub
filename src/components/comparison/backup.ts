import JSZip from "jszip";
import { isSafeRelativePath } from "./files.ts";
import { parseSessionSnapshot } from "./storage.ts";
import type { ComparisonSession } from "./types.ts";

const MiB = 1024 * 1024;
type ArchiveEntry = { size: number; crc: number };
const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

// Check central entries before JSZip normalizes paths, collapses duplicates or inflates data.
function inspectArchive(bytes: ArrayBuffer): Map<string, ArchiveEntry> {
  const view = new DataView(bytes);
  const raw = new Uint8Array(bytes);
  const fail = (message: string): never => { throw new Error(`備份 ZIP 無效：${message}`); };
  let end = -1;
  for (let offset = raw.length - 22; offset >= Math.max(0, raw.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === raw.length) { end = offset; break; }
  }
  if (end < 0) fail("找不到完整目錄");
  const count = view.getUint16(end + 10, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 0 || count > 1000) fail("檔案數不可超過 1000，且不支援分割 ZIP");
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (size === 0xffffffff || start === 0xffffffff || start + size !== end) fail("目錄邊界或 ZIP64 不受支援");
  const entries = new Map<string, ArchiveEntry>();
  const seen = new Set<string>();
  let offset = start;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail("目錄項目損壞");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if ((flags & 1) || ![0, 8].includes(method)) fail("不支援加密或此壓縮格式");
    if (compressed === 0xffffffff || expanded === 0xffffffff || local === 0xffffffff || view.getUint16(offset + 34, true)) fail("不支援 ZIP64 或分割項目");
    total += expanded;
    if (total > 256 * MiB) fail("解壓縮總量不可超過 256 MiB");
    if (offset + 46 + nameLength + extraLength + commentLength > end) fail("檔名邊界損壞");
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(raw.subarray(offset + 46, offset + 46 + nameLength)); }
    catch { fail("路徑編碼無效"); }
    const directory = name.endsWith("/");
    const path = directory ? name.slice(0, -1) : name;
    if (!isSafeRelativePath(path)) fail(`不安全的路徑：${name}`);
    if (seen.has(path.toLowerCase())) fail(`重複路徑：${name}`);
    seen.add(path.toLowerCase());
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50) fail("檔案項目邊界損壞");
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    if (local + 30 + localNameLength + localExtraLength + compressed > start) fail("壓縮資料超出邊界");
    if (localNameLength !== nameLength || !raw.subarray(local + 30, local + 30 + localNameLength).every((byte, index) => byte === raw[offset + 46 + index])) fail("檔案與目錄路徑不一致");
    if (directory) {
      if (name !== "reports/" || expanded !== 0) fail(`未知路徑：${name}`);
    } else entries.set(name, { size: expanded, crc: view.getUint32(offset + 16, true) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) fail("目錄長度不一致");
  return entries;
}

function readEntry(zip: JSZip, path: string, entry: ArchiveEntry): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const output = new Uint8Array(entry.size);
    const file = zip.file(path)! as JSZip.JSZipObject & { internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array> };
    const stream = file.internalStream("uint8array");
    let offset = 0;
    let crc = -1;
    stream.on("data", (chunk: Uint8Array) => {
      if (offset + chunk.byteLength > entry.size) {
        stream.pause();
        reject(new Error(`備份報表超出目錄宣告的大小：${path}`));
        return;
      }
      output.set(chunk, offset);
      offset += chunk.byteLength;
      for (const byte of chunk) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
    });
    stream.on("error", error => reject(new Error(`備份報表解壓縮失敗：${String(error)}`)));
    stream.on("end", () => {
      if (offset !== entry.size || ((crc ^ -1) >>> 0) !== entry.crc) { reject(new Error(`備份報表大小或校驗碼不符：${path}`)); return; }
      resolve(output.buffer);
    });
    stream.resume();
  });
}

export async function exportBackup(session: ComparisonSession): Promise<Blob> {
  const snapshot = parseSessionSnapshot(session);
  const zip = new JSZip();
  const artifacts = snapshot.result.artifacts.map((artifact, index) => {
    const extension = artifact.name.slice(artifact.name.lastIndexOf(".")).toLowerCase();
    const path = `reports/${index}${extension}`;
    zip.file(path, artifact.bytes, { createFolders: false });
    return { key: artifact.key, name: artifact.name, mime: artifact.mime, path };
  });
  const metadata = JSON.stringify({ ...snapshot, result: { ...snapshot.result, artifacts } });
  const metadataBytes = new TextEncoder().encode(metadata);
  if (metadataBytes.byteLength + snapshot.result.artifacts.reduce((sum, item) => sum + item.bytes.byteLength, 0) > 256 * MiB) throw new Error("備份解壓縮總量不可超過 256 MiB");
  zip.file("session.json", metadataBytes);
  const bytes = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  if (bytes.byteLength > 128 * MiB) throw new Error("備份 ZIP 不可超過 128 MiB");
  return new Blob([bytes], { type: "application/zip" });
}

export async function importBackup(file: File): Promise<ComparisonSession> {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 128 * MiB) throw new Error("備份 ZIP 必須小於或等於 128 MiB");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("備份 ZIP 讀取大小不符");
  const entries = inspectArchive(bytes);
  if (!entries.has("session.json")) throw new Error("備份缺少 session.json 工作階段資料");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new Error("備份 ZIP 損壞或解壓縮失敗"); }
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (!entries.has(name) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== name)) throw new Error("備份 ZIP 路徑與目錄不一致");
  }
  let snapshot: unknown;
  const metadataBytes = await readEntry(zip, "session.json", entries.get("session.json")!);
  try { snapshot = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes)); }
  catch { throw new Error("備份工作階段 JSON 損壞"); }
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) throw new Error("工作階段資料無效：備份結構");
  const data = snapshot as Record<string, unknown>;
  const result = data.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) throw new Error("工作階段資料無效：比對結果");
  const record = result as Record<string, unknown>;
  if (!Array.isArray(record.artifacts) || record.artifacts.length > 999) throw new Error("備份報表清單無效");
  const expected = new Set<string>(["session.json"]);
  const artifacts = [];
  for (const item of record.artifacts) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("備份報表結構無效");
    const artifact = item as Record<string, unknown>;
    const path = artifact.path;
    if (!isSafeRelativePath(path) || !path.startsWith("reports/") || path.split("/").length !== 2) throw new Error("備份報表路徑無效");
    if (Object.keys(artifact).length !== 4 || !["key", "name", "mime", "path"].every(key => Object.prototype.hasOwnProperty.call(artifact, key))) throw new Error("備份報表包含未知或缺少的欄位");
    if (expected.has(path.toLowerCase())) throw new Error("備份報表路徑重複");
    expected.add(path.toLowerCase());
    if (!entries.has(path) || !zip.file(path)) throw new Error(`備份缺少報表：${path}`);
    const buffer = await readEntry(zip, path, entries.get(path)!);
    artifacts.push({ key: artifact.key, name: artifact.name, mime: artifact.mime, bytes: buffer });
  }
  if (entries.size !== expected.size || [...entries.keys()].some(path => !expected.has(path.toLowerCase()))) throw new Error("備份包含未登記的報表檔案");
  return parseSessionSnapshot({ ...data, result: { ...record, artifacts } });
}
