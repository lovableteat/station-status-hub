export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function isPdfFile(file: { name: string; type: string }) {
  return /\.pdf$/i.test(file.name.trim()) || /^(application\/pdf|application\/x-pdf)$/i.test(file.type);
}

// Windows browsers may supply an empty MIME type or application/octet-stream.
// Check the bytes before assigning the PDF type; a renamed file is not a PDF.
export async function validatePdfFile(file: File) {
  if (!isPdfFile(file)) return;
  if (!file.size) throw new Error(`${file.name} 是空白檔案，請重新選擇 PDF。`);
  if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} 超過 PDF 的 50MB 上限，請分割或壓縮後上傳。`);
  const header = new TextDecoder('ascii').decode(await file.slice(0, 1024).arrayBuffer());
  if (!/%PDF-\d\.\d/.test(header)) throw new Error(`${file.name} 不是有效的 PDF，請重新匯出為 PDF 後上傳。`);
}
