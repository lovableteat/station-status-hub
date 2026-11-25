/**
 * Reads two PDF pages for 本機比對: their strings with positions, and both drawings at the same pixel size. Everything
 * happens in the browser; nothing is uploaded. The comparison itself is in circuitPdfLocalDiff.ts.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CircuitCropRect } from "./circuitPdf";
import {
  circuitInkDifferenceShare, circuitTextChangeBoxes, diffCircuitInkMasks, diffCircuitPageContents, diffCircuitPageTexts, findCircuitTitleBlock, isCircuitLayoutRedrawn, matchCircuitPartValues, REDRAW_STYLE_SHARE,
  type CircuitDiffText, type CircuitGraphicRegion, type CircuitLocalPageDiff,
} from "./circuitPdfLocalDiff";

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

/** Clearly darker than paper (coloured lines included), and whether that ink is coloured rather than grey or black. */
const dark = (pixels: Uint8ClampedArray, offset: number) => pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 690;
const coloured = (pixels: Uint8ClampedArray, offset: number) => Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) - Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 60;

/** One page drawn `width` × `height` pixels on white: 1 where there is ink. `stats` learns how much of the ink is coloured. */
async function inkMask({ pdf, page: pageNumber }: CircuitDiffPageSource, width: number, height: number, signal?: AbortSignal, stats?: { ink: number; coloured: number }): Promise<Uint8Array> {
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
      if (!dark(pixels, offset)) continue;
      mask[index] = 1;
      if (stats) { stats.ink++; if (coloured(pixels, offset)) stats.coloured++; }
    }
    return mask;
  } finally { canvas.width = canvas.height = 0; }
}

/** Part of a page (`box` in fractions of the page) drawn at `scale` pixels per point: 0 paper, 1 grey ink, 2 coloured ink. */
async function regionInk({ pdf, page: pageNumber }: CircuitDiffPageSource, box: CircuitCropRect, scale: number, signal?: AbortSignal) {
  const page = await pdf.getPage(pageNumber);
  const size = page.getViewport({ scale: 1 });
  const width = Math.max(1, Math.round(box.width * size.width * scale)), height = Math.max(1, Math.round(box.height * size.height * scale));
  const viewport = page.getViewport({ scale, offsetX: -box.x * size.width * scale, offsetY: -box.y * size.height * scale });
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立比對用的圖面。");
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
    const task = page.render({ canvas, viewport }), cancel = () => task.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try { await task.promise; } finally { signal?.removeEventListener("abort", cancel); }
    signal?.throwIfAborted();
    const pixels = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let index = 0, offset = 0; index < mask.length; index++, offset += 4) if (dark(pixels, offset)) mask[index] = coloured(pixels, offset) ? 2 : 1;
    return { mask, width, height };
  } finally { canvas.width = canvas.height = 0; }
}

/**
 * Ink the work crop and the base have that the other lacks within `reach` pixels, under every alignment given. The base is
 * drawn larger (`margin` pixels on each side) so it can be laid at any of the `alignments`: the work pixel (x, y) is
 * the base pixel (x - dx, y - dy). A pixel any alignment explains is not a difference (the content moved, the frame
 * stayed). Base ink counts where the first alignment puts it inside the crop.
 */
export function cropDifference(base: Uint8Array, baseWidth: number, margin: number, work: Uint8Array, width: number, height: number, reach: number, alignments: ReadonlyArray<{ dx: number; dy: number }>, skip?: Uint8Array) {
  const baseHeight = base.length / baseWidth;
  const baseAt = (x: number, y: number) => { const bx = x + margin, by = y + margin; return bx >= 0 && by >= 0 && bx < baseWidth && by < baseHeight ? base[by * baseWidth + bx] : 0; };
  const workAt = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height ? work[y * width + x] : 0;
  const near = (at: (x: number, y: number) => number, x: number, y: number) => { for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (at(x + dx, y + dy)) return true; return false; };
  const unmatched = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (skip?.[index]) continue;
    if (work[index] && !alignments.some(({ dx, dy }) => near(baseAt, x - dx, y - dy))) { unmatched[index] = 1; count++; continue; }
    // The base pixel the first alignment lays here: missing from the work wherever an alignment would put it.
    const first = alignments[0], bx = x - first.dx, by = y - first.dy;
    if (baseAt(bx, by) && !alignments.some(({ dx, dy }) => near(workAt, bx + dx, by + dy))) { unmatched[index] = 1; count++; }
  }
  return { count, unmatched };
}

/**
 * The offset (within `range` pixels) that lays the most of the work ink still unexplained (`left`) on base ink: where this
 * part of the drawing moved to (what did not move must not outvote it, such as a large title beside a moved border).
 */
export function bestAlignment(base: Uint8Array, baseWidth: number, margin: number, work: Uint8Array, width: number, height: number, range: number, left: Uint8Array) {
  const baseHeight = base.length / baseWidth;
  let best = { dx: 0, dy: 0 }, bestHits = -1;
  for (let dy = -range; dy <= range; dy += 2) for (let dx = -range; dx <= range; dx += 2) {
    let hits = 0;
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (!work[y * width + x] || !left[y * width + x]) continue;
      const bx = x - dx + margin, by = y - dy + margin;
      if (bx >= 0 && by >= 0 && bx < baseWidth && by < baseHeight && base[by * baseWidth + bx]) hits++;
    }
    if (hits > bestHits) { bestHits = hits; best = { dx, dy }; }
  }
  return best;
}

/**
 * A box drawn around what is already there (2026-11-25, the real E1.S pair: dashed boxes around a connector, a ground
 * table, a schematic): every pixel that differs lies on the four sides of one rectangle and nothing inside it differs.
 * A new part brings its pins and text along, so it never looks like this.
 */
export function onlyAnOutline(unmatched: Uint8Array, width: number, height: number) {
  let minX = width, minY = height, maxX = -1, maxY = -1, total = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (unmatched[y * width + x]) { total++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
  if (total < 40 || boxWidth < 60 || boxHeight < 60) return false;
  // The sides are as thick as the line someone drew (a thick dashed line is a dozen pixels at six pixels per point).
  const band = Math.max(6, Math.round(Math.min(boxWidth, boxHeight) * 0.035)), sides = [0, 0, 0, 0];
  let edge = 0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!unmatched[y * width + x]) continue;
    const left = x - minX < band, right = maxX - x < band, top = y - minY < band, bottom = maxY - y < band;
    if (left || right || top || bottom) edge++;
    if (left) sides[0]++; if (right) sides[1]++; if (top) sides[2]++; if (bottom) sides[3]++;
  }
  return edge >= total * 0.9 && sides.filter(count => count >= total * 0.05).length >= 3;
}

/**
 * Dashed lines someone drew (2026-11-25, the real E1.S pair: dashed boxes around four connectors stacked in one column):
 * nearly every differing pixel lies on a horizontal or vertical line broken into dashes. A wire is solid, so a new wire
 * never passes for this; text and symbols are not straight lines.
 */
export function onlyDashedLines(unmatched: Uint8Array, width: number, height: number) {
  const rowLine = new Uint8Array(height), columnLine = new Uint8Array(width);
  const dashed = (count: number, runs: number, first: number, last: number) => count >= 20 && runs >= 4 && count / (last - first + 1) <= 0.85;
  for (let y = 0; y < height; y++) {
    let count = 0, runs = 0, first = -1, last = -1, inRun = false;
    for (let x = 0; x < width; x++) { const on = unmatched[y * width + x] === 1; if (on) { count++; if (first < 0) first = x; last = x; if (!inRun) runs++; } inRun = on; }
    if (dashed(count, runs, first, last)) rowLine[y] = 1;
  }
  for (let x = 0; x < width; x++) {
    let count = 0, runs = 0, first = -1, last = -1, inRun = false;
    for (let y = 0; y < height; y++) { const on = unmatched[y * width + x] === 1; if (on) { count++; if (first < 0) first = y; last = y; if (!inRun) runs++; } inRun = on; }
    if (dashed(count, runs, first, last)) columnLine[x] = 1;
  }
  let total = 0, onLines = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (!unmatched[y * width + x]) continue; total++; if (rowLine[y] || columnLine[x]) onLines++; }
  return total >= 40 && onLines >= total * 0.85;
}

/** Pixels per point a difference is drawn again at, the largest crop edge, and fewer differing pixels than this are a speck. */
const CONFIRM_DENSITY = 6, CONFIRM_EDGE = 1800, CONFIRM_MIN = 12, CONFIRM_REGIONS = 80;
/** How far (points) a symbol may sit elsewhere and still be the same drawing: well under a pin pitch of 7.2 pt. */
const NUDGE_POINTS = 1.5;
/** The outermost band of the paper, where only the sheet border is drawn. */
const PAPER_EDGE = 0.015;
/**
 * Every difference drawn again, sharp (2026-11-25, the real E1.S pair: identical sheets 47–56 each showed one "line
 * differs" that was a speck of the coarse drawing; at 7000 px wide not one pixel differed). At six pixels per point a
 * junction dot is about 20 px across and a wire two points longer about 12 px, so both stay; a speck of the coarse
 * drawing does not. What stays is told apart: a box drawn around what is already there is a mark ("annotation"); the
 * sheet border, or what either alignment explains when the content moved against its frame, is the "frame".
 */
async function confirmRegions(base: CircuitDiffPageSource, work: CircuitDiffPageSource, regions: CircuitGraphicRegion[], shift: { dx: number; dy: number }, size: { width: number; height: number }, texts: readonly CircuitCropRect[], signal?: AbortSignal) {
  const kept: CircuitGraphicRegion[] = [];
  const moved = Boolean(shift.dx || shift.dy);
  for (const [index, region] of regions.entries()) {
    const { box: area } = region;
    if (area.x + area.width <= PAPER_EDGE || area.x >= 1 - PAPER_EDGE || area.y + area.height <= PAPER_EDGE || area.y >= 1 - PAPER_EDGE) { kept.push({ ...region, kind: "frame" }); continue; }
    if (index >= CONFIRM_REGIONS) { kept.push(region); continue; }
    const x = Math.max(0, area.x - 0.004), y = Math.max(0, area.y - 0.004);
    const box = { x, y, width: Math.min(1, area.x + area.width + 0.004) - x, height: Math.min(1, area.y + area.height + 0.004) - y };
    const scale = Math.max(2, Math.min(CONFIRM_DENSITY, CONFIRM_EDGE / (box.width * size.width), CONFIRM_EDGE / (box.height * size.height)));
    const reach = scale >= 4 ? 2 : 1;
    // The base is drawn with room around it so it can be laid where the content moved (and where the frame stayed).
    const content = { dx: Math.round(shift.dx * size.width * scale), dy: Math.round(shift.dy * size.height * scale) };
    const margin = Math.ceil(Math.max(Math.abs(content.dx), Math.abs(content.dy), moved ? 0.012 * Math.max(size.width, size.height) * scale : 0, NUDGE_POINTS * scale)) + reach + 2;
    const workInk = await regionInk(work, box, scale, signal);
    const pad = margin / scale;
    const baseInk = await regionInk(base, { x: box.x - pad / size.width, y: box.y - pad / size.height, width: box.width + 2 * pad / size.width, height: box.height + 2 * pad / size.height }, scale, signal);
    // The letters of strings already compared as text (rewritten, moved), on either side, are not lines.
    const skip = new Uint8Array(workInk.width * workInk.height);
    for (const text of texts) {
      const left = Math.max(0, Math.floor((text.x - box.x) * size.width * scale) - reach), top = Math.max(0, Math.floor((text.y - box.y) * size.height * scale) - reach);
      const right = Math.min(workInk.width, Math.ceil((text.x + text.width - box.x) * size.width * scale) + reach), bottom = Math.min(workInk.height, Math.ceil((text.y + text.height - box.y) * size.height * scale) + reach);
      for (let yy = top; yy < bottom; yy++) skip.fill(1, yy * workInk.width + left, Math.max(yy * workInk.width + left, yy * workInk.width + right));
    }
    const lay = (alignments: ReadonlyArray<{ dx: number; dy: number }>) => cropDifference(baseInk.mask, baseInk.width, margin, workInk.mask, workInk.width, workInk.height, reach, alignments, skip);
    const primary = lay([content]);
    if (primary.count < CONFIRM_MIN) continue; // a speck of the coarse drawing: gone when drawn sharp
    let difference = primary;
    if (moved) {
      // The content moved against its frame: what the frame (not moved) explains is the frame. Near the paper's edge, where
      // the frame and the content's own border are, a part that moved a little on its own is tried as well.
      const alignments = [content, { dx: 0, dy: 0 }];
      difference = lay(alignments);
      const edge = Math.min(area.x, area.y, 1 - area.x - area.width, 1 - area.y - area.height) < 0.12;
      if (edge && difference.count >= CONFIRM_MIN) difference = lay([...alignments, bestAlignment(baseInk.mask, baseInk.width, margin, workInk.mask, workInk.width, workInk.height, Math.floor(margin - reach - 2), difference.unmatched)]);
      if (difference.count < CONFIRM_MIN) { kept.push({ ...region, kind: "frame" }); continue; }
    }
    const mark = onlyAnOutline(difference.unmatched, workInk.width, workInk.height) || onlyDashedLines(difference.unmatched, workInk.width, workInk.height);
    if (mark) { kept.push({ ...region, kind: "annotation" }); continue; }
    // The same symbol or line a little off (a library symbol placed 1–2 px elsewhere): one small offset explains every
    // pixel left. Less than a quarter of a pin pitch (7.2 pt), so it cannot reach another pin (2026-11-25, the real E1.S
    // pair: capacitor symbols beside each connector).
    const nudge = bestAlignment(baseInk.mask, baseInk.width, margin, workInk.mask, workInk.width, workInk.height, Math.min(Math.floor(margin - reach - 2), Math.round(NUDGE_POINTS * scale)), difference.unmatched);
    if ((nudge.dx || nudge.dy) && lay([content, ...(moved ? [{ dx: 0, dy: 0 }] : []), nudge]).count < CONFIRM_MIN) { kept.push({ ...region, kind: "nudged" }); continue; }
    kept.push(region);
  }
  return kept;
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
    const matched = textComparable ? diffCircuitPageTexts(baseTexts, workTexts) : { changes: [], shift: { dx: 0, dy: 0 }, unchanged: 0, totals: { before: 0, after: 0 } };
    const { changes, shift } = matched;
    const pages = { base: base.page, work: work.page };
    // Where each title block is, so a changed company or author there is listed as not an error (2026-11-24).
    const titleBlock = { base: findCircuitTitleBlock(baseTexts), work: findCircuitTitleBlock(workTexts) };
    const content = textComparable ? diffCircuitPageContents(baseTexts, workTexts) : null;
    // Values part by part, whichever way the page is compared (R3410: 2.21KΩ → 100KΩ, 2026-11-25).
    const { changes: valueChanges, leftovers: valueLeftovers } = textComparable ? matchCircuitPartValues(baseTexts, workTexts) : { changes: [], leftovers: { base: [], work: [] } };
    const valueCounts = content ? content.changes.filter(change => change.value) : [];
    const sameShape = Math.abs(baseSize.width / baseSize.height - workSize.width / workSize.height) <= 0.015;
    // The same circuit drawn again (公版 vs one's own drawing, another layout): placing strings and lines over each other
    // marks the whole sheet. Compare what is on it instead, and do not spend time drawing it (2026-11-24).
    if (content && isCircuitLayoutRedrawn(matched)) {
      return { textComparable, graphicsComparable: false, textChanges: [], regions: [], sizeChanged: !sameShape, redrawn: "layout", contentChanges: content.changes, pages, contents: content.contents, titleBlock, valueChanges, valueCounts, valueLeftovers };
    }
    if (!sameShape) return { textComparable, graphicsComparable: false, textChanges: changes, regions: [], sizeChanged: true, pages, titleBlock, valueChanges, valueCounts, valueLeftovers, ...(content ? { contents: content.contents } : {}) };
    const longEdge = Math.min(LONG_EDGE_MAX, Math.max(baseSize.width, baseSize.height) * DENSITY), scale = longEdge / Math.max(baseSize.width, baseSize.height);
    const width = Math.max(1, Math.round(baseSize.width * scale)), height = Math.max(1, Math.round(baseSize.height * scale));
    const offset = { dx: Math.round(shift.dx * width), dy: Math.round(shift.dy * height) }, ignore = circuitTextChangeBoxes(changes);
    let share = 0;
    const stats = { ink: 0, coloured: 0 };
    const lay = async () => {
      // One page after the other: two drawings under way at once now and then came out a few pixels different.
      const baseMask = await inkMask(base, width, height, signal, stats), workMask = await inkMask(work, width, height, signal, stats);
      signal?.throwIfAborted();
      share = circuitInkDifferenceShare(baseMask, workMask, width, height, offset);
      return diffCircuitInkMasks(baseMask, workMask, width, height, offset, ignore);
    };
    let regions = await lay();
    // The strings stayed but most lines differ: the lines are drawn another way (width, colour, another PDF printer). Every
    // box would be the whole sheet; the parts and nets are what can be compared (2026-11-24). A sheet without text (a scan)
    // has nothing else to compare, so it keeps its drawing differences.
    if (content && share > REDRAW_STYLE_SHARE) {
      return { textComparable, graphicsComparable: false, textChanges: changes, regions: [], sizeChanged: false, redrawn: "style", contentChanges: content.changes, pages, contents: content.contents, titleBlock, valueChanges, valueCounts, valueLeftovers };
    }
    if (regions.length) {
      // A difference is only reported when a second drawing of both pages shows it again in the same place: a real
      // difference always does, a drawing glitch does not. (The opposite cannot happen: a glitch never makes two
      // different sheets pixel for pixel the same.)
      const again = await lay();
      const near = (a: CircuitCropRect, b: CircuitCropRect) => a.x <= b.x + b.width + 0.01 && b.x <= a.x + a.width + 0.01 && a.y <= b.y + b.height + 0.01 && b.y <= a.y + a.height + 0.01;
      regions = again.filter(region => regions.some(first => near(region.box, first.box)));
      // A sheet drawn mostly in colour has no "coloured marks" to tell apart.
      regions = await confirmRegions(base, work, regions, shift, { width: workSize.width, height: workSize.height }, ignore, signal);
    }
    return { textComparable, graphicsComparable: true, textChanges: changes, regions, sizeChanged: false, pages, titleBlock, valueChanges, valueCounts, valueLeftovers, ...(content ? { contents: content.contents } : {}) };
  } finally {
    // Release what the pages keep after drawing, or a few hundred sheets stay in memory.
    basePage.cleanup(); workPage.cleanup();
  }
}
