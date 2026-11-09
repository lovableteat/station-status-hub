import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { circuitCropOutputSize, type CircuitCropRect } from "./circuitPdf";
import type { CircuitPdfInkStroke } from "./circuitPdfInk";

/** Fonts, CMaps and wasm come from this site's own assets, so opening a PDF never sends it or asks another service for anything. */
export async function openCircuitPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const [pdfjs, resources, { default: workerSrc }] = await Promise.all([import("pdfjs-dist"), import("../comparison/pdfResources"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // pdf.js takes ownership of the buffer it is given; a copy keeps the cached bytes usable for the next opening.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false, useSystemFonts: false, useWorkerFetch: false,
    CMapReaderFactory: resources.LocalCMapReaderFactory, StandardFontDataFactory: resources.LocalStandardFontDataFactory, WasmFactory: resources.LocalWasmFactory });
  try { return await task.promise; }
  catch (error) {
    void task.destroy().catch(() => {});
    const name = (error as { name?: string })?.name;
    throw new Error(name === "PasswordException" ? "這份 PDF 有密碼保護，請改用未加密的 PDF。" : "這份 PDF 無法開啟，檔案可能已損壞。");
  }
}

export async function isPdfFile(file: File) {
  if (!file.size) return false;
  return /%PDF-\d\.\d/.test(new TextDecoder("ascii").decode(await file.slice(0, 1024).arrayBuffer()));
}

/** Page size in PDF points (1/72 inch), rotation applied. */
export async function circuitPdfPageSize(pdf: PDFDocumentProxy, pageNumber: number) {
  const viewport = (await pdf.getPage(pageNumber)).getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}

/**
 * Draws one page at `scale` CSS pixels per point. The canvas is sharpened for the screen's pixel ratio, within a pixel budget
 * so a large sheet zoomed in cannot exceed what the browser can allocate. Rendering is cancelled when `signal` aborts.
 */
export async function renderCircuitPdfPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, scale: number, signal?: AbortSignal) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const budget = 24_000_000, ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / Math.max(1, viewport.width * viewport.height)), 3);
  const width = Math.max(1, Math.floor(viewport.width * ratio)), height = Math.max(1, Math.floor(viewport.height * ratio));
  // Drawn off screen first, so the page on screen is replaced in one step instead of flashing white.
  const buffer = document.createElement("canvas");
  buffer.width = width; buffer.height = height;
  const task: RenderTask = page.render({ canvas: buffer, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try { await task.promise; }
  finally { signal?.removeEventListener("abort", cancel); }
  if (signal?.aborted) return null;
  canvas.width = width; canvas.height = height;
  canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
  canvas.getContext("2d")?.drawImage(buffer, 0, 0);
  return { width: viewport.width, height: viewport.height };
}

/** Renders only the cropped area, from the PDF itself rather than the screen, so the picture stays sharp at any zoom. */
export async function cropCircuitPdfPage(pdf: PDFDocumentProxy, pageNumber: number, rect: CircuitCropRect, longEdge = 2400, strokes: CircuitPdfInkStroke[] = []): Promise<{ blob: Blob; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const output = circuitCropOutputSize(base.width, base.height, rect, longEdge);
  const viewport = page.getViewport({ scale: output.scale });
  const canvas = document.createElement("canvas");
  canvas.width = output.width; canvas.height = output.height;
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -rect.x * viewport.width, -rect.y * viewport.height] }).promise;
  const context = canvas.getContext("2d");
  if (context) for (const stroke of strokes) {
    if (stroke.removedAt || !stroke.points.length) continue;
    context.strokeStyle = stroke.color; context.fillStyle = stroke.color; context.lineWidth = stroke.width * viewport.width; context.lineCap = "round"; context.lineJoin = "round";
    const points = stroke.points.map(point => ({ x: (point.x - rect.x) * viewport.width, y: (point.y - rect.y) * viewport.height }));
    context.beginPath();
    if (points.every(point => point.x === points[0].x && point.y === points[0].y)) {
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
    } else { context.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) context.lineTo(point.x, point.y); context.stroke(); }
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("截圖建立失敗，請重試。");
  return { blob, width: output.width, height: output.height };
}
