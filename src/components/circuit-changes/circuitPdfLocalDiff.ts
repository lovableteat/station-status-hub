/**
 * 本機比對 (2026-11-19): what differs between a baseline page and the page being compared, found in the browser without
 * any AI request. Two schematic versions share most of their sheets, so sending every pair to a model spent minutes and
 * tokens on pages that are the same. Here the text of both pages is matched string by string and the drawings point by
 * point; only pages that really differ are worth an AI explanation, and identical pages are settled at once, offline.
 *
 * Pure functions: the page reading and drawing is in circuitPdfLocalDiffReader.ts.
 */
import type { CircuitCropRect } from "./circuitPdf";

export type CircuitDiffCategory = "connectivity" | "net-name" | "label-name";
/** One string of a page; the box is its top-left corner and size as fractions of the page (0–1). */
export interface CircuitDiffText { str: string; x: number; y: number; width: number; height: number }
export type CircuitTextChangeKind = "changed" | "removed" | "added" | "moved";
export interface CircuitTextChange { kind: CircuitTextChangeKind; before?: CircuitDiffText; after?: CircuitDiffText }
/**
 * An area whose drawing differs and that no text change explains. `base` / `work`: that version has ink the other lacks.
 * `faint`: the difference is within one pixel of existing lines (a junction dot on a crossing, a line a little longer);
 * it is still a difference and is always reported.
 */
export interface CircuitGraphicRegion { box: CircuitCropRect; base: boolean; work: boolean; faint?: boolean }
export interface CircuitLocalPageDiff {
  /** Both pages have selectable text, so the strings were matched one by one. */
  textComparable: boolean;
  /** Both pages were drawn at the same size and compared point by point. */
  graphicsComparable: boolean;
  textChanges: CircuitTextChange[];
  regions: CircuitGraphicRegion[];
  /** The two pages have different proportions (another sheet size), so the drawings were not laid over each other. */
  sizeChanged: boolean;
  /**
   * The same circuit drawn differently (2026-11-24, 公版 vs one's own drawing: 「600多項不同每頁都這樣子」): "layout" when
   * most strings sit somewhere else (redrawn, another layout), "style" when the strings stay but most lines differ (another
   * line width, colour or PDF printer). Such pages are compared by content: which Ref Des and net names each side has.
   */
  redrawn?: "layout" | "style";
  /** Ref Des, net names and other words one side has more often than the other (filled for redrawn pages). */
  contentChanges?: CircuitContentChange[];
  /** Page numbers compared, for looking up a Ref Des or net that moved to another sheet. */
  pages?: { base: number; work: number };
  /** The Ref Des and net names of each side, for the same look-up across sheets. */
  contents?: { base: string[]; work: string[] };
}
export type CircuitContentType = "refdes" | "net" | "other";
/** One word one side has more often than the other; `item` is where it is on the side that has it. */
export interface CircuitContentChange {
  side: "base" | "work"; token: string; type: CircuitContentType; count: number; item?: CircuitDiffText;
  /** Every occurrence the other side lacks is in the frame (title block, border): not part of the circuit. */
  frame?: boolean;
}

const SAME = 0.004;      // the same string within 0.4 % of the page is the same text
const MOVED_MAX = 0.08;  // farther than 8 % it is one text removed and another added, not a move
const PAIR = 0.02;       // a removed and an added string this close are one renamed text
/** One line of clean text: PDF strings can hold control characters and broken surrogate pairs, which the database refuses. */
const collapse = (value: string) => value.replace(/\p{Cc}/gu, " ").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd").replace(/\s+/g, " ").trim();
const center = (item: CircuitDiffText) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };

/**
 * A whole sheet nudged by the export (another margin) must not make every string "moved": strings that occur once on both
 * pages vote for one common shift, used only when most of them agree.
 */
function commonShift(before: readonly CircuitDiffText[], after: readonly CircuitDiffText[]) {
  const count = (items: readonly CircuitDiffText[]) => { const map = new Map<string, CircuitDiffText[]>(); for (const item of items) map.set(item.str, [...(map.get(item.str) ?? []), item]); return map; };
  const b = count(before), a = count(after);
  const dx: number[] = [], dy: number[] = [];
  for (const [str, items] of b) {
    const other = a.get(str);
    if (items.length !== 1 || other?.length !== 1) continue;
    const from = center(items[0]), to = center(other[0]);
    dx.push(to.x - from.x); dy.push(to.y - from.y);
  }
  if (dx.length < 8) return { dx: 0, dy: 0 };
  const mx = median(dx), my = median(dy);
  if (Math.hypot(mx, my) < 0.0015) return { dx: 0, dy: 0 };
  const agree = dx.filter((value, index) => Math.hypot(value - mx, dy[index] - my) <= 0.003).length;
  return agree >= dx.length * 0.6 ? { dx: mx, dy: my } : { dx: 0, dy: 0 };
}

/**
 * Matches the strings of two pages: the same string at the same place is unchanged; the rest is changed, removed, added or
 * moved. `unchanged` / `totals` say how much of the page stayed in place (low on a redrawn sheet).
 */
export function diffCircuitPageTexts(beforeItems: readonly CircuitDiffText[], afterItems: readonly CircuitDiffText[]): { changes: CircuitTextChange[]; shift: { dx: number; dy: number }; unchanged: number; totals: { before: number; after: number } } {
  const clean = (items: readonly CircuitDiffText[]) => items.map(item => ({ ...item, str: collapse(item.str) })).filter(item => item.str);
  const before = clean(beforeItems), after = clean(afterItems);
  const shift = commonShift(before, after);
  const position = (item: CircuitDiffText, shifted: boolean) => { const point = center(item); return shifted ? { x: point.x + shift.dx, y: point.y + shift.dy } : point; };
  const group = (items: CircuitDiffText[]) => { const map = new Map<string, CircuitDiffText[]>(); for (const item of items) { const list = map.get(item.str); if (list) list.push(item); else map.set(item.str, [item]); } return map; };
  const b = group(before), a = group(after);
  const changes: CircuitTextChange[] = [];
  const removed: CircuitDiffText[] = [], added: CircuitDiffText[] = [];
  for (const str of new Set([...b.keys(), ...a.keys()])) {
    const olds = b.get(str) ?? [], news = a.get(str) ?? [];
    const usedOld = new Set<number>(), usedNew = new Set<number>();
    if (olds.length && news.length) {
      const pairs: Array<{ o: number; n: number; d: number }> = [];
      for (let o = 0; o < olds.length; o++) { const from = position(olds[o], true); for (let n = 0; n < news.length; n++) { const to = position(news[n], false); const d = Math.hypot(to.x - from.x, to.y - from.y); if (d <= MOVED_MAX) pairs.push({ o, n, d }); } }
      pairs.sort((left, right) => left.d - right.d);
      for (const pair of pairs) {
        if (usedOld.has(pair.o) || usedNew.has(pair.n)) continue;
        usedOld.add(pair.o); usedNew.add(pair.n);
        if (pair.d > SAME) changes.push({ kind: "moved", before: olds[pair.o], after: news[pair.n] });
      }
    }
    olds.forEach((item, index) => { if (!usedOld.has(index)) removed.push(item); });
    news.forEach((item, index) => { if (!usedNew.has(index)) added.push(item); });
  }
  // A string removed and another added at the same spot is one text that was rewritten (a net renamed, a value changed).
  // A longer or shorter name keeps the end it is anchored at, so the nearest of start, middle and end decides.
  const anchors = (item: CircuitDiffText, shifted: boolean) => { const dx = shifted ? shift.dx : 0, dy = shifted ? shift.dy : 0; return [[item.x + dx, item.y + dy], [item.x + item.width / 2 + dx, item.y + item.height / 2 + dy], [item.x + item.width + dx, item.y + item.height + dy]]; };
  const pairs: Array<{ r: number; a: number; d: number }> = [];
  for (let r = 0; r < removed.length; r++) { const from = anchors(removed[r], true); for (let n = 0; n < added.length; n++) { const to = anchors(added[n], false); const d = Math.min(...from.map((point, index) => Math.hypot(to[index][0] - point[0], to[index][1] - point[1]))); if (d <= PAIR) pairs.push({ r, a: n, d }); } }
  pairs.sort((left, right) => left.d - right.d);
  const usedRemoved = new Set<number>(), usedAdded = new Set<number>();
  for (const pair of pairs) {
    if (usedRemoved.has(pair.r) || usedAdded.has(pair.a)) continue;
    usedRemoved.add(pair.r); usedAdded.add(pair.a);
    changes.push({ kind: "changed", before: removed[pair.r], after: added[pair.a] });
  }
  removed.forEach((item, index) => { if (!usedRemoved.has(index)) changes.push({ kind: "removed", before: item }); });
  added.forEach((item, index) => { if (!usedAdded.has(index)) changes.push({ kind: "added", after: item }); });
  const where = (change: CircuitTextChange) => center((change.after ?? change.before)!);
  changes.sort((left, right) => { const l = where(left), r = where(right); return Math.abs(l.y - r.y) > 0.01 ? l.y - r.y : l.x - r.x; });
  const unchanged = after.length - changes.filter(change => change.after).length;
  return { changes, shift, unchanged, totals: { before: before.length, after: after.length } };
}

/** Fewer strings than this and a page is too sparse to tell a redraw from an edit by its text. */
const REDRAW_MIN_STRINGS = 20;
/** Under this share of strings still in place, the sheet was redrawn (or laid out again). */
const REDRAW_LAYOUT_SHARE = 0.5;
/** Over this share of ink differing, the lines themselves are drawn differently (width, colour, PDF printer). */
export const REDRAW_STYLE_SHARE = 0.3;
/**
 * A redrawn sheet: most of its strings sit somewhere else. Strings matched by place, so a redraw makes almost every one
 * "moved" and every line "changed", which says nothing about the circuit (2026-11-24: 600+ differences on every page).
 */
export function isCircuitLayoutRedrawn(result: { unchanged: number; totals: { before: number; after: number } }) {
  const fewer = Math.min(result.totals.before, result.totals.after);
  return fewer >= REDRAW_MIN_STRINGS && result.unchanged / fewer < REDRAW_LAYOUT_SHARE;
}

const REFDES = /^[A-Z]{1,4}\d{1,5}[A-Z]?$/;
const NET = /_|^[+-]?\d+(?:\.\d+)?V\d*$|^P\d+V\d*|^V(?:CC|DD|SS|IN|OUT)|^GND|^\+/;
/** What a word on a sheet is: a reference designator (location), a net name, or another word (value, pin name, note). */
export function circuitTokenType(token: string): CircuitContentType | null {
  const word = token.trim().toUpperCase();
  if (word.length < 2 || !/[A-Z]/.test(word) || /^\d+(?:\.\d+)?$/.test(word)) return null;
  if (REFDES.test(word)) return "refdes";
  return NET.test(word) ? "net" : "other";
}

/**
 * The words of a page, each marked when it sits in the frame (title block, border). Frame words still count, so a word
 * drawn just inside the frame on one sheet and just outside it on the other is not a difference.
 */
function pageTokens(items: readonly CircuitDiffText[]) {
  const tokens: Array<{ token: string; type: CircuitContentType; item: CircuitDiffText; frame: boolean }> = [];
  for (const item of items) {
    const frame = inFrame(center(item));
    for (const word of collapse(item.str).split(" ")) {
      const type = circuitTokenType(word);
      if (type) tokens.push({ token: word.toUpperCase(), type, item, frame });
    }
  }
  return tokens;
}

/**
 * Compares two sheets by what is on them, not where: every Ref Des, net name and other word one side has more often than
 * the other. On a redrawn sheet this is what can be trusted: a missing part or a renamed net, wherever it was drawn.
 */
export function diffCircuitPageContents(beforeItems: readonly CircuitDiffText[], afterItems: readonly CircuitDiffText[]) {
  const before = pageTokens(beforeItems), after = pageTokens(afterItems);
  const tally = (tokens: typeof before) => { const map = new Map<string, typeof before>(); for (const entry of tokens) map.set(entry.token, [...(map.get(entry.token) ?? []), entry]); return map; };
  const b = tally(before), a = tally(after);
  const changes: CircuitContentChange[] = [];
  for (const token of new Set([...b.keys(), ...a.keys()])) {
    const olds = b.get(token) ?? [], news = a.get(token) ?? [];
    if (olds.length === news.length) continue;
    const more = olds.length > news.length ? olds : news, fewer = olds.length > news.length ? news : olds;
    // The occurrences the other side lacks: those in the drawing first, so a frame copy never hides a real one.
    const extra = [...more].sort((left, right) => Number(left.frame) - Number(right.frame)).slice(0, more.length - fewer.length);
    const inDrawing = extra.find(entry => !entry.frame);
    changes.push({ side: olds.length > news.length ? "base" : "work", token, type: more[0].type, count: extra.length, item: (inDrawing ?? extra[0]).item, ...(inDrawing ? {} : { frame: true }) });
  }
  const rank = { refdes: 0, net: 1, other: 2 };
  changes.sort((left, right) => rank[left.type] - rank[right.type] || left.token.localeCompare(right.token));
  const named = (tokens: typeof before) => [...new Set(tokens.filter(entry => entry.type !== "other" && !entry.frame).map(entry => entry.token))];
  return { changes, contents: { base: named(before), work: named(after) } };
}

/** Which sheets of each PDF hold every Ref Des and net name, from the pages a batch compared. */
export interface CircuitContentIndex { base: ReadonlyMap<string, number[]>; work: ReadonlyMap<string, number[]> }
export function indexCircuitPageContents(diffs: readonly CircuitLocalPageDiff[]): CircuitContentIndex {
  const base = new Map<string, number[]>(), work = new Map<string, number[]>();
  for (const diff of diffs) {
    if (!diff.contents || !diff.pages) continue;
    for (const token of diff.contents.base) base.set(token, [...(base.get(token) ?? []), diff.pages.base]);
    for (const token of diff.contents.work) work.set(token, [...(work.get(token) ?? []), diff.pages.work]);
  }
  return { base, work };
}

/** Share of the ink of two drawings that differs (lines moved by a rounding step tolerated). */
export function circuitInkDifferenceShare(base: Uint8Array, work: Uint8Array, width: number, height: number, shift: { dx: number; dy: number } = { dx: 0, dy: 0 }) {
  if (base.length !== width * height || work.length !== width * height || !width || !height) return 0;
  const at = (x: number, y: number) => { const sx = x - shift.dx, sy = y - shift.dy; return sx >= 0 && sx < width && sy >= 0 && sy < height ? base[sy * width + sx] : 0; };
  const near = (mask: (x: number, y: number) => number, x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mask(x + dx, y + dy)) return true; return false; };
  const workAt = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height ? work[y * width + x] : 0;
  let ink = 0, differs = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const b = at(x, y), w = work[y * width + x];
    if (!b && !w) continue;
    ink++;
    if (b && !w ? !near(workAt, x, y) : w && !b ? !near(at, x, y) : false) differs++;
  }
  return ink ? differs / ink : 0;
}

/** Grows ink by one pixel in every direction, so lines that only moved by a rounding step do not count as changed. */
function dilate(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= height) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < width) out[yy * width + xx] = 1; } }
  }
  return out;
}

const CELL = 8;
/**
 * Lays two drawings of the same pixel size over each other (1 = ink) and returns the areas where they differ, as
 * fractions of the page. `shift` moves the baseline by whole pixels first (see commonShift); `ignore` are the boxes of
 * changed text, whose letters are already reported as text changes.
 *
 * A page that differs must never come out the same (2026-11-19 review): lines that only moved by a rounding step are
 * tolerated, but when that tolerance swallows every difference while the two drawings are not pixel for pixel equal
 * (a junction dot added on a crossing, a wire a few pixels longer), the exact differences are returned as `faint`.
 */
export function diffCircuitInkMasks(base: Uint8Array, work: Uint8Array, width: number, height: number, shift: { dx: number; dy: number } = { dx: 0, dy: 0 }, ignore: readonly CircuitCropRect[] = []): CircuitGraphicRegion[] {
  if (base.length !== width * height || work.length !== width * height || !width || !height) return [];
  let source = base;
  if (shift.dx || shift.dy) {
    source = new Uint8Array(base.length);
    for (let y = 0; y < height; y++) { const sy = y - shift.dy; if (sy < 0 || sy >= height) continue; for (let x = 0; x < width; x++) { const sx = x - shift.dx; if (sx >= 0 && sx < width) source[y * width + x] = base[sy * width + sx]; } }
  }
  const skip = ignore.length ? new Uint8Array(base.length) : null;
  if (skip) for (const box of ignore) {
    const x0 = Math.max(0, Math.floor(box.x * width)), x1 = Math.min(width, Math.ceil((box.x + box.width) * width)), y0 = Math.max(0, Math.floor(box.y * height)), y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
    for (let y = y0; y < y1; y++) skip.fill(1, y * width + x0, y * width + x1);
  }
  const baseWide = dilate(source, width, height), workWide = dilate(work, width, height);
  const columns = Math.ceil(width / CELL), rows = Math.ceil(height / CELL);
  const collect = (exact: boolean) => {
    const onlyBase = new Uint16Array(columns * rows), onlyWork = new Uint16Array(columns * rows);
    let any = false;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (source[index] === work[index] || skip?.[index]) continue;
      const cell = Math.floor(y / CELL) * columns + Math.floor(x / CELL);
      if (source[index] && (exact || !workWide[index])) { onlyBase[cell]++; any = true; }
      else if (work[index] && (exact || !baseWide[index])) { onlyWork[cell]++; any = true; }
    }
    if (!any) return [];
    // Cells one apart belong to the same change (a dashed line, the strokes of one symbol).
    const seen = new Uint8Array(columns * rows);
    const regions: CircuitGraphicRegion[] = [];
    for (let start = 0; start < seen.length; start++) {
      if (!(onlyBase[start] + onlyWork[start]) || seen[start]) continue;
      let minX = columns, minY = rows, maxX = -1, maxY = -1, pixelsBase = 0, pixelsWork = 0;
      const stack = [start]; seen[start] = 1;
      while (stack.length) {
        const cell = stack.pop()!, cx = cell % columns, cy = Math.floor(cell / columns);
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        pixelsBase += onlyBase[cell]; pixelsWork += onlyWork[cell];
        for (let dy = -2; dy <= 2; dy++) { const ny = cy + dy; if (ny < 0 || ny >= rows) continue; for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx; if (nx < 0 || nx >= columns) continue; const next = ny * columns + nx; if (onlyBase[next] + onlyWork[next] && !seen[next]) { seen[next] = 1; stack.push(next); } } }
      }
      const x = minX * CELL / width, y = minY * CELL / height;
      regions.push({ box: { x, y, width: Math.min(1 - x, (maxX - minX + 1) * CELL / width), height: Math.min(1 - y, (maxY - minY + 1) * CELL / height) }, base: pixelsBase > 0, work: pixelsWork > 0, ...(exact ? { faint: true } : {}) });
    }
    return regions;
  };
  let regions = collect(false);
  if (!regions.length) regions = collect(true);
  regions.sort((left, right) => Math.abs(left.box.y - right.box.y) > 0.01 ? left.box.y - right.box.y : left.box.x - right.box.x);
  return regions;
}

/** The box grown by `by` and kept inside the page; null when nothing of it is on the page (text placed off the sheet). */
const pad = (box: CircuitCropRect, by: number): CircuitCropRect | null => {
  const x = Math.min(Math.max(box.x - by, 0), 1), y = Math.min(Math.max(box.y - by, 0), 1);
  const right = Math.min(Math.max(box.x + box.width + by, 0), 1), bottom = Math.min(Math.max(box.y + box.height + by, 0), 1);
  return right - x > 0.0005 && bottom - y > 0.0005 && x < 0.9995 && y < 0.9995 ? { x, y, width: right - x, height: bottom - y } : null;
};

/**
 * The letters of changed text, to leave out of the drawing comparison: they are already reported as text changes.
 * Only these boxes are left out, so a wire redrawn beside a renamed label is still found.
 */
export function circuitTextChangeBoxes(changes: readonly CircuitTextChange[]): CircuitCropRect[] {
  return changes.flatMap(change => [change.before, change.after]).filter((item): item is CircuitDiffText => Boolean(item)).map(item => pad(item, 0.006)).filter((box): box is CircuitCropRect => Boolean(box));
}

/**
 * True only when the two drawings were laid over each other and are pixel for pixel the same, with no text change.
 * A page whose drawings could not be compared (another sheet size) is never "identical".
 */
export const isCircuitPageIdentical = (diff: CircuitLocalPageDiff) => diff.graphicsComparable && !diff.sizeChanged && diff.textChanges.length === 0 && diff.regions.length === 0;

/** Where on the sheet, in words a person reads: "右上（橫 82%、直 14%）". */
export function describeCircuitDiffPlace(box: CircuitCropRect) {
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const column = x < 1 / 3 ? "左" : x > 2 / 3 ? "右" : "", row = y < 1 / 3 ? "上" : y > 2 / 3 ? "下" : "";
  const zone = column && row ? `${column}${row}` : column ? `${column}側` : row ? `${row}方` : "中央";
  return `${zone}（橫 ${Math.round(x * 100)}%、直 ${Math.round(y * 100)}%）`;
}

const REFERENCE = /^(?:[A-Z]{1,4}\d{1,5}[A-Z]?|\d{1,4}|[A-Z]{1,2}\d{1,2}|\d+(?:\.\d+)?\s?(?:[pnuµmkKMR]|[kKM]?[ΩRFHVAW]|ohm|uF|nF|pF|uH|nH|mA|%)[A-Za-z%]*)$/;
/** A guess used only to sort a text change under Net 名稱 or 元件／接腳名稱: reference designators, pin numbers and values are labels. */
export const classifyCircuitDiffText = (value: string): CircuitDiffCategory => REFERENCE.test(collapse(value)) ? "label-name" : "net-name";

/**
 * The same spot of the sheet frame changing on many sheets is the title block (date, revision, sheet count), not a
 * circuit change. Only the frame counts: the same place inside the drawing changing on several sheets is a real change
 * on each of them (a repeated channel, a renamed rail).
 */
const inFrame = (point: { x: number; y: number }) => point.x < 0.06 || point.x > 0.94 || point.y < 0.09 || point.y > 0.88;
const spot = (change: CircuitTextChange) => { const point = center((change.after ?? change.before)!); return inFrame(point) ? `${Math.round(point.x * 40)}:${Math.round(point.y * 40)}` : ""; };
export interface CircuitCommonChanges { spots: ReadonlySet<string>; pages: number; examples: string[] }
export function findCircuitCommonChanges(pages: ReadonlyArray<readonly CircuitTextChange[]>): CircuitCommonChanges {
  const counts = new Map<string, number>(), samples = new Map<string, string>();
  for (const changes of pages) for (const key of new Set(changes.map(spot))) if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  // At least five sheets and half of those compared: a rename on a few sheets is never "every sheet".
  const limit = Math.max(5, Math.ceil(pages.length * 0.5));
  const spots = new Set([...counts].filter(([, count]) => count >= limit).map(([key]) => key));
  for (const changes of pages) for (const change of changes) {
    const key = spot(change);
    if (spots.has(key) && !samples.has(key)) samples.set(key, describeCircuitTextChange(change));
  }
  return { spots, pages: spots.size ? Math.max(...[...spots].map(key => counts.get(key) ?? 0)) : 0, examples: [...samples.values()].slice(0, 3) };
}
export const isCircuitCommonChange = (change: CircuitTextChange, common: CircuitCommonChanges | null | undefined) => { const key = spot(change); return Boolean(key && common?.spots.has(key)); };

export function describeCircuitTextChange(change: CircuitTextChange) {
  if (change.kind === "changed") return `「${change.before!.str}」改成「${change.after!.str}」`;
  if (change.kind === "removed") return `「${change.before!.str}」移除`;
  if (change.kind === "added") return `新增「${change.after!.str}」`;
  return `「${change.after!.str}」移位`;
}

export interface CircuitLocalFinding {
  category: CircuitDiffCategory; priority: "high" | "medium" | "low"; certainty: "suspected" | "unclear";
  title: string; location: string; officialEvidence: string; workingEvidence: string; suggestion: string;
  officialBox: CircuitCropRect | null; workingBox: CircuitCropRect | null;
}
export interface CircuitLocalSummary {
  findings: CircuitLocalFinding[];
  /** Differences that did not fit in the list (a report holds at most `limit`). */
  omitted: number;
  /** Findings that are the same frame spot changing on many sheets (title block); listed last, never hidden. */
  common: number;
  /** Findings that are this page's own differences: only these are worth an AI explanation. */
  own: number;
  counts: { changed: number; removed: number; added: number; moved: number; graphic: number };
  /** Blocks of the sheet that were moved or redrawn, each listed as one finding (findCircuitChangeAreas). */
  areas?: number;
}

/** Strings of one block lie this close (fraction of the page): a moved or redrawn block chains through its own strings. */
const AREA_LINK = 0.04;
/**
 * At least this many changed strings close together: a block of the sheet was moved or redrawn (2026-11-24, the user's
 * MCU1 sheet: one redrawn MCU1G block put 40 marks on top of each other, 「你自己看，幫我解決」). Such an area is compared
 * by content, like a redrawn sheet, and listed as one finding; the Ref Des and net names one side lacks there stay findings
 * of their own, so a missing part is never folded away.
 */
const AREA_MIN = 8;
export interface CircuitChangeArea { changes: CircuitTextChange[]; regions: CircuitGraphicRegion[] }
const boundsOf = (boxes: readonly CircuitCropRect[]): CircuitCropRect | null => {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  return { x: left, y: top, width: Math.max(...boxes.map(box => box.x + box.width)) - left, height: Math.max(...boxes.map(box => box.y + box.height)) - top };
};
const overlapOf = (a: CircuitCropRect, b: CircuitCropRect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const itemBox = (item: CircuitDiffText): CircuitCropRect => ({ x: item.x, y: item.y, width: item.width, height: item.height });

/**
 * Groups the text changes of a page into the blocks that were moved or redrawn: changes whose strings (on either side)
 * lie within AREA_LINK of each other chain into one group, and a group of AREA_MIN or more is an area. A changed drawing
 * that lies mostly in the areas belongs to them (the redraw itself). `skip` keeps changes out (frame changes shared by
 * many sheets). `rest` / `regions` are what stays a difference of its own.
 */
export function findCircuitChangeAreas(changes: readonly CircuitTextChange[], regions: readonly CircuitGraphicRegion[], skip: (change: CircuitTextChange) => boolean = () => false) {
  const candidates = changes.filter(change => !skip(change));
  const points = candidates.map(change => [change.before, change.after].filter((item): item is CircuitDiffText => Boolean(item)).map(center));
  const parent = candidates.map((_, index) => index);
  const root = (index: number) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    if (root(i) === root(j)) continue;
    if (points[i].some(p => points[j].some(q => Math.abs(p.x - q.x) <= AREA_LINK && Math.abs(p.y - q.y) <= AREA_LINK && Math.hypot(p.x - q.x, p.y - q.y) <= AREA_LINK))) parent[root(i)] = root(j);
  }
  // A block moved farther than a string's own reach leaves its old place (strings only the baseline has there) and its
  // new place (strings only the new version has) as two groups. They hold the same strings, so they are one block.
  const members = new Map<number, number[]>();
  candidates.forEach((_, index) => { const key = root(index); members.set(key, [...(members.get(key) ?? []), index]); });
  const sizable = [...members.values()].filter(group => group.length >= 3);
  const words = (group: number[], side: "before" | "after") => {
    const map = new Map<string, number>();
    for (const index of group) { const str = candidates[index][side]?.str; if (str) map.set(str, (map.get(str) ?? 0) + 1); }
    return map;
  };
  const sides = sizable.map(group => ({ before: words(group, "before"), after: words(group, "after") }));
  const shared = (from: Map<string, number>, to: Map<string, number>) => { let count = 0; for (const [str, times] of from) count += Math.min(times, to.get(str) ?? 0); return count; };
  const total = (map: Map<string, number>) => [...map.values()].reduce((sum, times) => sum + times, 0);
  for (let i = 0; i < sizable.length; i++) for (let j = i + 1; j < sizable.length; j++) {
    for (const [from, to] of [[sides[i].before, sides[j].after], [sides[j].before, sides[i].after]] as const) {
      const common = shared(from, to), fewer = Math.min(total(from), total(to));
      if (common >= 3 && common >= fewer * 0.3) { parent[root(sizable[i][0])] = root(sizable[j][0]); break; }
    }
  }
  const groups = new Map<number, CircuitTextChange[]>();
  candidates.forEach((change, index) => { const key = root(index); groups.set(key, [...(groups.get(key) ?? []), change]); });
  const areas: CircuitChangeArea[] = [...groups.values()].filter(group => group.length >= AREA_MIN).map(group => ({ changes: group, regions: [] }));
  const grouped = new Set(areas.flatMap(area => area.changes));
  const boxes = areas.map(area => boundsOf(area.changes.flatMap(change => [change.before, change.after]).filter((item): item is CircuitDiffText => Boolean(item)).map(itemBox)))
    .map(box => box && pad(box, 0.01));
  const loose: CircuitGraphicRegion[] = [];
  for (const region of regions) {
    const size = region.box.width * region.box.height, middle = { x: region.box.x + region.box.width / 2, y: region.box.y + region.box.height / 2 };
    const shares = boxes.map(box => box ? overlapOf(box, region.box) : 0);
    const inside = boxes.findIndex(box => box && middle.x >= box.x && middle.x <= box.x + box.width && middle.y >= box.y && middle.y <= box.y + box.height);
    const best = shares.indexOf(Math.max(0, ...shares));
    // Mostly inside the moved blocks (all of them together), or centred in one: the lines of that redraw.
    if (inside >= 0) areas[inside].regions.push(region);
    else if (best >= 0 && shares[best] > 0 && shares.reduce((sum, share) => sum + share, 0) >= size * 0.25) areas[best].regions.push(region);
    else loose.push(region);
  }
  return { areas, rest: changes.filter(change => !grouped.has(change)), regions: loose };
}

const clip = (value: string, max = 180) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const textBox = (item: CircuitDiffText | undefined) => item ? pad({ x: item.x, y: item.y, width: Math.max(item.width, 0.006), height: Math.max(item.height, 0.006) }, 0.004) : null;
const COMMON_NOTE = "很多頁同一個圖框位置都有這個變更（通常是標題欄的日期、版次或頁數），確認一次即可。";

const TYPE_WORDS: Record<CircuitContentType, string> = { refdes: "零件位號", net: "網路名稱", other: "其他文字" };
/**
 * A redrawn sheet as findings: the Ref Des and net names only one side has, each named, with where it is on that side.
 * One the other PDF has on another sheet moved sheet (listed, not this sheet's difference). Other words (values, pin
 * names, notes, which a redraw changes freely) are one line with examples, so they never bury the parts and nets.
 */
function summarizeRedrawn(diff: CircuitLocalPageDiff, limit: number, cross?: CircuitContentIndex | null): CircuitLocalSummary {
  const counts = { changed: 0, removed: 0, added: 0, moved: 0, graphic: 0 };
  const findings: Array<CircuitLocalFinding & { rank: number; own: boolean }> = [];
  const others: CircuitContentChange[] = [], frames: CircuitContentChange[] = [];
  for (const change of diff.contentChanges ?? []) {
    if (change.frame) { frames.push(change); continue; }
    if (change.type === "other") { others.push(change); continue; }
    const words = TYPE_WORDS[change.type], here = change.side === "base" ? "基準版" : "比對版", there = change.side === "base" ? "比對版" : "基準版";
    const otherPages = (change.side === "base" ? cross?.work : cross?.base)?.get(change.token)?.filter(page => page !== (change.side === "base" ? diff.pages?.work : diff.pages?.base)) ?? [];
    const times = change.count > 1 ? `（多 ${change.count} 個）` : "";
    const box = textBox(change.item), place = change.item ? describeCircuitDiffPlace(change.item) : "這一頁";
    const category: CircuitDiffCategory = change.type === "refdes" ? "label-name" : "net-name";
    if (otherPages.length) {
      findings.push({ rank: 6, own: false, category, priority: "low", certainty: "suspected", title: clip(`${words}換頁：${change.token} 在${there}第 ${otherPages.slice(0, 3).join("、")} 頁`, 280), location: place,
        officialEvidence: change.side === "base" ? `${change.token}（${place}）` : `基準版在第 ${otherPages.slice(0, 3).join("、")} 頁`, workingEvidence: change.side === "work" ? `${change.token}（${place}）` : `比對版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        suggestion: `${there}把 ${change.token} 畫在另一頁，不算少了；確認那一頁的接法相同即可。`, officialBox: change.side === "base" ? box : null, workingBox: change.side === "work" ? box : null });
      continue;
    }
    if (change.side === "base") counts.removed += change.count; else counts.added += change.count;
    findings.push({ rank: change.type === "refdes" ? 0 : 1, own: true, category, priority: change.type === "refdes" ? "high" : "medium", certainty: "suspected",
      title: clip(`${words}只在${here}：${change.token}${times}`, 280), location: place,
      officialEvidence: change.side === "base" ? `${change.token}（${place}）` : `基準版${cross ? "整份" : "這一頁"}沒有 ${change.token}`,
      workingEvidence: change.side === "work" ? `${change.token}（${place}）` : `比對版${cross ? "整份" : "這一頁"}沒有 ${change.token}`,
      suggestion: change.side === "base"
        ? (change.type === "refdes" ? `基準版有 ${change.token}，比對版沒有：確認是刻意拿掉，還是漏畫或位號寫錯。` : `基準版有網路 ${change.token}，比對版沒有：確認是改名、合併，還是漏接。`)
        : (change.type === "refdes" ? `比對版多了 ${change.token}：確認是新增的零件，還是位號寫錯。` : `比對版多了網路 ${change.token}：確認是新增或改名，接到的腳位正確。`),
      officialBox: change.side === "base" ? box : null, workingBox: change.side === "work" ? box : null });
  }
  if (others.length) {
    const sample = others.slice(0, 8).map(change => `${change.token}（${change.side === "base" ? "基準版" : "比對版"}多 ${change.count}）`).join("、");
    findings.push({ rank: 7, own: false, category: "label-name", priority: "low", certainty: "unclear", title: clip(`其他文字不同 ${others.length} 個（數值、接腳名稱或註解）`, 280), location: "整頁",
      officialEvidence: clip(others.filter(change => change.side === "base").map(change => change.token).join("、") || "—", 1900),
      workingEvidence: clip(others.filter(change => change.side === "work").map(change => change.token).join("、") || "—", 1900),
      suggestion: `重畫的圖常改寫數值、接腳名稱或註解，例如：${sample}。需要時再逐一核對。`, officialBox: null, workingBox: null });
  }
  if (frames.length) {
    // The frame of a redrawn sheet (title block, company, drawer, date) differs by nature: one line, listed, never hidden.
    findings.push({ rank: 8, own: false, category: "label-name", priority: "low", certainty: "unclear", title: clip(`圖框／標題欄文字不同 ${frames.length} 個`, 280), location: "圖框與標題欄",
      officialEvidence: clip(frames.filter(change => change.side === "base").map(change => change.token).join("、") || "—", 1900),
      workingEvidence: clip(frames.filter(change => change.side === "work").map(change => change.token).join("、") || "—", 1900),
      suggestion: "只出現在圖框或標題欄（日期、版次、繪圖者、公司名稱等），不是電路內容。", officialBox: null, workingBox: null });
  }
  findings.sort((left, right) => left.rank - right.rank);
  const kept = findings.slice(0, limit);
  return { findings: kept.map(({ rank: _rank, own: _own, ...finding }) => finding), omitted: findings.length - kept.length, common: 0,
    own: findings.filter(item => item.own).length, counts };
}

/**
 * One moved or redrawn block as findings: the block itself (one finding, both sides boxed), and every Ref Des and net
 * name it has more of on one side, compared by name inside the block. Strings that only moved cancel out; a name one side
 * lacks keeps a finding of its own (renamed when one string was rewritten in place), one the other side still has on the
 * page or on another sheet is listed low. Values, pin names and notes are named in the block's evidence.
 */
function summarizeArea(area: CircuitChangeArea, diff: CircuitLocalPageDiff, cross?: CircuitContentIndex | null): Array<CircuitLocalFinding & { rank: number }> {
  type Entry = { count: number; item: CircuitDiffText; type: CircuitContentType };
  const befores = area.changes.flatMap(change => change.before ? [change.before] : []), afters = area.changes.flatMap(change => change.after ? [change.after] : []);
  const tally = (items: readonly CircuitDiffText[]) => {
    const map = new Map<string, Entry>();
    for (const item of items) for (const word of collapse(item.str).split(" ")) {
      const type = circuitTokenType(word);
      if (!type) continue;
      const token = word.toUpperCase(), entry = map.get(token);
      if (entry) entry.count++; else map.set(token, { count: 1, item, type });
    }
    return map;
  };
  const base = tally(befores), work = tally(afters);
  const extra = new Map<string, { side: "base" | "work"; count: number; entry: Entry }>(), others: string[] = [];
  for (const token of new Set([...base.keys(), ...work.keys()])) {
    const difference = (base.get(token)?.count ?? 0) - (work.get(token)?.count ?? 0);
    if (!difference) continue;
    const side = difference > 0 ? "base" : "work", entry = (side === "base" ? base : work).get(token)!;
    if (entry.type === "other") others.push(`${token}（${side === "base" ? "基準版" : "比對版"}多 ${Math.abs(difference)}）`);
    else extra.set(token, { side, count: Math.abs(difference), entry });
  }
  const findings: Array<CircuitLocalFinding & { rank: number }> = [];
  // A string rewritten in place whose only named difference is one name for another: one rename, not two lines.
  for (const change of area.changes) {
    if (change.kind !== "changed") continue;
    const gone = collapse(change.before!.str).split(" ").map(word => word.toUpperCase()).filter(token => extra.get(token)?.side === "base");
    const came = collapse(change.after!.str).split(" ").map(word => word.toUpperCase()).filter(token => extra.get(token)?.side === "work");
    if (gone.length !== 1 || came.length !== 1 || extra.get(gone[0])!.count !== 1 || extra.get(came[0])!.count !== 1) continue;
    const category = classifyCircuitDiffText(change.after!.str);
    findings.push({ rank: 0, category, priority: "high", certainty: "suspected", title: clip(`文字改了：${change.before!.str} → ${change.after!.str}`, 280), location: describeCircuitDiffPlace(change.after!),
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: clip(change.after!.str, 1900), suggestion: "這一區整塊搬移或重畫，這個名稱也換了：請確認這是預期的修改。", officialBox: textBox(change.before), workingBox: textBox(change.after) });
    extra.delete(gone[0]); extra.delete(came[0]);
  }
  for (const [token, { side, count, entry }] of extra) {
    const words = TYPE_WORDS[entry.type], here = side === "base" ? "基準版" : "比對版", there = side === "base" ? "比對版" : "基準版";
    const place = describeCircuitDiffPlace(entry.item), box = textBox(entry.item), category: CircuitDiffCategory = entry.type === "refdes" ? "label-name" : "net-name";
    const onPage = (side === "base" ? diff.contents?.work : diff.contents?.base)?.includes(token) ?? false;
    const otherPages = onPage ? [] : (side === "base" ? cross?.work : cross?.base)?.get(token)?.filter(page => page !== (side === "base" ? diff.pages?.work : diff.pages?.base)) ?? [];
    const boxes = { officialBox: side === "base" ? box : null, workingBox: side === "work" ? box : null };
    if (onPage || otherPages.length) {
      findings.push({ rank: 6, category, priority: "low", certainty: "unclear", location: place, ...boxes,
        title: clip(onPage ? `${words}${here}這一區多 ${count} 個：${token}（${there}這一頁仍有）` : `${words}換頁：${token} 在${there}第 ${otherPages.slice(0, 3).join("、")} 頁`, 280),
        officialEvidence: side === "base" ? `${token}（${place}）` : onPage ? `基準版這一頁其他地方有 ${token}` : `基準版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        workingEvidence: side === "work" ? `${token}（${place}）` : onPage ? `比對版這一頁其他地方有 ${token}` : `比對版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        suggestion: onPage ? `兩版都有 ${token}，只是這一區畫的次數不同（重畫時常增減網路標籤）；確認它接到的腳位相同即可。` : `${there}把 ${token} 畫在另一頁，不算少了；確認那一頁的接法相同即可。` });
      continue;
    }
    findings.push({ rank: entry.type === "refdes" ? 0 : 1, category, priority: entry.type === "refdes" ? "high" : "medium", certainty: "suspected", location: place, ...boxes,
      title: clip(`${words}只在${here}：${token}${count > 1 ? `（多 ${count} 個）` : ""}`, 280),
      officialEvidence: side === "base" ? `${token}（${place}）` : `基準版${cross ? "整份" : "這一頁"}沒有 ${token}`,
      workingEvidence: side === "work" ? `${token}（${place}）` : `比對版${cross ? "整份" : "這一頁"}沒有 ${token}`,
      suggestion: side === "base"
        ? (entry.type === "refdes" ? `基準版有 ${token}，比對版沒有：確認是刻意拿掉，還是漏畫或位號寫錯。` : `基準版有網路 ${token}，比對版沒有：確認是改名、合併，還是漏接。`)
        : (entry.type === "refdes" ? `比對版多了 ${token}：確認是新增的零件，還是位號寫錯。` : `比對版多了網路 ${token}：確認是新增或改名，接到的腳位正確。`) });
  }
  const rewrites = area.changes.filter(change => change.kind === "changed").map(change => `${change.before!.str} → ${change.after!.str}`);
  const sideBox = (items: readonly CircuitDiffText[], ink: "base" | "work") => {
    const bounds = boundsOf([...items.map(itemBox), ...area.regions.filter(region => region[ink]).map(region => region.box)]);
    return bounds && pad(bounds, 0.004);
  };
  const officialBox = sideBox(befores, "base"), workingBox = sideBox(afters, "work");
  const named = findings.filter(item => item.rank < 6).length;
  const evidence = (items: readonly CircuitDiffText[], label: string, side: "base" | "work") => {
    const extraOthers = others.filter(word => word.includes(side === "base" ? "基準版多" : "比對版多"));
    return clip([`${label} ${items.length} 段文字不在原位${area.regions.some(region => region[side]) ? "，線條也不同" : ""}`,
      extraOthers.length ? `只在這一邊的其他文字：${extraOthers.slice(0, 12).join("、")}` : "",
      side === "work" && rewrites.length ? `同一位置改寫：${rewrites.slice(0, 8).join("、")}` : ""].filter(Boolean).join("；"), 1900);
  };
  findings.push({ rank: 3, category: "connectivity", priority: "medium", certainty: "unclear", location: officialBox ?? workingBox ? describeCircuitDiffPlace((officialBox ?? workingBox)!) : "這一頁",
    title: clip(`這一區整塊搬移或重畫：${area.changes.length} 段文字位置不同，${named ? `${named} 個位號／網路只在一邊（另列）` : "位號與網路名稱一致"}`, 280),
    officialEvidence: evidence(befores, "基準版這一區", "base"), workingEvidence: evidence(afters, "比對版這一區", "work"),
    suggestion: "這一區的文字大量換了位置，通常是整塊搬移或重畫。零件位號與網路名稱已在這一區逐一比對（只在一邊的另列）；數值、接腳名稱見證據，接線請放大兩版核對。",
    officialBox, workingBox });
  return findings;
}

/**
 * The differences of one page as findings a person can check, most telling first; at most `limit`. A redrawn page is
 * summarised by content (summarizeRedrawn); `cross` tells which sheets of each PDF hold every Ref Des and net name.
 * A moved or redrawn block of an otherwise unchanged page is one finding plus its named differences (summarizeArea).
 */
export function summarizeCircuitLocalDiff(diff: CircuitLocalPageDiff, common?: CircuitCommonChanges | null, limit = 40, cross?: CircuitContentIndex | null): CircuitLocalSummary {
  // Both kinds of redraw: places and lines say nothing about the circuit there, names do.
  if (diff.redrawn && diff.contentChanges) return summarizeRedrawn(diff, limit, cross);
  const counts = { changed: 0, removed: 0, added: 0, moved: 0, graphic: diff.regions.length };
  // Blocks moved or redrawn as a whole: one finding each, compared by name (summarizeArea), counted like any text change.
  const grouping = findCircuitChangeAreas(diff.textChanges, diff.regions, change => isCircuitCommonChange(change, common));
  for (const change of grouping.areas.flatMap(area => area.changes)) counts[change.kind]++;
  const order: Record<CircuitTextChangeKind, number> = { changed: 0, removed: 1, added: 2, moved: 4 };
  const findings: Array<CircuitLocalFinding & { rank: number; shared: boolean }> = grouping.rest.map(change => {
    const shared = isCircuitCommonChange(change, common);
    if (!shared) counts[change.kind]++;
    const text = (change.after ?? change.before)!.str, category = classifyCircuitDiffText(text);
    const place = describeCircuitDiffPlace((change.after ?? change.before)!);
    // A change shared by many sheets is listed last and marked, never left out.
    const rank = shared ? 5 : order[change.kind], mark = shared ? "多頁共通：" : "";
    if (change.kind === "changed") return { rank, shared, category, priority: shared ? "low" as const : "high" as const, certainty: "suspected" as const, title: clip(`${mark}文字改了：${change.before!.str} → ${change.after!.str}`, 280), location: place,
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: clip(change.after!.str, 1900), suggestion: shared ? COMMON_NOTE : "兩版同一個位置的文字不同，請確認這是預期的修改。", officialBox: textBox(change.before), workingBox: textBox(change.after) };
    if (change.kind === "removed") return { rank, shared, category, priority: shared ? "low" as const : "medium" as const, certainty: "suspected" as const, title: clip(`${mark}文字移除：${change.before!.str}`, 280), location: place,
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: "比對版這個位置沒有這段文字", suggestion: shared ? COMMON_NOTE : "基準版有、比對版沒有，請確認是刻意刪除還是漏畫。", officialBox: textBox(change.before), workingBox: null };
    if (change.kind === "added") return { rank, shared, category, priority: shared ? "low" as const : "medium" as const, certainty: "suspected" as const, title: clip(`${mark}文字新增：${change.after!.str}`, 280), location: place,
      officialEvidence: "基準版這個位置沒有這段文字", workingEvidence: clip(change.after!.str, 1900), suggestion: shared ? COMMON_NOTE : "比對版新增的文字，請確認內容與位置正確。", officialBox: null, workingBox: textBox(change.after) };
    return { rank, shared, category, priority: "low" as const, certainty: "suspected" as const, title: clip(`${mark}文字移位：${change.after!.str}`, 280), location: place,
      officialEvidence: `${clip(change.before!.str, 1800)}（${describeCircuitDiffPlace(change.before!)}）`, workingEvidence: `${clip(change.after!.str, 1800)}（${place}）`, suggestion: shared ? COMMON_NOTE : "文字相同但位置不同，通常是圖面重排；請確認旁邊的接線沒有跟著改錯。", officialBox: textBox(change.before), workingBox: textBox(change.after) };
  });
  for (const area of grouping.areas) findings.push(...summarizeArea(area, diff, cross).map(finding => ({ ...finding, shared: false })));
  for (const region of grouping.regions) {
    const box = pad(region.box, 0.004);
    findings.push({ rank: 3, shared: false, category: "connectivity", priority: "medium", certainty: "unclear", title: region.faint ? "圖形有細微不同（接點或線段長短）" : "圖形改了（線條、接點或符號）", location: describeCircuitDiffPlace(region.box),
      officialEvidence: region.base ? "基準版這裡有比對版沒有的線條或圖形（見圖面標註）" : "基準版這裡沒有對應的線條",
      workingEvidence: region.work ? "比對版這裡有基準版沒有的線條或圖形（見圖面標註）" : "比對版這裡沒有對應的線條",
      suggestion: region.faint ? "兩版在這裡只差幾個像素，可能是多或少一個接點、線段長了或短了一點；請放大兩版核對接線。" : "文字沒有改，但圖形不同，可能是接線、接點或符號變更；請放大兩版核對。", officialBox: box, workingBox: box });
  }
  findings.sort((left, right) => left.rank - right.rank);
  const kept = findings.slice(0, limit);
  // Every kind of difference keeps at least one finding, so a full list never hides that the drawing changed too.
  for (const category of ["connectivity", "net-name", "label-name"] as const) {
    if (kept.some(item => item.category === category)) continue;
    const spare = findings.slice(limit).find(item => item.category === category);
    if (!spare) continue;
    // Give up the least telling finding of a kind that has several.
    for (let index = kept.length - 1; index >= 0; index--) {
      if (kept.filter(item => item.category === kept[index].category).length > 1) { kept[index] = spare; break; }
    }
  }
  return { findings: kept.map(({ rank: _rank, shared: _shared, ...finding }) => finding), omitted: findings.length - kept.length,
    common: findings.filter(item => item.shared).length, own: findings.filter(item => !item.shared).length, counts, ...(grouping.areas.length ? { areas: grouping.areas.length } : {}) };
}

/**
 * The few areas of a page worth showing a model enlarged: every difference with room around it, neighbours merged.
 * At most `max` areas; `dropped` counts differences outside them.
 */
export function circuitDiffWindows(boxes: readonly CircuitCropRect[], max = 4): { windows: CircuitCropRect[]; dropped: number } {
  const windows: Array<{ box: CircuitCropRect; count: number }> = [];
  for (const source of boxes) {
    const size = (length: number) => Math.min(1, Math.max(0.24, length + 0.12));
    const width = size(source.width), height = size(source.height);
    const x = Math.min(1 - width, Math.max(0, source.x + source.width / 2 - width / 2)), y = Math.min(1 - height, Math.max(0, source.y + source.height / 2 - height / 2));
    let merged = { box: { x, y, width, height }, count: 1 };
    for (let index = windows.length - 1; index >= 0; index--) {
      const other = windows[index].box, box = merged.box;
      if (box.x > other.x + other.width || other.x > box.x + box.width || box.y > other.y + other.height || other.y > box.y + box.height) continue;
      const left = Math.min(box.x, other.x), top = Math.min(box.y, other.y);
      merged = { box: { x: left, y: top, width: Math.max(box.x + box.width, other.x + other.width) - left, height: Math.max(box.y + box.height, other.y + other.height) - top }, count: merged.count + windows[index].count };
      windows.splice(index, 1);
      index = windows.length;
    }
    windows.push(merged);
  }
  windows.sort((left, right) => right.count - left.count);
  const kept = windows.slice(0, max);
  return { windows: kept.map(item => item.box).sort((left, right) => Math.abs(left.y - right.y) > 0.01 ? left.y - right.y : left.x - right.x), dropped: windows.slice(max).reduce((sum, item) => sum + item.count, 0) };
}
