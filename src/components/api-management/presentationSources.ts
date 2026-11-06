import type { UploadedAttachment } from "./aiConversationAttachments";
import { bytesToBase64 } from "./pptxAttachment";
import { isPdfFile, validatePdfFile } from "./pdfAttachment";

export const PRESENTATION_MAX_FILES = 12;
export const PRESENTATION_MAX_FILE_BYTES = 24 * 1024 * 1024;
export const PRESENTATION_MAX_TEXT = 120_000;
export const PRESENTATION_FILE_ACCEPT = ".pdf,.docx,.xls,.xlsx,.csv,.tsv,.txt,.md,.pptx,.png,.jpg,.jpeg,.webp,.gif";
const OFFICE_FILE = /\.(docx|xlsx?|pptx)$/i;
const TEXT_FILE = /\.(csv|tsv|txt|md)$/i;
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

function presentationImageMime(file: File) {
  return Object.values(IMAGE_MIME_TYPES).includes(file.type)
    ? file.type
    : IMAGE_MIME_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
}

export function isPresentationSource(file: File) {
  return isPdfFile(file) || Boolean(presentationImageMime(file)) || OFFICE_FILE.test(file.name) || TEXT_FILE.test(file.name);
}

export async function preparePresentationSources(files: readonly File[], pastedText: string) {
  const sourceNames: string[] = [];
  const excerpts: { sourceId: number; text: string }[] = [];
  const attachments: UploadedAttachment[] = [];
  let textLength = pastedText.length;

  for (const file of files) {
    try {
      sourceNames.push(file.name);
      const id = String(sourceNames.length);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = isPdfFile(file) ? "application/pdf" : presentationImageMime(file);
      if (mime) {
        await validatePdfFile(file);
        attachments.push({ id, name: file.name, kind: mime.startsWith("image/") ? "image" : "file", size: file.size, mimeType: mime, inlineData: bytesToBase64(bytes) });
      } else {
        const { readMaterialSpecOffice, readMaterialSpecText } = await import("./materialSpecDocumentCore");
        const decoded = OFFICE_FILE.test(file.name)
          ? await readMaterialSpecOffice(file.name, bytes, false)
          : readMaterialSpecText(file.name, bytes);
        if (decoded.status !== "read" || !decoded.text.trim() || (OFFICE_FILE.test(file.name) && !decoded.text.replace(/^\S+\.(xml|rels)$/gm, "").trim())) {
          throw new Error("無法完整讀取文字。可另存為 PDF 或 UTF-8 文字後再試。");
        }
        textLength += decoded.text.length;
        if (textLength > PRESENTATION_MAX_TEXT) {
          throw new Error("合計文字超過 12 萬字，請縮小工作表或資料範圍。");
        }
        excerpts.push({ sourceId: sourceNames.length, text: decoded.text });
      }
    } catch (error) {
      throw new Error(`${file.name}：${error instanceof Error ? error.message : "無法讀取附件。"}`);
    }
  }

  if (pastedText) {
    sourceNames.push("使用者貼上的資料");
    excerpts.push({ sourceId: sourceNames.length, text: pastedText });
  }
  return { sourceNames, excerpts, attachments };
}
