/**
 * Which page of the baseline PDF shows the same sheet as a page of the version being compared (AI 比對, 2026-11-13).
 *
 * A new version often inserts or drops a sheet, so "the same page number" stops matching halfway through the drawing. The
 * pages are matched by their text instead: words that are on almost every sheet (title block, grid letters) weigh nothing,
 * words found on few sheets (net names, reference designators, the sheet title) decide. The matching keeps the page order,
 * so repeated sheets (four connector pages that differ only in N1…N4) still pair in sequence. When the PDFs have no usable
 * text, or too few pages match, nothing is guessed and the same page number is used.
 *
 * On top of that the user can say "from this page on, page p is page q": a pin. It holds until the next pin or the next place
 * where the automatic matching changes its step, so fixing one shifted section never moves the pages before it.
 */

/** "From working page `from` on, the baseline page is `from + offset`." */
export interface CircuitAlignPin { from: number; offset: number }
export type CircuitAlignSource = "same" | "auto" | "pin" | "new";
export interface CircuitComparePage {
  /** The baseline page to show, 0 when there is none. */
  page: number;
  /** Baseline page minus working page; null when the working page is a sheet the baseline does not have. */
  offset: number | null;
  /** same: the same page number; auto: matched by content; pin: set by the user; new: a sheet only the working version has. */
  source: CircuitAlignSource;
}

/** Above this many pages the text of both PDFs is not read; the pages then keep the same numbers (pins still work). */
export const CIRCUIT_ALIGN_MAX_PAGES = 300;
const MATCH = 0.12;
const LOOSE = 0.03;
const NOISE = /^[\p{P}\p{S}]+$/u;

/** The distinct words of one page, upper-cased, without punctuation-only marks. */
export function circuitPdfPageTokens(strings: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of strings) for (const raw of String(value).split(/\s+/)) {
    const token = raw.trim().toUpperCase();
    if (token && !NOISE.test(token)) tokens.add(token);
  }
  return [...tokens];
}

/**
 * For every page of `work`, the 1-based page of `base` showing the same sheet, or null for a sheet only `work` has.
 * Returns null when there is not enough text to tell (the caller then keeps the same page numbers).
 */
export function alignCircuitPdfPages(base: readonly (readonly string[])[], work: readonly (readonly string[])[]): Array<number | null> | null {
  const m = base.length, n = work.length;
  if (!m || !n) return null;
  const readable = (pages: readonly (readonly string[])[]) => pages.filter(page => page.length >= 3).length;
  if (readable(base) < m / 2 || readable(work) < n / 2) return null;
  const frequency = new Map<string, number>();
  for (const page of [...base, ...work]) for (const token of page) frequency.set(token, (frequency.get(token) || 0) + 1);
  const total = m + n;
  const vector = (page: readonly string[]) => {
    const weights = new Map<string, number>();
    let length = 0;
    for (const token of page) {
      const weight = Math.log(total / (frequency.get(token) || total));
      if (weight <= 1e-9) continue;
      weights.set(token, weight); length += weight * weight;
    }
    length = Math.sqrt(length);
    if (length) for (const [token, weight] of weights) weights.set(token, weight / length);
    return weights;
  };
  const baseVectors = base.map(vector);
  const index = new Map<string, Array<[number, number]>>();
  baseVectors.forEach((weights, i) => { for (const [token, weight] of weights) { let list = index.get(token); if (!list) index.set(token, list = []); list.push([i, weight]); } });
  const similarity = work.map(page => {
    const row = new Float64Array(m);
    for (const [token, weight] of vector(page)) for (const [i, other] of index.get(token) || []) row[i] += weight * other;
    return row;
  });
  const map: Array<number | null> = new Array(n).fill(null);
  // Strict pass over everything, then a looser pass inside each gap between matched pages, then same-sized gaps pair in order
  // (a heavily redrawn sheet between two matched ones is still the same sheet).
  matchInOrder(similarity, map, 0, n, 0, m, MATCH);
  forEachGap(map, m, (j0, j1, i0, i1) => matchInOrder(similarity, map, j0, j1, i0, i1, LOOSE));
  // Two unrelated drawings share almost nothing: then the content says nothing and no order is guessed either.
  if (map.filter(value => value !== null).length < Math.min(m, n) / 2) return null;
  forEachGap(map, m, (j0, j1, i0, i1) => { if (j1 - j0 === i1 - i0) for (let k = 0; k < j1 - j0; k++) map[j0 + k] = i0 + k + 1; });
  return map;
}

/** Order-keeping best matching of work pages [j0, j1) to base pages [i0, i1) (0-based), written into `map` as 1-based pages. */
function matchInOrder(similarity: Float64Array[], map: Array<number | null>, j0: number, j1: number, i0: number, i1: number, threshold: number) {
  const rows = j1 - j0, cols = i1 - i0;
  if (rows <= 0 || cols <= 0) return;
  const score = new Float64Array((rows + 1) * (cols + 1));
  const step = new Uint8Array((rows + 1) * (cols + 1)); // 1: skip a work page, 2: skip a base page, 3: match
  const at = (r: number, c: number) => r * (cols + 1) + c;
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    let best = score[at(r - 1, c)], choice = 1;
    if (score[at(r, c - 1)] > best) { best = score[at(r, c - 1)]; choice = 2; }
    const value = similarity[j0 + r - 1][i0 + c - 1];
    if (value >= threshold && score[at(r - 1, c - 1)] + value > best) { best = score[at(r - 1, c - 1)] + value; choice = 3; }
    score[at(r, c)] = best; step[at(r, c)] = choice;
  }
  for (let r = rows, c = cols; r > 0 && c > 0;) {
    const choice = step[at(r, c)];
    if (choice === 3) { map[j0 + r - 1] = i0 + c; r--; c--; }
    else if (choice === 1) r--;
    else c--;
  }
}

/** Calls `visit(j0, j1, i0, i1)` for every run of unmatched work pages and the base pages between the same two matches. */
function forEachGap(map: Array<number | null>, baseCount: number, visit: (j0: number, j1: number, i0: number, i1: number) => void) {
  let lastWork = -1, lastBase = 0;
  for (let j = 0; j <= map.length; j++) {
    const value = j < map.length ? map[j] : baseCount + 1;
    if (value === null) continue;
    if (j - lastWork > 1 && value - 1 - lastBase > 0) visit(lastWork + 1, j, lastBase, value - 1);
    lastWork = j; lastBase = value;
  }
}

/** Per working page (index page − 1): baseline page minus working page, or null for a sheet only the working version has. */
export function circuitAlignOffsets(map: ReadonlyArray<number | null>): Array<number | null> {
  return map.map((value, index) => value === null ? null : value - (index + 1));
}

const pinFor = (pins: readonly CircuitAlignPin[], page: number) => {
  let found: CircuitAlignPin | null = null;
  for (const pin of pins) if (pin.from <= page && (!found || pin.from > found.from)) found = pin;
  return found;
};

/** The baseline page for a working page, from the automatic offsets (null: not known, same numbers) and the user's pins. */
export function resolveCircuitComparePage(page: number, comparePages: number, auto: ReadonlyArray<number | null> | null, pins: readonly CircuitAlignPin[]): CircuitComparePage {
  const autoAt = (target: number): number | null => auto && target >= 1 && target <= auto.length ? auto[target - 1] : 0;
  const pin = pinFor(pins, page);
  let usePin = Boolean(pin);
  if (pin && auto) for (let target = pin.from + 1; target <= page; target++) if (autoAt(target) !== autoAt(target - 1)) { usePin = false; break; }
  const offset = usePin && pin ? pin.offset : autoAt(page);
  const source: CircuitAlignSource = usePin ? "pin" : offset === null ? "new" : offset !== 0 ? "auto" : "same";
  const target = offset === null ? 0 : page + offset;
  return { page: target >= 1 && target <= comparePages ? target : 0, offset, source };
}

/** Pins with "from page `from` on, use `offset`" added (replacing a pin on the same page). */
export function setCircuitAlignPin(pins: readonly CircuitAlignPin[], from: number, offset: number): CircuitAlignPin[] {
  return [...pins.filter(pin => pin.from !== from), { from, offset }].sort((a, b) => a.from - b.from);
}

/** Pins without the one that decides `page`. */
export function clearCircuitAlignPin(pins: readonly CircuitAlignPin[], page: number): CircuitAlignPin[] {
  const pin = pinFor(pins, page);
  return pin ? pins.filter(item => item !== pin) : [...pins];
}

/** The same pins seen from the other side, after the two versions swap places. */
export function invertCircuitAlignPins(pins: readonly CircuitAlignPin[]): CircuitAlignPin[] {
  return pins.map(pin => ({ from: pin.from + pin.offset, offset: -pin.offset })).filter(pin => pin.from >= 1).sort((a, b) => a.from - b.from);
}

/** Pins read back from storage: whole numbers only, at most one per page. */
export function normalizeCircuitAlignPins(value: unknown): CircuitAlignPin[] {
  if (!Array.isArray(value)) return [];
  const pins = value.filter((pin): pin is CircuitAlignPin => Boolean(pin) && Number.isInteger(pin.from) && pin.from >= 1 && Number.isInteger(pin.offset) && Math.abs(pin.offset) < 10000);
  return pins.reduce<CircuitAlignPin[]>((all, pin) => setCircuitAlignPin(all, pin.from, pin.offset), []).slice(0, 500);
}

/** The words of every page of a PDF, one page at a time so drawing pages are not held up; stops when `signal` aborts. */
export async function readCircuitPdfPageTokens(pdf: { numPages: number; getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }, signal: AbortSignal): Promise<string[][]> {
  const pages: string[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push(circuitPdfPageTokens(content.items.map(item => typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : "")));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pages;
}
