import { createExtractorFromData, type FileHeader } from "node-unrar-js";
import type { ImportedStepModel } from "../data-center/dataCenterTypes";

export function validateSpecFillArchive(headers: Pick<FileHeader, "name" | "unpSize" | "flags">[]) {
  if (headers.length > 100) throw new Error("RAR 內超過 100 個檔案，請選擇較小的 SPEC 壓縮檔。");
  let total = 0;
  for (const header of headers) {
    if (/^(?:[\\/]|[a-z]:)/i.test(header.name) || header.name.split(/[\\/]/).includes("..")) throw new Error(`RAR 檔案路徑不安全：${header.name}`);
    if (header.flags.encrypted) throw new Error(`RAR 含加密檔案：${header.name}，請提供未加密版本。`);
    total += header.unpSize;
    if (!Number.isSafeInteger(header.unpSize) || header.unpSize < 0 || total > 18 * 1024 * 1024) throw new Error("RAR 解壓後超過 18 MB 分析容量，請改選相關文件。");
  }
}

export async function extractSpecFillRar(data: ArrayBuffer, wasmBinary: ArrayBuffer) {
  try {
    const extractor = await createExtractorFromData({ data, wasmBinary });
    const list = extractor.getFileList();
    const headers = [];
    for (const header of list.fileHeaders) { headers.push(header); if (headers.length > 100) throw new Error("RAR 內超過 100 個檔案。"); }
    if (list.arcHeader.flags.volume || list.arcHeader.flags.headerEncrypted) throw new Error("RAR 為分卷或加密壓縮檔，請提供完整、未加密版本。");
    validateSpecFillArchive(headers);
    const result = [];
    let total = 0;
    for (const file of extractor.extract().files) {
      if (file.fileHeader.flags.directory) continue;
      const bytes = file.extraction;
      if (!bytes || bytes.length !== file.fileHeader.unpSize || (total += bytes.length) > 18 * 1024 * 1024) throw new Error("RAR 解壓資料不完整或超過容量。");
      result.push({ name: file.fileHeader.name, bytes });
    }
    return result;
  } catch (error) { throw new Error(`RAR 無法讀取：${error instanceof Error ? error.message : "檔案損壞或格式不支援"}`); }
}

export function summarizeSpecFillStep(name: string, model: Pick<ImportedStepModel, "bounds" | "parts">, text: string) {
  const spans = model.bounds.max.map((value, axis) => Number((value - model.bounds.min[axis]).toPrecision(8)));
  if (!spans.every(value => Number.isFinite(value) && value > 0)) throw new Error("STEP 模型尺寸無效。");
  const metadata = text.split(/;\s*/).filter(line => /(?:FILE_(?:NAME|DESCRIPTION|SCHEMA)|=\s*(?:PRODUCT|DESCRIPTIVE_REPRESENTATION_ITEM|MEASURE_REPRESENTATION_ITEM)\s*\()/i.test(line)).slice(0, 100).join(";\n").slice(0, 40000);
  return `STEP 幾何解析：${name}\n頁碼／定位：模型\nOpenCascade 網格外框（原始 X/Y/Z 軸，單位 mm）：X=${spans[0]} mm；Y=${spans[1]} mm；Z=${spans[2]} mm\n模型網格數：${model.parts.length}\n模型名稱：${model.parts.slice(0, 100).map(part => part.name).join("、")}\n注意：這是整個模型（可能包含接腳）的近似外框，不是工程圖標註尺寸、公差、接腳長度或安裝深度。不得將網格數當接腳數。電氣規格、材質與額定值必須另有明文證據，不可由外形推測。原始檔單位已由解析器轉成 mm。\n以下僅擷取最多 100 筆／40000 字元的 STEP 識別與屬性文字，不是完整電氣規格：\n${metadata}`;
}
