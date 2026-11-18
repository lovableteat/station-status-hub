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

/** Matches the strings of two pages: the same string at the same place is unchanged; the rest is changed, removed, added or moved. */
export function diffCircuitPageTexts(beforeItems: readonly CircuitDiffText[], afterItems: readonly CircuitDiffText[]): { changes: CircuitTextChange[]; shift: { dx: number; dy: number } } {
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
  return { changes, shift };
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
}

const clip = (value: string, max = 180) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const textBox = (item: CircuitDiffText | undefined) => item ? pad({ x: item.x, y: item.y, width: Math.max(item.width, 0.006), height: Math.max(item.height, 0.006) }, 0.004) : null;
const COMMON_NOTE = "很多頁同一個圖框位置都有這個變更（通常是標題欄的日期、版次或頁數），確認一次即可。";

/** The differences of one page as findings a person can check, most telling first; at most `limit`. */
export function summarizeCircuitLocalDiff(diff: CircuitLocalPageDiff, common?: CircuitCommonChanges | null, limit = 40): CircuitLocalSummary {
  const counts = { changed: 0, removed: 0, added: 0, moved: 0, graphic: diff.regions.length };
  const order: Record<CircuitTextChangeKind, number> = { changed: 0, removed: 1, added: 2, moved: 4 };
  const findings: Array<CircuitLocalFinding & { rank: number; shared: boolean }> = diff.textChanges.map(change => {
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
  for (const region of diff.regions) {
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
    common: findings.filter(item => item.shared).length, own: findings.filter(item => !item.shared).length, counts };
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
