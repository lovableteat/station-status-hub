import type { SpecDecodedContent } from "./materialSpecDocumentCore";
import { SPEC_READER_MAX_BYTES } from "./materialSpecDocumentCore";
export interface MaterialSpecDecoded extends SpecDecodedContent { native?: Array<{ name: string; blob: Blob; mimeType: string }> }

function readInWorker(name: string, bytes: ArrayBuffer, signal: AbortSignal): Promise<SpecDecodedContent> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./materialSpecDocument.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { finish(); reject(new DOMException("附件讀取已停止", "AbortError")); };
    const timer = setTimeout(() => { finish(); reject(new Error("附件解析超過 60 秒，未視為已讀。")); }, 60000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { finish(); reject(new Error("附件解析器無法執行，未視為已讀。")); };
    worker.postMessage({ name, bytes }, [bytes]);
  });
}

export async function readMaterialSpecDocument(name: string, blob: Blob, signal: AbortSignal): Promise<MaterialSpecDecoded> {
  signal.throwIfAborted();
  if (!blob.size || blob.size > SPEC_READER_MAX_BYTES) throw new Error("檔案為空或超過單檔 50 MB 解析容量。");
  if (/\.pdf$/i.test(name)) {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: true, stopAtErrors: true });
    const abort = () => { void task.destroy(); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise;
      let text = "", empty = 0, pages = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        signal.throwIfAborted();
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map(item => "str" in item ? item.str : "").join(" ");
        text += `\n第 ${i} 頁\n${line}\n`; pages++;
        if (line.trim().length < 12) empty++;
        page.cleanup();
        if (text.length > 1500000) break;
      }
      return { text: text.slice(0, 1500000), status: "partial", method: "PDF 逐頁文字", note: `文字解析 ${pages}／${pdf.numPages} 頁；${empty} 頁缺少可搜尋文字。另將原 PDF 交給 AI 核對圖表／掃描內容，須核對原檔。`, native: [{ name, blob, mimeType: "application/pdf" }] };
    } finally { signal.removeEventListener("abort", abort); await task.destroy(); }
  }
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) {
    const image = await createImageBitmap(blob);
    try {
      if (image.width * image.height > 25000000) throw new Error("圖片超過 2500 萬像素解析容量。");
      const canvas = new OffscreenCanvas(image.width, image.height);
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      const png = await canvas.convertToBlob({ type: "image/png" });
      return { text: "", status: "partial", method: "圖像（待 AI 判讀）", note: /\.gif$/i.test(name) ? "GIF 只判讀靜態畫面，動畫其餘影格未解析。" : "圖中文字與圖形由所選 AI 判讀，須核對原檔。", native: [{ name, blob: png, mimeType: "image/png" }] };
    } finally { image.close(); }
  }
  return readInWorker(name, await blob.arrayBuffer(), signal);
}
