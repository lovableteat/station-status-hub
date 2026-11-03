import SevenZip from "7z-wasm";
import JSZip from "jszip";
export const SPEC_READER_MAX_BYTES = 50 * 1024 * 1024;
export const SPEC_ARCHIVE_MAX_BYTES = 100 * 1024 * 1024;
export interface SpecDecodedChild { name: string; bytes: Uint8Array }
export interface SpecDecodedContent { text: string; status: "read" | "partial" | "unread"; method: string; note?: string; children?: SpecDecodedChild[] }

export function validateMaterialSpecArchiveEntries(entries: Array<{ name: string; size: number; encrypted?: boolean; link?: boolean }>) {
  if (entries.length > 500) throw new Error("壓縮檔超過 500 項，本次未展開，請指定較小範圍。");
  let size = 0;
  for (const entry of entries) {
    // eslint-disable-next-line no-control-regex -- Archive paths must not contain control bytes.
    if (/^(?:[\\/]|[a-z]:)/i.test(entry.name) || /[\x00-\x1f]/.test(entry.name) || entry.name.split(/[\\/]/).includes("..") || entry.link) throw new Error(`不安全的壓縮檔路徑：${entry.name}`);
    if (entry.encrypted) throw new Error(`加密附件無法自動讀取：${entry.name}`);
    size += entry.size;
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || size > SPEC_ARCHIVE_MAX_BYTES) throw new Error("解壓後超過 100 MB 安全容量，本次未展開。");
  }
}

/** Only MEMFS is used. Never mount NODEFS or execute an extracted file. */
export async function extractMaterialSpecArchive(bytes: Uint8Array, wasmBinary: ArrayBuffer): Promise<SpecDecodedChild[]> {
  let output: string[] = [];
  const engine = await SevenZip({ wasmBinary, print: line => output.push(line), printErr: line => output.push(line), stdin: () => -1 });
  engine.FS.writeFile("/input.archive", bytes);
  const listingCode = engine.callMain(["l", "-slt", "-ba", "-bd", "/input.archive"]);
  if (Number(listingCode)) throw new Error("壓縮檔損壞、加密或為未提供完整的分卷。");
  const entries = output.join("\n").split(/\r?\n\s*\r?\n/).flatMap(block => {
    const name = block.match(/^Path = (.*)$/m)?.[1].replace(/\r$/, "");
    const size = block.match(/^Size = (\d+)$/m)?.[1];
    if (!name || size === undefined || /^Folder = \+/m.test(block)) return [];
    return [{ name, size: Number(size), encrypted: /^Encrypted = \+/m.test(block), link: /^(?:Symbolic Link|Hard Link) = \S/m.test(block) }];
  });
  validateMaterialSpecArchiveEntries(entries);
  if (!entries.length) throw new Error("壓縮檔沒有可讀取的檔案或目錄已加密。");
  output = [];
  engine.FS.mkdir("/output");
  const extractCode = engine.callMain(["x", "/input.archive", "-o/output", "-y", "-bd", "-bb0"]);
  if (Number(extractCode)) throw new Error("壓縮檔未能完整解開，未將部分資料視為成功。");
  let size = 0;
  return entries.map(entry => {
    const path = `/output/${entry.name.replaceAll("\\", "/")}`;
    if (!engine.FS.isFile(engine.FS.lstat(path).mode)) throw new Error(`不是一般檔案：${entry.name}`);
    const data = engine.FS.readFile(path) as Uint8Array;
    if (data.length !== entry.size || (size += data.length) > SPEC_ARCHIVE_MAX_BYTES) throw new Error("解壓內容或容量不符，未使用不完整檔案。");
    return { name: entry.name, bytes: new Uint8Array(data) };
  });
}

export function boundedSpecText(text: string, method: string, note = ""): SpecDecodedContent {
  const truncated = text.length > 1500000;
  return { text: text.slice(0, 1500000), status: truncated ? "partial" : "read", method, note: [note, truncated ? "文字超過 150 萬字元，僅解析前段，不能視為全文。" : ""].filter(Boolean).join(" ") };
}

function xmlText(text: string) {
  return text.replace(/<\/(?:[\w]+:)?(?:p|tr|row|text:p|h)>/g, "\n").replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[\da-f]+|\d+);/gi, entity => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (named[entity]) return named[entity];
    const point = entity.startsWith("&#x") ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
  }).replace(/[ \t]+/g, " ");
}

export async function readMaterialSpecOffice(name: string, bytes: Uint8Array): Promise<SpecDecodedContent> {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b ? await JSZip.loadAsync(bytes) : null;
  const files = zip ? Object.values(zip.files).filter(file => !file.dir) : [];
  // Inspect declared expansion sizes before any XML, media or workbook is inflated.
  validateMaterialSpecArchiveEntries(files.map(file => ({ name: file.name, size: (file as unknown as { _data: { uncompressedSize: number } })._data?.uncompressedSize ?? SPEC_ARCHIVE_MAX_BYTES + 1 })));
  const children: SpecDecodedChild[] = [];
  for (const file of files) if (/\/(?:media|embeddings)\//.test(file.name) || /^Pictures\//.test(file.name)) children.push({ name: file.name, bytes: await file.async("uint8array") });
  if (/\.(xlsx?|xlsm|xlsb|ods)$/i.test(name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false });
    return { ...boundedSpecText(workbook.SheetNames.map(sheet => `工作表：${sheet}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])}`).join("\n\n"), "試算表文字／數值", "未執行巨集或公式；內嵌媒體另列，舊版二進位試算表圖片需另行核對。"), children };
  }
  if (!zip) throw new Error("Office／OpenDocument 封裝無效。");
  const blocks: string[] = [];
  for (const file of files) {
    if (/^(?:word\/(?:document|footnotes|endnotes|comments|header\d*|footer\d*)\.xml|ppt\/(?:slides|notesSlides)\/.*\.xml|content\.xml)$/i.test(file.name)) blocks.push(`${file.name}\n${xmlText(await file.async("string"))}`);
  }
  return { ...boundedSpecText(blocks.join("\n\n"), "Office／OpenDocument 文字", "文字與內嵌媒體分開處理，未執行巨集。"), children };
}

export function readMaterialSpecText(name: string, bytes: Uint8Array): SpecDecodedContent {
  let text = "", binary = false;
  try {
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex -- Control bytes distinguish binary files from readable text.
    binary = (text.match(/[\x00-\x08\x0e-\x1f]/g)?.length ?? 0) > Math.max(1, text.length * .01);
  } catch { binary = true; }
  if (!binary) return boundedSpecText(text, "文字／XML／工程文字");
  const fragments = new TextDecoder().decode(bytes).match(/[\x20-\x7e\u4e00-\u9fff]{5,}/g) ?? [];
  return { text: fragments.join("\n").slice(0, 200000), status: fragments.length ? "partial" : "unread", method: "原生二進位格式", note: `${name} 尚無此原生格式的完整轉換器；${fragments.length ? "僅讀出可辨識文字，不含完整幾何、圖面或參數" : "未能讀出內容"}。不能把此檔案視為已完整判讀。` };
}
