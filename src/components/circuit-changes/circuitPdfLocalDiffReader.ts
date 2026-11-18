/**
 * Reads two PDF pages for 本機比對: their strings with positions, and both drawings at the same pixel size. Everything
 * happens in the browser; nothing is uploaded. The comparison itself is in circuitPdfLocalDiff.ts.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CircuitCropRect } from "./circuitPdf";
import { circuitTextChangeBoxes, diffCircuitInkMasks, diffCircuitPageTexts, type CircuitDiffText, type CircuitLocalPageDiff } from "./circuitPdfLocalDiff";

export interface CircuitDiffPageSource { pdf: PDFDocumentProxy; page: number }
/**
 * Pixels per PDF point of the drawings laid over each other, so a junction dot (about 3.6 pt) is five pixels wide on any
 * sheet size; very large sheets are held to LONG_EDGE_MAX so the comparison still fits in memory.
 */
const DENSITY = 1.5, LONG_EDGE_MAX = 3600;

/** The strings of one page with their boxes as fractions of the page, rotation included. */
export async function readCircuitPageTexts({ pdf, page: pageNumber }: CircuitDiffPageSource, signal?: AbortSignal): Promise<CircuitDiffText[]> {
  signal?.throwIfAborted();
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  signal?.throwIfAborted();
  const items: CircuitDiffText[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    const along = Math.hypot(a, b), up = Math.hypot(c, d);
    if (!along || !up) continue;
    const ux = a / along * item.width, uy = b / along * item.width, vx = c / up * item.height, vy = d / up * item.height;
    const corners = [[e, f], [e + ux, f + uy], [e + vx, f + vy], [e + ux + vx, f + uy + vy]].map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    items.push({ str: item.str, x: left / viewport.width, y: top / viewport.height, width: (Math.max(...xs) - left) / viewport.width, height: (Math.max(...ys) - top) / viewport.height });
  }
  return items;
}

/** One page drawn `width` × `height` pixels on white: 1 where there is ink. */
async function inkMask({ pdf, page: pageNumber }: CircuitDiffPageSource, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  try {
    const task = page.render({ canvas, viewport }), cancel = () => task.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try { await task.promise; } finally { signal?.removeEventListener("abort", cancel); }
    signal?.throwIfAborted();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立比對用的圖面。");
    const pixels = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let index = 0, offset = 0; index < mask.length; index++, offset += 4) {
      // Anything clearly darker than paper counts, coloured lines included.
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 690) mask[index] = 1;
    }
    return mask;
  } finally { canvas.width = canvas.height = 0; }
}

/** 本機比對 of one page pair: text matched string by string, drawings laid over each other. */
export async function compareCircuitPdfPages(base: CircuitDiffPageSource, work: CircuitDiffPageSource, signal?: AbortSignal): Promise<CircuitLocalPageDiff> {
  signal?.throwIfAborted();
  const [basePage, workPage] = await Promise.all([base.pdf.getPage(base.page), work.pdf.getPage(work.page)]);
  try {
    const baseSize = basePage.getViewport({ scale: 1 }), workSize = workPage.getViewport({ scale: 1 });
    const [baseTexts, workTexts] = await Promise.all([readCircuitPageTexts(base, signal), readCircuitPageTexts(work, signal)]);
    const textComparable = baseTexts.length > 0 && workTexts.length > 0;
    // One version with text and the other without is itself a difference of the whole page, found by the drawings.
    const { changes, shift } = textComparable ? diffCircuitPageTexts(baseTexts, workTexts) : { changes: [], shift: { dx: 0, dy: 0 } };
    const sameShape = Math.abs(baseSize.width / baseSize.height - workSize.width / workSize.height) <= 0.015;
    if (!sameShape) return { textComparable, graphicsComparable: false, textChanges: changes, regions: [], sizeChanged: true };
    const longEdge = Math.min(LONG_EDGE_MAX, Math.max(baseSize.width, baseSize.height) * DENSITY), scale = longEdge / Math.max(baseSize.width, baseSize.height);
    const width = Math.max(1, Math.round(baseSize.width * scale)), height = Math.max(1, Math.round(baseSize.height * scale));
    const offset = { dx: Math.round(shift.dx * width), dy: Math.round(shift.dy * height) }, ignore = circuitTextChangeBoxes(changes);
    const lay = async () => {
      // One page after the other: two drawings under way at once now and then came out a few pixels different.
      const baseMask = await inkMask(base, width, height, signal), workMask = await inkMask(work, width, height, signal);
      signal?.throwIfAborted();
      return diffCircuitInkMasks(baseMask, workMask, width, height, offset, ignore);
    };
    let regions = await lay();
    if (regions.length) {
      // A difference is only reported when a second drawing of both pages shows it again in the same place: a real
      // difference always does, a drawing glitch does not. (The opposite cannot happen: a glitch never makes two
      // different sheets pixel for pixel the same.)
      const again = await lay();
      const near = (a: CircuitCropRect, b: CircuitCropRect) => a.x <= b.x + b.width + 0.01 && b.x <= a.x + a.width + 0.01 && a.y <= b.y + b.height + 0.01 && b.y <= a.y + a.height + 0.01;
      regions = again.filter(region => regions.some(first => near(region.box, first.box)));
    }
    return { textComparable, graphicsComparable: true, textChanges: changes, regions, sizeChanged: false };
  } finally {
    // Release what the pages keep after drawing, or a few hundred sheets stay in memory.
    basePage.cleanup(); workPage.cleanup();
  }
}
