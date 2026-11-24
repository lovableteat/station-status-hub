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
/**
 * `kind` (2026-11-25, the real E1.S pair): "annotation" when what differs is coloured ink on an otherwise grey sheet (a
 * dashed box or note someone drew), "frame" when it is something that did not move while the rest of the sheet did (the
 * border and title block of a sheet whose content was shifted). Neither is a change of the circuit.
 */
export interface CircuitGraphicRegion { box: CircuitCropRect; base: boolean; work: boolean; faint?: boolean; kind?: "annotation" | "frame" | "nudged" }
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
  /** Parts on both sides whose value label differs (R3410: 2.21KΩ → 100KΩ), whichever way the page was compared. */
  valueChanges?: CircuitValueChange[];
  /** Values printed more often on one side (how many parts carry each), whichever way the page was compared. */
  valueCounts?: CircuitContentChange[];
  /** Page numbers compared, for looking up a Ref Des or net that moved to another sheet. */
  pages?: { base: number; work: number };
  /** The Ref Des and net names of each side, for the same look-up across sheets. */
  contents?: { base: string[]; work: string[] };
  /** Where each side's title block is (findCircuitTitleBlock); absent: only the far corner counts. */
  titleBlock?: { base: CircuitCropRect | null; work: CircuitCropRect | null };
}
export type CircuitContentType = "refdes" | "net" | "other";
/** One word one side has more often than the other; `item` is where it is on the side that has it. */
export interface CircuitContentChange {
  side: "base" | "work"; token: string; type: CircuitContentType; count: number; item?: CircuitDiffText;
  /** Every occurrence the other side lacks is in the frame (title block, border): not part of the circuit. */
  frame?: boolean;
  /**
   * How the other side writes the same name (U4401 for U4401A, VSS for VSS_1, OE3# for ^OE3#): not a difference, listed
   * once for reference. `token` is then how this side writes it.
   */
  alias?: string;
  /** A value (resistance, capacitance, not fitted) drawn more often on this side: `count` more parts carry it. */
  value?: boolean;
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
  let before = clean(beforeItems), after = clean(afterItems);
  // A drawing that prints no part-number lines (a redraw that shows values) is not missing the other side's.
  const numbered = (items: readonly CircuitDiffText[]) => items.some(item => CIRCUIT_PART_NUMBER_LINE.test(item.str));
  if (numbered(before) !== numbered(after)) { before = before.filter(item => !CIRCUIT_PART_NUMBER_LINE.test(item.str)); after = after.filter(item => !CIRCUIT_PART_NUMBER_LINE.test(item.str)); }
  const shift = commonShift(before, after);
  const position = (item: CircuitDiffText, shifted: boolean) => { const point = center(item); return shifted ? { x: point.x + shift.dx, y: point.y + shift.dy } : point; };
  // The same value or part written another way (10KR2F-2-GP and 10KOhm) is the same text (circuitLabelKey).
  const group = (items: CircuitDiffText[]) => { const map = new Map<string, CircuitDiffText[]>(); for (const item of items) { const key = textKey(item.str), list = map.get(key); if (list) list.push(item); else map.set(key, [item]); } return map; };
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
    // The same part with an ordering suffix on one side is the same text.
    if (!samePart(removed[pair.r].str, added[pair.a].str)) changes.push({ kind: "changed", before: removed[pair.r], after: added[pair.a] });
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
/**
 * Letters that look like a Ref Des with a number but are pin names, buses or standards (GPIO0–GPIO15 on an IC, VDD1,
 * PCIE5, I2C). On the real E1.S redraw, GPIO0–GPIO15 were listed as 16 missing parts (2026-11-24).
 */
const NOT_REFDES = new Set(["GPIO", "GPI", "GPO", "ADC", "DAC", "AIN", "AOUT", "PWM", "PIO", "MIO", "IO", "PIN", "TXD", "RXD", "SDA", "SCL", "CLK", "DQ", "DQS", "VDD", "VCC", "VSS", "VIO", "AVDD", "DVDD", "GND", "NC", "LANE", "PORT", "GEN", "DDR", "USB", "PCIE", "SATA", "HDMI", "SPI", "SMB", "BANK", "EP", "LX", "I"]);
/**
 * Pin and part names that look like net names, as one library or another writes them (the real E1.S redraw, 2026-11-24):
 * a pin with two functions (GND/PG, A0/NC, OE3#/SMB_CLK), a pin with a note (VDD(I2C-bus)), a pin number in front
 * (9_THM), no-connect pins (NC#35, NC_1), the exposed pad (THERMAL_PAD) and a part body with its pin count (WAFER_HD_2P).
 */
const PIN_NAME = /[/()]|^\d+_|^NC([#_.]?\d+)?$|^(THERMAL|EXPOSED)_?PAD|_\d+P$/;
/** What a word on a sheet is: a reference designator (location), a net name, or another word (value, pin name, note). */
export function circuitTokenType(token: string): CircuitContentType | null {
  const word = token.trim().toUpperCase();
  if (word.length < 2 || !/[A-Z]/.test(word) || /^\d+(?:\.\d+)?$/.test(word)) return null;
  if (REFDES.test(word) && !NOT_REFDES.has(word.match(/^[A-Z]+/)![0])) return "refdes";
  return NET.test(word) && !PIN_NAME.test(word) ? "net" : "other";
}

/**
 * A word as a name to compare, written one way for both versions (2026-11-24, the real E1.S redraw): a part drawn in
 * sections is one part (U4401A and U4401B are U4401), and the pull-up / pull-down marks some datasheets put before a pin
 * name are left off (^OE3#/SMB_CLK is OE3#/SMB_CLK, vZOUT_SEL is ZOUT_SEL).
 */
export function circuitNameKey(word: string): { key: string; type: CircuitContentType } | null {
  const bare = word.trim().replace(/^\^+/, "").replace(/^v(?=[A-Z^])/, "").replace(/^\^+/, "");
  const type = circuitTokenType(bare);
  if (!type) return null;
  if (type === "other") return { key: circuitLabelKey(bare).toUpperCase(), type };
  const key = bare.toUpperCase();
  return { key: type === "refdes" ? key.replace(/^([A-Z]{1,4}\d{1,5})[A-Z]$/, "$1") : key, type };
}

/** An internal part-number line printed under a part (032-0793-000, 078.10622.M039): compared only when both drawings print them. */
export const CIRCUIT_PART_NUMBER_LINE = /^\d{3}-\d{4}-\d{3}$|^\d{2,3}\.[0-9A-Z]{4,5}\.[0-9A-Z]{2,4}$/;
const FARAD: Record<string, number> = { P: 1, N: 1e3, U: 1e6, "µ": 1e6 };
const decimal = (text: string) => Number(text.replace(/^D/, "0.").replace(/D/, "."));
const precise = (value: number) => Number(value.toPrecision(6));
const ohms = (text: string) => {
  if (text.startsWith("D")) return decimal(text);
  const unit = /[KM]/.exec(text)?.[0];
  if (!unit) return Number(text);
  const [whole, fraction] = text.split(unit);
  return Number(`${whole}.${fraction || 0}`) * (unit === "K" ? 1e3 : 1e6);
};
/**
 * A value or part label written one way (2026-11-25, the real E1.S redraw): the reference prints part codes, a redraw
 * often prints the value. 10KR2F-2-GP and 10KOhm are both a 10 kΩ resistor, SCD1U16V2KX-1 and 0.1uF/16V a 0.1 µF / 16 V
 * capacitor, NOPOP and NI a part not fitted, XTAL-24MHZ-289-GP and 24MHZ a 24 MHz crystal, TS3USB221RSER-GP-U1 and
 * TS3USB221RSER the same part. Anything else comes back as written.
 */
export function circuitLabelKey(word: string): string {
  const text = word.trim();
  let match = /^(D\d+|\d+[KM]\d*|\d+)R\d[A-Z](?:-|$)/.exec(text);
  if (match) return `R:${precise(ohms(match[1]))}`;
  match = /^(\d+(?:\.\d+)?)([kKmM]?)(?:ohm|OHM|Ohm|Ω)$/.exec(text);
  if (match) return `R:${precise(Number(match[1]) * ({ k: 1e3, K: 1e3, M: 1e6, m: 1e-3 }[match[2]] ?? 1))}`;
  match = /^SC(D?\d+(?:D\d+)?)([UPN])(\d+(?:D\d+)?)V\d[A-Z]{1,2}(?:-|$)/.exec(text);
  if (match) return `C:${precise(decimal(match[1]) * FARAD[match[2]])}/${decimal(match[3])}V`;
  match = /^(\d+(?:\.\d+)?)([uUpPnNµ])F\/(\d+(?:\.\d+)?)V$/.exec(text);
  if (match) return `C:${precise(Number(match[1]) * FARAD[match[2] === "µ" ? "µ" : match[2].toUpperCase()])}/${Number(match[3])}V`;
  if (/^(NOPOP|NI|DNP|DNI)$/i.test(text)) return "DNP";
  match = /(?:^|-)(\d+(?:\.\d+)?)MHZ(?:-|$)/i.exec(text);
  if (match) return `F:${Number(match[1])}MHZ`;
  if (/-GP(?:-U\d*)?$|-HF$/.test(text)) return text.toUpperCase().replace(/(?:-\d+)?-GP(?:-U\d*)?$|-HF$/, "");
  return text;
}
/** A string with every value or part label written one way (see circuitLabelKey); names keep their case. */
const textKey = (text: string) => text.split(" ").map(circuitLabelKey).join(" ");
/** The same part number with an ordering suffix on one side (PCA6408AHKX and PCA6408AHK, 74LVC1G07GW-125 and 74LVC1G07GW). */
const samePart = (left: string, right: string) => {
  const a = textKey(left).toUpperCase(), b = textKey(right).toUpperCase(), [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return /^[A-Z0-9][A-Z0-9-]{5,}$/.test(short) && /\d/.test(short) && long.startsWith(short) && long.length - short.length <= 4;
};
/** How a value key reads: R:4700 is 4.7KΩ, C:100000/16V is 0.1µF/16V. */
export function describeCircuitValue(key: string): string {
  const number = (value: number) => String(precise(value));
  if (key === "DNP") return "不上件（NOPOP／NI）";
  let match = /^R:(.+)$/.exec(key);
  if (match) { const value = Number(match[1]); return value >= 1e6 ? `${number(value / 1e6)}MΩ` : value >= 1e3 ? `${number(value / 1e3)}KΩ` : value < 1 && value > 0 ? `${number(value * 1e3)}mΩ` : `${number(value)}Ω`; }
  match = /^C:([^/]+)\/(.+)$/.exec(key);
  if (match) { const value = Number(match[1]); return `${value >= 1e5 ? `${number(value / 1e6)}µF` : value >= 1e3 ? `${number(value / 1e3)}nF` : `${number(value)}pF`}/${match[2]}`; }
  match = /^F:(.+)$/.exec(key);
  return match ? match[1] : key;
}
const isValueKey = (key: string) => /^(R:|C:|F:)|^DNP$/.test(key);

/** A part whose value label differs between the two drawings: what each side prints next to the same Ref Des. */
export interface CircuitValueChange {
  refdes: string; before: string[]; after: string[]; baseItem?: CircuitDiffText; workItem?: CircuitDiffText;
  /** Fitted or not changed: the side that marks the part(s) not fitted (`refdes` may name two parts a mark lies between). */
  fitted?: "base" | "work";
  /**
   * The parts are a best guess (a mark far from its part, or the other drawing places its marks so loosely that "no mark
   * beside it" cannot be sure): named as "maybe" in the count of not-fitted marks, never a finding of its own.
   */
  unsure?: boolean;
}
/** Which Ref Des a value can belong to: a resistance to a resistor, a capacitance to a capacitor, a frequency to a crystal. */
const VALUE_PART: Record<string, RegExp> = { R: /^(P?R|RN|RA|RP|RT|PR)\d/, C: /^(P?C|EC|CE|PC)\d/, F: /^(X|Y|OSC)\d/, D: /^[A-Z]{1,4}\d/ };
/** How near (page fractions, box to box) a value label must be to the Ref Des it belongs to: labels sit right beside their part. */
const VALUE_REACH = 0.015;
/**
 * The values of the parts on two sheets, part by part (2026-11-25, the real E1.S pair: four resistors 2.21KΩ → 100KΩ,
 * two capacitors 25 V → 16 V, four pull-ups 9.1K → 4.7K, whatever the sheet or block was redrawn). Each value label
 * (written one way, see circuitLabelKey) belongs to the nearest Ref Des of a matching kind on the same sheet; a part that
 * has values on both sides and different ones is a change. A part with no value found on one side is left out: a label
 * placed far away is not proof that the value is missing.
 */
export function diffCircuitPartValues(beforeItems: readonly CircuitDiffText[], afterItems: readonly CircuitDiffText[]): CircuitValueChange[] {
  const read = (items: readonly CircuitDiffText[]) => {
    const parts: Array<{ refdes: string; item: CircuitDiffText; at: { x: number; y: number } }> = [], values: Array<{ key: string; item: CircuitDiffText; at: { x: number; y: number } }> = [];
    for (const item of items) {
      const at = center(item);
      for (const word of collapse(item.str).split(" ")) {
        const name = circuitNameKey(word);
        if (!name) continue;
        if (name.type === "refdes") parts.push({ refdes: name.key, item, at });
        else if (isValueKey(name.key)) values.push({ key: name.key, item, at });
      }
    }
    // A label and a part belong together only when each is the other's nearest of its kind (a value and a not-fitted mark
    // are separate kinds): a label between two parts is left out rather than given to the wrong one (2026-11-25: C4602 got
    // its neighbour's 100nF on the real E1.S pair).
    const slot = (key: string) => key === "DNP" ? "DNP" : "value";
    // Box to box: a value printed as a long vertical string under its part is near it at one end, not at its middle.
    const gap = (a: CircuitDiffText, b: CircuitDiffText) => Math.hypot(Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width)), Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height)));
    // How far this drawing prints labels from their parts, measured on the sheet (2026-11-25: the reference prints them
    // 0.8 % away, the redraw 3–5 % away on some sheets): twice and a half the usual gap, within 1.5–6 % of the page.
    const usual = values.map(value => { const fits = VALUE_PART[value.key[0]] ?? VALUE_PART.D; return Math.min(...parts.filter(part => fits.test(part.refdes)).map(part => gap(part.item, value.item))); }).filter(distance => distance < 0.08).sort((left, right) => left - right);
    const reach = Math.min(0.06, Math.max(VALUE_REACH, (usual[Math.floor(usual.length / 2)] ?? 0.006) * 2.5));
    // Not-fitted marks have their own place (the redraw prints NI under the value, 4–5 % from the part): measured apart.
    const markGaps = values.filter(value => value.key === "DNP").map(value => Math.min(...parts.map(part => gap(part.item, value.item)))).filter(distance => distance < 0.08).sort((left, right) => left - right);
    const markReach = Math.min(0.07, Math.max(VALUE_REACH, (markGaps[Math.floor(markGaps.length / 2)] ?? 0.006) * 1.6));
    // Clearly nearest: a label about as near to a second part (two resistors stacked, one NOPOP between them) is left out.
    const nearestPart = values.map(value => {
      const fits = VALUE_PART[value.key[0]] ?? VALUE_PART.D;
      let best = -1, distance = Infinity, second = Infinity;
      parts.forEach((part, index) => { if (!fits.test(part.refdes)) return; const d = gap(part.item, value.item); if (d < distance) { second = distance; distance = d; best = index; } else if (d < second) second = d; });
      return distance < reach && second >= Math.max(distance * 1.5, distance + 0.003) ? best : -1;
    });
    const map = new Map<string, { values: Map<string, string>; item: CircuitDiffText; part: CircuitDiffText; markNear: boolean }>();
    parts.forEach((part, p) => {
      for (const kind of ["value", "DNP"]) {
        let best = -1, distance = Infinity;
        values.forEach((value, v) => { if (slot(value.key) !== kind || nearestPart[v] !== p) return; const d = gap(part.item, value.item); if (d < distance) { distance = d; best = v; } });
        if (best < 0) continue;
        // Mutual: no other label of this kind is nearer to the part (one that chose another part included).
        const closer = values.some((value, v) => v !== best && slot(value.key) === kind && (VALUE_PART[value.key[0]] ?? VALUE_PART.D).test(part.refdes) && gap(part.item, value.item) < distance);
        if (closer) continue;
        const entry = map.get(part.refdes) ?? { values: new Map<string, string>(), item: values[best].item, part: part.item, markNear: false };
        entry.values.set(kind, values[best].key); map.set(part.refdes, entry);
      }
      // Any not-fitted mark beside the part, whoever it was given to: without one, the part is certainly fitted on this side.
      const entry = map.get(part.refdes);
      if (entry) entry.markNear = values.some(value => value.key === "DNP" && gap(part.item, value.item) < markReach);
    });
    // Every not-fitted mark with the parts it lies beside: the nearest, and any about as near (two resistors stacked).
    const marks = values.map((mark, index) => ({ mark, index })).filter(({ mark }) => mark.key === "DNP").map(({ mark }) => {
      // A mark printed right under a value belongs to that value's part (the redraw prints NI below the value).
      let owner = -1, closest = 0.012;
      values.forEach((value, v) => { if (value.key === "DNP" || nearestPart[v] < 0) return; const d = gap(value.item, mark.item); if (d < closest) { closest = d; owner = nearestPart[v]; } });
      if (owner >= 0) return { item: mark.item, candidates: [parts[owner].refdes], sure: true };
      const near = parts.map(part => ({ refdes: part.refdes, d: gap(part.item, mark.item) })).filter(entry => entry.d < markReach).sort((left, right) => left.d - right.d);
      const nearest = near[0]?.d ?? Infinity;
      return { item: mark.item, candidates: [...new Set(near.filter(entry => entry.d < Math.max(nearest * 1.5, nearest + 0.003)).map(entry => entry.refdes))].slice(0, 3), sure: nearest <= VALUE_REACH };
    }).filter(mark => mark.candidates.length);
    const named = new Map(parts.map(part => [part.refdes, part.item]));
    // Marked: a mark that may belong to the part (an unclear one counts for each part it lies between), or one right beside it.
    const markedNear = (refdes: string) => { const item = named.get(refdes); return Boolean(item) && (marks.some(mark => mark.candidates.includes(refdes)) || values.some(value => value.key === "DNP" && gap(item!, value.item) < VALUE_REACH)); };
    // Every mark on this side surely belongs to its part(s): only then is "no mark beside that part" sure here.
    return { map, marks, named, markedNear, marking: values.some(value => value.key === "DNP"), certain: marks.every(mark => mark.sure), markCount: values.filter(value => value.key === "DNP").length };
  };
  const before = read(beforeItems), after = read(afterItems), changes: CircuitValueChange[] = [];
  // Values where both sides print one for the same part.
  for (const [refdes, old] of before.map) {
    const now = after.map.get(refdes);
    const oldValue = old.values.get("value"), newValue = now?.values.get("value");
    if (now && oldValue && newValue && oldValue !== newValue) changes.push({ refdes, before: [oldValue], after: [newValue], baseItem: old.item, workItem: now.item });
  }
  // Fitted or not: a mark beside a part (or between two) on one side, and none beside the same parts on the other, which
  // does mark parts not fitted elsewhere on the sheet (2026-11-25, the real E1.S pair: beads and a choke NOPOP in the
  // reference, printed 120Ω / 90Ω with no NI in the redraw; a NOPOP between two stacked resistors). An NI about as near to
  // the transistor next door is still a mark beside the part, so that part did not change.
  for (const [side, own, other] of [["base", before, after], ["work", after, before]] as const) {
    if (!other.marking) continue;
    const groups = new Map<string, { parts: string[]; marks: number; item: CircuitDiffText; sure: boolean }>();
    for (const mark of own.marks) {
      if (!mark.candidates.every(refdes => other.named.has(refdes)) || mark.candidates.some(refdes => other.markedNear(refdes))) continue;
      const parts = [...mark.candidates].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), key = parts.join("|");
      const group = groups.get(key) ?? { parts, marks: 0, item: mark.item, sure: true };
      group.marks++; group.sure &&= mark.sure; groups.set(key, group);
    }
    for (const group of groups.values()) {
      // As many marks as parts between them: every one of them is marked (R1418 and R1419, each with its NOPOP).
      const refdes = group.marks >= group.parts.length ? group.parts.join("、") : group.parts.join(" 或 ");
      const count = Math.min(group.marks, group.parts.length);
      const unsure = !group.sure || !other.certain;
      changes.push({ refdes, before: side === "base" ? Array(count).fill("DNP") : [], after: side === "work" ? Array(count).fill("DNP") : [], fitted: side, ...(unsure ? { unsure: true } : {}),
        ...(side === "base" ? { baseItem: group.item, workItem: other.named.get(group.parts[0]) } : { workItem: group.item, baseItem: other.named.get(group.parts[0]) }) });
    }
  }
  // The parts named for sure must add up to how many more marks one side prints; otherwise a mark was given to the wrong
  // part (the redraw's NI for R3001 was nearer a neighbour), and every fitted change is only a guess.
  const named = (side: "base" | "work") => changes.filter(change => change.fitted === side && !change.unsure).reduce((sum, change) => sum + (side === "base" ? change.before.length : change.after.length), 0);
  if (named("base") - named("work") !== before.markCount - after.markCount) for (const change of changes) if (change.fitted) change.unsure = true;
  return changes.sort((left, right) => left.refdes.localeCompare(right.refdes, undefined, { numeric: true }));
}
/**
 * The values no part-by-part change explains (see diffCircuitPartValues): a clean swap of one value for another, as many
 * parts each way (four 9.1K for four 4.7K, one of them too far from its Ref Des to pair), is a change of those parts and
 * counted; anything else (a part code not read as a value, labels missing on one side) is listed for reference.
 */
function valueCountFindings(diff: CircuitLocalPageDiff): Array<CircuitLocalFinding & { rank: number; own: boolean }> {
  const left = new Map<string, number>();
  const add = (key: string, by: number) => left.set(key, (left.get(key) ?? 0) + by);
  for (const change of diff.valueCounts ?? []) add(change.token, change.side === "base" ? change.count : -change.count);
  // Each part-by-part change already says one part each way (a guess does not: it only names parts below).
  for (const change of diff.valueChanges ?? []) { if (change.unsure) continue; for (const key of change.before) add(key, -1); for (const key of change.after) add(key, 1); }
  const guesses = (side: "base" | "work") => [...new Set((diff.valueChanges ?? []).filter(change => change.unsure && change.fitted === side).map(change => change.refdes))];
  const kinds: Record<string, string> = { R: "電阻", C: "電容", F: "晶振", D: "不上件標示" };
  const findings: Array<CircuitLocalFinding & { rank: number; own: boolean }> = [];
  for (const [kind, words] of Object.entries(kinds)) {
    const entries = [...left].filter(([key, count]) => key[0] === kind && count !== 0);
    if (!entries.length) continue;
    const base = entries.filter(([, count]) => count > 0), work = entries.filter(([, count]) => count < 0);
    const item = (key: string, side: "base" | "work") => (diff.valueCounts ?? []).find(change => change.token === key && change.side === side)?.item;
    if (kind === "D") {
      // Not-fitted marks: one per part, so how many more one side prints is how many parts differ, sure even when which
      // ones is not (2026-11-25, the real E1.S pair: every page where the counts differed had that many parts changed).
      const total = entries.reduce((sum, [, count]) => sum + count, 0);
      if (!total) continue;
      const side = total > 0 ? "base" : "work", count = Math.abs(total), maybe = guesses(side);
      findings.push({ rank: 0, own: true, category: "label-name", priority: "high", certainty: "unclear",
        title: clip(`${count} 顆零件的上件狀態不一樣：${side === "base" ? "基準版" : "比對版"}多 ${count} 個不上件標示（NOPOP／NI）${maybe.length ? `，可能是 ${maybe.slice(0, 6).join("、")}` : ""}`, 280), location: "這一頁的零件標示",
        officialEvidence: side === "base" ? `基準版這一頁多 ${count} 個不上件標示` : "基準版這一頁的不上件標示比較少", workingEvidence: side === "work" ? `比對版這一頁多 ${count} 個不上件標示` : "比對版這一頁的不上件標示比較少",
        suggestion: `${side === "base" ? "基準版" : "比對版"}這一頁多標了 ${count} 個不上件（NOPOP／NI），另一版對應的零件沒有標，裝不裝會不一樣。${maybe.length ? `最可能是 ${maybe.slice(0, 6).join("、")}，` : ""}請在圖上核對。`, officialBox: null, workingBox: null });
      continue;
    }
    if (base.length === 1 && work.length === 1 && base[0][1] === -work[0][1]) {
      const count = base[0][1], from = describeCircuitValue(base[0][0]), to = describeCircuitValue(work[0][0]);
      findings.push({ rank: 0, own: true, category: "label-name", priority: "high", certainty: "suspected",
        title: clip(`${count} 顆${words}的數值不一樣：${from} → ${to}（標示離零件編號太遠，沒有逐顆對到）`, 280), location: "這一頁的零件標示",
        officialEvidence: `基準版這一頁多 ${count} 個 ${from}`, workingEvidence: `比對版這一頁多 ${count} 個 ${to}`,
        suggestion: `兩版這一頁剛好有 ${count} 個 ${from} 換成 ${to}，但標示離零件編號太遠，沒辦法確定是哪幾顆。請在圖上找 ${to} 的零件核對。`, officialBox: textBox(item(base[0][0], "base")), workingBox: textBox(item(work[0][0], "work")) });
      continue;
    }
    const side = (list: typeof entries) => list.map(([key, count]) => `${describeCircuitValue(key)} 多 ${Math.abs(count)} 個`).join("、");
    findings.push({ rank: 7, own: false, category: "label-name", priority: "low", certainty: "unclear",
      title: clip(`${CIRCUIT_FOR_REFERENCE}${words}的標示數量不一樣（沒有對到同一個零件編號）：${base.length ? `基準版 ${side(base)}` : "基準版沒有多的"}；${work.length ? `比對版 ${side(work)}` : "比對版沒有多的"}`, 280), location: "這一頁的零件標示",
      officialEvidence: base.length ? `基準版這一頁 ${side(base)}` : "基準版沒有多出來的數值", workingEvidence: work.length ? `比對版這一頁 ${side(work)}` : "比對版沒有多出來的數值",
      suggestion: "這些數值在兩版的數量不一樣，但沒有對到同一個零件編號（可能是料號寫法沒換算成數值，例如磁珠、共模電感，或標示離零件太遠）。逐顆比對得到的差異已經另外列出。", officialBox: null, workingBox: null });
  }
  return findings;
}
/** The findings of value changes: one per part, most telling (a value, not only fitted or not) first. */
function valueFindings(changes: readonly CircuitValueChange[]): Array<CircuitLocalFinding & { rank: number }> {
  const words = (keys: readonly string[]) => keys.map(describeCircuitValue).join("、");
  return changes.filter(change => !change.unsure).map(change => ({ rank: 0, category: "label-name" as const, priority: "high" as const, certainty: "suspected" as const,
    title: clip(change.fitted ? `${change.refdes} 的上件狀態不一樣：${change.fitted === "base" ? "基準版標不上件（NOPOP／NI），比對版旁邊沒有標" : "比對版標不上件（NOPOP／NI），基準版旁邊沒有標"}` : `${change.refdes} 的數值不一樣：${words(change.before)} → ${words(change.after)}`, 280),
    location: change.workItem ? describeCircuitDiffPlace(change.workItem) : change.baseItem ? describeCircuitDiffPlace(change.baseItem) : "這一頁",
    officialEvidence: change.fitted ? (change.fitted === "base" ? `${change.refdes} 旁邊標了不上件` : `${change.refdes} 旁邊沒有不上件的標示`) : `${change.refdes}：${words(change.before)}（${change.baseItem?.str ?? ""}）`,
    workingEvidence: change.fitted ? (change.fitted === "work" ? `${change.refdes} 旁邊標了不上件` : `${change.refdes} 旁邊沒有不上件的標示`) : `${change.refdes}：${words(change.after)}（${change.workItem?.str ?? ""}）`,
    suggestion: change.fitted ? "一邊標了這顆零件不上件，另一邊同樣的零件旁邊沒有標，裝不裝會不一樣。請確認哪一版才對。" : "同一顆零件兩版標的數值不一樣（料號和數值兩種寫法已經換算成同一種再比）。請確認是故意改的值，還是標錯了。",
    officialBox: textBox(change.baseItem), workingBox: textBox(change.workItem) }));
}

/**
 * The words of a page, each marked when it sits in the frame (title block, border). Frame words still count, so a word
 * drawn just inside the frame on one sheet and just outside it on the other is not a difference.
 */
function pageTokens(items: readonly CircuitDiffText[]) {
  const tokens: Array<{ token: string; raw: string; type: CircuitContentType; item: CircuitDiffText; frame: boolean }> = [];
  for (const item of items) {
    const frame = inFrame(center(item));
    for (const word of collapse(item.str).split(" ")) {
      const name = circuitNameKey(word);
      if (name) tokens.push({ token: name.key, raw: word.toUpperCase(), type: name.type, item, frame });
    }
  }
  return tokens;
}

/**
 * Compares two sheets by what is on them, not where: every Ref Des, net name and other word only one side has. How often
 * a name is drawn does not count (a redraw puts a GND or a net label down as often as it likes). On a redrawn sheet this
 * is what can be trusted: a missing part or a renamed net, wherever it was drawn.
 */
export function diffCircuitPageContents(beforeItems: readonly CircuitDiffText[], afterItems: readonly CircuitDiffText[]) {
  const before = pageTokens(beforeItems), after = pageTokens(afterItems);
  type Token = (typeof before)[number];
  const group = (tokens: readonly Token[]) => { const map = new Map<string, Token[]>(); for (const entry of tokens) map.set(entry.token, [...(map.get(entry.token) ?? []), entry]); return map; };
  const b = group(before), a = group(after);
  // A pin name written with a number on one side (GND_1, VSS_2: a symbol's repeated pins in one library) and bare on
  // the other is the same name.
  const numbered = new Map<string, string>();
  for (const [own, other] of [[b, a], [a, b]] as const) for (const key of own.keys()) {
    const bare = /^(.+)_\d+$/.exec(key)?.[1];
    if (bare && !other.has(key) && other.has(bare)) numbered.set(key, bare);
  }
  // Where it is: one in the drawing if there is one, so a frame copy never hides a real one.
  const where = (entries: readonly Token[]) => { const inDrawing = entries.find(entry => !entry.frame); return { item: (inDrawing ?? entries[0]).item, ...(inDrawing ? {} : { frame: true as const }) }; };
  const spellings = (entries: readonly Token[]) => [...new Set(entries.map(entry => entry.raw))];
  const changes: CircuitContentChange[] = [];
  for (const token of new Set([...b.keys(), ...a.keys()])) {
    const olds = b.get(token), news = a.get(token);
    if (isValueKey(token)) {
      // A value is on one label per part: how many parts carry it is what counts (four 9.1K resistors that became 4.7K).
      const difference = (olds?.length ?? 0) - (news?.length ?? 0);
      if (difference) changes.push({ side: difference > 0 ? "base" : "work", token, type: "other", count: Math.abs(difference), value: true, ...where((difference > 0 ? olds : news)!) });
      continue;
    }
    if (olds && news) {
      // Both have it, written differently (U4401 and U4401A, OE3# and ^OE3#): the same name, listed once for reference.
      const left = spellings(olds), right = spellings(news);
      if (olds[0].type !== "other" && news.some(entry => !entry.frame) && !left.some(word => right.includes(word))) changes.push({ side: "work", token: right.join("、"), type: news[0].type, count: 1, alias: left.join("、"), ...where(news) });
      continue;
    }
    const entries = (olds ?? news)!, side = olds ? "base" as const : "work" as const, other = olds ? a : b;
    const bare = numbered.get(token);
    if (bare) { changes.push({ side, token, type: entries[0].type, count: 1, alias: bare, ...where(entries) }); continue; }
    // The bare name whose numbered forms only the other side has (VSS here, VSS_1 and VSS_2 there): already listed above.
    if ([...numbered].some(([variant, name]) => name === token && other.has(variant))) continue;
    changes.push({ side, token, type: entries[0].type, count: 1, ...where(entries) });
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
  if (change.kind === "removed") return `少了「${change.before!.str}」`;
  if (change.kind === "added") return `多了「${change.after!.str}」`;
  return `「${change.after!.str}」換了位置`;
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
const COMMON_NOTE = "很多頁的同一個地方都這樣改（通常是標題欄的日期、版次或頁數），不是線路，看一次就好。";

/**
 * Plain words (2026-11-24 「報錯的說明不夠人性化，要國小生都看得懂才對」): every finding says what is different and what to do
 * in everyday words. Findings that are not an error (the title block, a change on every sheet) start with 不算錯：, those
 * only worth a look start with 參考：; neither counts as a difference of the page (isCircuitReferenceFinding).
 */
export const CIRCUIT_NOT_AN_ERROR = "不算錯：";
export const CIRCUIT_FOR_REFERENCE = "參考：";
// How reports made before 2026-11-24 started the same kinds of finding.
const OLD_REFERENCE = /^(多頁共通：|圖框／標題欄文字不同|其他文字不同|零件位號換頁：|網路名稱換頁：)/;
export const isCircuitReferenceFinding = (finding: { title: string }) => finding.title.startsWith(CIRCUIT_NOT_AN_ERROR) || finding.title.startsWith(CIRCUIT_FOR_REFERENCE) || OLD_REFERENCE.test(finding.title);
const TITLE_BLOCK_NOTE = "這些字在右下角的標題欄或圖框（公司、作者、日期、版次），不是線路。換成你們公司或你的名字是正常的，不用改。";
/**
 * The title block (company, author, date, revision): changing it to one's own company and name is expected (2026-11-24
 * 「右下角的我要換成我們公司跟我這個作者，但他也報錯?」). It is found by its field names in the lower right (Title, Size,
 * Document Number, Rev, Date, Sheet … or 標題、圖號、版本、日期、作者 …): the box from the leftmost and highest of them to the
 * page corner, with room above for the company lines. Only that box: on a real sheet the circuit runs right up to it (the
 * E1.S MCU1 sheet has parts at 75 % across and 93 % down; its title block starts at 85 % / 94 %). Without field names, only
 * the far corner counts.
 */
const TITLE_FIELD = /^(?:(?:title|size|document(?: number| no\.?)?|doc\.? ?no\.?|rev(?:ision)?|date:?|sheet|drawn(?: by)?|designed(?: by)?|designer|engineer|checked(?: by)?|approved(?: by)?|author|company|project|page)\b|標題|圖名|圖號|品名|名稱|版本|版次|日期|頁次|設計|繪圖|製圖|審核|核准|作者|公司)/i;
export function findCircuitTitleBlock(items: readonly CircuitDiffText[]): CircuitCropRect | null {
  const fields = items.filter(item => { const point = center(item); return point.x > 0.55 && point.y > 0.75 && TITLE_FIELD.test(collapse(item.str)); });
  if (fields.length < 2) return null;
  const x = Math.max(0, Math.min(...fields.map(item => item.x)) - 0.02), y = Math.max(0, Math.min(...fields.map(item => item.y)) - 0.04);
  return { x, y, width: 1 - x, height: 1 - y };
}
const FALLBACK_TITLE_BLOCK: CircuitCropRect = { x: 0.8, y: 0.9, width: 0.2, height: 0.1 };
const inside = (box: CircuitCropRect, point: { x: number; y: number }) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

const TYPE_WORDS: Record<CircuitContentType, string> = { refdes: "零件編號", net: "線路名稱", other: "其他字" };
/** A part or net name only one side has: what to call it and what to check, for the side that has it. */
function onlyOnOneSide(side: "base" | "work", type: CircuitContentType, token: string, count: number) {
  const words = TYPE_WORDS[type], times = count > 1 ? `（多 ${count} 個）` : "";
  return {
    title: side === "base" ? `基準版有、比對版沒有的${words}：${token}${times}` : `比對版多出來的${words}：${token}${times}`,
    suggestion: side === "base"
      ? (type === "refdes" ? `基準版有 ${token} 這個零件，比對版找不到。是故意拿掉的嗎？不是的話，可能是漏畫，或是編號寫錯。` : `基準版有 ${token} 這條線路名稱，比對版沒有。是改了名字，還是漏接了？`)
      : (type === "refdes" ? `比對版多了 ${token} 這個零件。確認是新加的，不是編號寫錯。` : `比對版多了 ${token} 這條線路名稱。確認是新加的或改了名字，而且接到對的腳位。`),
  };
}
/** A name the other PDF draws on another sheet: not missing. */
function onAnotherSheet(side: "base" | "work", token: string, pages: readonly number[]) {
  const there = side === "base" ? "比對版" : "基準版", list = pages.slice(0, 3).join("、");
  return { title: `${CIRCUIT_FOR_REFERENCE}${token} 畫到${there}第 ${list} 頁了`, suggestion: `不是少了，只是${there}把 ${token} 畫在第 ${list} 頁。有空去那一頁看看接法一樣就好。` };
}
/**
 * A redrawn sheet as findings: the Ref Des and net names only one side has, each named, with where it is on that side.
 * One the other PDF has on another sheet moved sheet (listed, not this sheet's difference). Other words (values, pin
 * names, notes, which a redraw changes freely) are one line with examples, so they never bury the parts and nets.
 */
function summarizeRedrawn(diff: CircuitLocalPageDiff, limit: number, cross?: CircuitContentIndex | null): CircuitLocalSummary {
  const counts = { changed: 0, removed: 0, added: 0, moved: 0, graphic: 0 };
  const findings: Array<CircuitLocalFinding & { rank: number; own: boolean }> = [];
  const others: CircuitContentChange[] = [], frames: CircuitContentChange[] = [], aliases: CircuitContentChange[] = [], values: CircuitContentChange[] = [];
  for (const change of diff.contentChanges ?? []) {
    if (change.value) continue;
    if (change.frame) { frames.push(change); continue; }
    if (change.alias) { aliases.push(change); continue; }
    if (change.type === "other") { others.push(change); continue; }
    const otherPages = (change.side === "base" ? cross?.work : cross?.base)?.get(change.token)?.filter(page => page !== (change.side === "base" ? diff.pages?.work : diff.pages?.base)) ?? [];
    const box = textBox(change.item), place = change.item ? describeCircuitDiffPlace(change.item) : "這一頁";
    const category: CircuitDiffCategory = change.type === "refdes" ? "label-name" : "net-name";
    if (otherPages.length) {
      const moved = onAnotherSheet(change.side, change.token, otherPages);
      findings.push({ rank: 6, own: false, category, priority: "low", certainty: "unclear", title: clip(moved.title, 280), location: place,
        officialEvidence: change.side === "base" ? `${change.token}（${place}）` : `基準版在第 ${otherPages.slice(0, 3).join("、")} 頁`, workingEvidence: change.side === "work" ? `${change.token}（${place}）` : `比對版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        suggestion: moved.suggestion, officialBox: change.side === "base" ? box : null, workingBox: change.side === "work" ? box : null });
      continue;
    }
    if (change.side === "base") counts.removed += change.count; else counts.added += change.count;
    const words = onlyOnOneSide(change.side, change.type, change.token, change.count);
    findings.push({ rank: change.type === "refdes" ? 0 : 1, own: true, category, priority: change.type === "refdes" ? "high" : "medium", certainty: "suspected",
      title: clip(words.title, 280), location: place,
      officialEvidence: change.side === "base" ? `${change.token}（${place}）` : `基準版${cross ? "整份" : "這一頁"}沒有 ${change.token}`,
      workingEvidence: change.side === "work" ? `${change.token}（${place}）` : `比對版${cross ? "整份" : "這一頁"}沒有 ${change.token}`,
      suggestion: words.suggestion, officialBox: change.side === "base" ? box : null, workingBox: change.side === "work" ? box : null });
  }
  if (others.length) {
    const sample = others.slice(0, 8).map(change => `${change.token}（只在${change.side === "base" ? "基準版" : "比對版"}）`).join("、");
    findings.push({ rank: 7, own: false, category: "label-name", priority: "low", certainty: "unclear", title: clip(`${CIRCUIT_FOR_REFERENCE}其他字不一樣 ${others.length} 個（數值、腳位名稱或備註）`, 280), location: "整頁",
      officialEvidence: clip(others.filter(change => change.side === "base").map(change => change.token).join("、") || "—", 1900),
      workingEvidence: clip(others.filter(change => change.side === "work").map(change => change.token).join("、") || "—", 1900),
      suggestion: `重畫的時候常會改寫數值、腳位名稱或備註，例如：${sample}。需要時再一個一個看。`, officialBox: null, workingBox: null });
  }
  // Values part by part first (R3410: 2.21KΩ → 100KΩ); what no part explains stays as a count per kind of value.
  for (const finding of valueFindings(diff.valueChanges ?? [])) { counts.changed++; findings.push({ ...finding, own: true }); }
  for (const finding of valueCountFindings(diff)) { if (finding.own) counts.changed++; findings.push(finding); }
  if (aliases.length) {
    // The same part or name written another way by the other drawing or its library: listed so it can be checked, never
    // counted (2026-11-24: U4401 against U4401A / U4401B, GND against GND_1…GND_7, OE3# against ^OE3# on the real E1.S).
    const pairs = aliases.map(change => change.side === "base" ? { base: change.token, work: change.alias! } : { base: change.alias!, work: change.token });
    findings.push({ rank: 7, own: false, category: "label-name", priority: "low", certainty: "unclear", title: clip(`${CIRCUIT_NOT_AN_ERROR}寫法不一樣、其實是同一個的名字 ${aliases.length} 個（拆成幾部分畫的零件、腳位名稱的寫法）`, 280), location: "整頁",
      officialEvidence: clip(pairs.map(pair => pair.base).join("；"), 1900), workingEvidence: clip(pairs.map(pair => pair.work).join("；"), 1900),
      suggestion: `例如：${pairs.slice(0, 8).map(pair => `${pair.base} ↔ ${pair.work}`).join("、")}（左邊是基準版、右邊是比對版的寫法）。同一個零件拆成幾部分畫（A、B），或圖庫把重複的腳位加上 _1、_2、在腳位名稱前加 ^ 或 v，都是同一個東西，不算錯。`, officialBox: null, workingBox: null });
  }
  if (frames.length) {
    // The frame of a redrawn sheet (title block, company, drawer, date) differs by nature: one line, listed, never hidden.
    findings.push({ rank: 8, own: false, category: "label-name", priority: "low", certainty: "unclear", title: clip(`${CIRCUIT_NOT_AN_ERROR}標題欄或圖框的字不一樣 ${frames.length} 個（公司、作者、日期等）`, 280), location: "圖框與標題欄",
      officialEvidence: clip(frames.filter(change => change.side === "base").map(change => change.token).join("、") || "—", 1900),
      workingEvidence: clip(frames.filter(change => change.side === "work").map(change => change.token).join("、") || "—", 1900),
      suggestion: TITLE_BLOCK_NOTE, officialBox: null, workingBox: null });
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
      const name = circuitNameKey(word);
      if (!name) continue;
      const token = name.key, type = name.type, entry = map.get(token);
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
    const gone = collapse(change.before!.str).split(" ").map(word => circuitNameKey(word)?.key ?? "").filter(token => extra.get(token)?.side === "base");
    const came = collapse(change.after!.str).split(" ").map(word => circuitNameKey(word)?.key ?? "").filter(token => extra.get(token)?.side === "work");
    if (gone.length !== 1 || came.length !== 1 || extra.get(gone[0])!.count !== 1 || extra.get(came[0])!.count !== 1) continue;
    const category = classifyCircuitDiffText(change.after!.str);
    findings.push({ rank: 0, category, priority: "high", certainty: "suspected", title: clip(`字改了：${change.before!.str} → ${change.after!.str}`, 280), location: describeCircuitDiffPlace(change.after!),
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: clip(change.after!.str, 1900), suggestion: "這一塊被搬走或重畫，這個名字也換了。是你要改的嗎？不是的話，就是改錯了。", officialBox: textBox(change.before), workingBox: textBox(change.after) });
    extra.delete(gone[0]); extra.delete(came[0]);
  }
  for (const [token, { side, count, entry }] of extra) {
    const place = describeCircuitDiffPlace(entry.item), box = textBox(entry.item), category: CircuitDiffCategory = entry.type === "refdes" ? "label-name" : "net-name";
    const onPage = (side === "base" ? diff.contents?.work : diff.contents?.base)?.includes(token) ?? false;
    const otherPages = onPage ? [] : (side === "base" ? cross?.work : cross?.base)?.get(token)?.filter(page => page !== (side === "base" ? diff.pages?.work : diff.pages?.base)) ?? [];
    const boxes = { officialBox: side === "base" ? box : null, workingBox: side === "work" ? box : null };
    if (onPage || otherPages.length) {
      const moved = onAnotherSheet(side, token, otherPages);
      findings.push({ rank: 6, category, priority: "low", certainty: "unclear", location: place, ...boxes,
        title: clip(onPage ? `${CIRCUIT_FOR_REFERENCE}${token} 在這一塊畫的次數不一樣（兩版這一頁都有）` : moved.title, 280),
        officialEvidence: side === "base" ? `${token}（${place}）` : onPage ? `基準版這一頁其他地方有 ${token}` : `基準版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        workingEvidence: side === "work" ? `${token}（${place}）` : onPage ? `比對版這一頁其他地方有 ${token}` : `比對版在第 ${otherPages.slice(0, 3).join("、")} 頁`,
        suggestion: onPage ? `兩版都有 ${token}，只是這一塊畫的次數不一樣（重畫時常常會這樣）。確認它接到一樣的腳位就好。` : moved.suggestion });
      continue;
    }
    const words = onlyOnOneSide(side, entry.type, token, count);
    findings.push({ rank: entry.type === "refdes" ? 0 : 1, category, priority: entry.type === "refdes" ? "high" : "medium", certainty: "suspected", location: place, ...boxes,
      title: clip(words.title, 280),
      officialEvidence: side === "base" ? `${token}（${place}）` : `基準版${cross ? "整份" : "這一頁"}沒有 ${token}`,
      workingEvidence: side === "work" ? `${token}（${place}）` : `比對版${cross ? "整份" : "這一頁"}沒有 ${token}`,
      suggestion: words.suggestion });
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
    return clip([`${label}有 ${items.length} 段字換了位置${area.regions.some(region => region[side]) ? "，線也畫得不一樣" : ""}`,
      extraOthers.length ? `只在這一邊的其他字：${extraOthers.slice(0, 12).join("、")}` : "",
      side === "work" && rewrites.length ? `同一個位置改寫的字：${rewrites.slice(0, 8).join("、")}` : ""].filter(Boolean).join("；"), 1900);
  };
  findings.push({ rank: 3, category: "connectivity", priority: "medium", certainty: "unclear", location: officialBox ?? workingBox ? describeCircuitDiffPlace((officialBox ?? workingBox)!) : "這一頁",
    title: clip(`這一塊整個搬走或重畫了：${area.changes.length} 段字的位置不一樣，${named ? `有 ${named} 個零件或線路名稱只在一邊（另外列出）` : "零件和線路名稱都一樣"}`, 280),
    officialEvidence: evidence(befores, "基準版這一塊", "base"), workingEvidence: evidence(afters, "比對版這一塊", "work"),
    suggestion: "這一塊被搬走或重畫，所以很多字的位置都變了。零件編號和線路名稱都已經一個一個比過（只在一邊的另外列出）。請把兩版放大，看線有沒有接到一樣的地方。",
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
  // The title block first: one line that is not an error, whatever changed there (company, author, date, logo).
  const zones = { base: diff.titleBlock?.base ?? diff.titleBlock?.work ?? FALLBACK_TITLE_BLOCK, work: diff.titleBlock?.work ?? diff.titleBlock?.base ?? FALLBACK_TITLE_BLOCK };
  const titled = (change: CircuitTextChange) => (!change.before || inside(zones.base, center(change.before))) && (!change.after || inside(zones.work, center(change.after)));
  const titleChanges = diff.textChanges.filter(titled);
  const titleRegions = diff.regions.filter(region => { const middle = { x: region.box.x + region.box.width / 2, y: region.box.y + region.box.height / 2 }; return (region.base && inside(zones.base, middle)) || (region.work && inside(zones.work, middle)); });
  // Coloured marks someone drew and a frame the content moved against are not the circuit (2026-11-25, the real E1.S pair).
  const marks = diff.regions.filter(region => !titleRegions.includes(region) && region.kind === "annotation");
  const frameRegions = diff.regions.filter(region => !titleRegions.includes(region) && region.kind === "frame");
  const nudged = diff.regions.filter(region => !titleRegions.includes(region) && region.kind === "nudged");
  const textChanges = diff.textChanges.filter(change => !titleChanges.includes(change)), regions = diff.regions.filter(region => !titleRegions.includes(region) && !region.kind);
  const counts = { changed: 0, removed: 0, added: 0, moved: 0, graphic: regions.length };
  // A value label rewritten, removed or added where a part's value is compared part by part is said once, by that part.
  const valueText = (item?: CircuitDiffText) => Boolean(item) && collapse(item!.str).split(" ").every(word => isValueKey(circuitLabelKey(word).toUpperCase()) || CIRCUIT_PART_NUMBER_LINE.test(word));
  const valueKeys = (item?: CircuitDiffText) => item ? collapse(item.str).split(" ").map(word => circuitLabelKey(word).toUpperCase()).filter(isValueKey) : [];
  const explainedText = (change: CircuitTextChange) => (valueText(change.before) || valueText(change.after)) && (diff.valueChanges ?? []).some(value => valueKeys(change.before).some(key => value.before.includes(key)) || valueKeys(change.after).some(key => value.after.includes(key)));
  // Blocks moved or redrawn as a whole: one finding each, compared by name (summarizeArea), counted like any text change.
  const grouping = findCircuitChangeAreas(textChanges.filter(change => change.kind === "moved" || !explainedText(change)), regions, change => isCircuitCommonChange(change, common));
  for (const change of grouping.areas.flatMap(area => area.changes)) counts[change.kind]++;
  const order: Record<CircuitTextChangeKind, number> = { changed: 0, removed: 1, added: 2, moved: 4 };
  // A string that only moved is the same text in another place: not a change of the circuit by itself (a wire that moved
  // with it is a drawing difference of its own). One reference line, never counted (2026-11-25: grid letters, pin numbers
  // and a cover title listed one by one on the real E1.S pair).
  const movedOnly = grouping.rest.filter(change => change.kind === "moved" && !isCircuitCommonChange(change, common));
  // A pin name shown on one side only (IO, GND, K, A on a diode another library draws with its pin names): part of a symbol
  // drawn another way, whose lines are listed as a drawing difference; never a difference of its own (2026-11-25).
  const PIN_WORD = /^(IO\d*|GND|NC|VCC|VDD|VSS|K|A|G|S|D|B|C|E|IN|OUT|EN|PG|FB|SW|LX|BST|VIN|VOUT|[1-9]\d?)$/;
  const pinNames = grouping.rest.filter(change => (change.kind === "added" || change.kind === "removed") && !isCircuitCommonChange(change, common) && PIN_WORD.test(collapse((change.after ?? change.before)!.str)));
  movedOnly.push(...pinNames);
  const findings: Array<CircuitLocalFinding & { rank: number; shared: boolean }> = grouping.rest.filter(change => !movedOnly.includes(change)).map(change => {
    const shared = isCircuitCommonChange(change, common);
    if (!shared) counts[change.kind]++;
    const text = (change.after ?? change.before)!.str, category = classifyCircuitDiffText(text);
    const place = describeCircuitDiffPlace((change.after ?? change.before)!);
    // A change shared by many sheets is listed last and marked, never left out.
    const rank = shared ? 5 : order[change.kind];
    // The same frame spot changing on many sheets: not an error, said once per change in plain words.
    const title = (words: string) => clip(shared ? `${CIRCUIT_NOT_AN_ERROR}很多頁的同一個地方都改了（${describeCircuitTextChange(change)}）` : words, 280);
    if (change.kind === "changed") return { rank, shared, category, priority: shared ? "low" as const : "high" as const, certainty: shared ? "unclear" as const : "suspected" as const, title: title(`字改了：${change.before!.str} → ${change.after!.str}`), location: place,
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: clip(change.after!.str, 1900), suggestion: shared ? COMMON_NOTE : "同一個位置的字改了。是你要改的嗎？不是的話，就是改錯了。", officialBox: textBox(change.before), workingBox: textBox(change.after) };
    if (change.kind === "removed") return { rank, shared, category, priority: shared ? "low" as const : "medium" as const, certainty: shared ? "unclear" as const : "suspected" as const, title: title(`比對版少了：${change.before!.str}`), location: place,
      officialEvidence: clip(change.before!.str, 1900), workingEvidence: "比對版這裡沒有這段字", suggestion: shared ? COMMON_NOTE : "基準版這裡有這段字，比對版拿掉了。是故意拿掉的嗎？不是的話，就是漏畫了。", officialBox: textBox(change.before), workingBox: null };
    if (change.kind === "added") return { rank, shared, category, priority: shared ? "low" as const : "medium" as const, certainty: shared ? "unclear" as const : "suspected" as const, title: title(`比對版多了：${change.after!.str}`), location: place,
      officialEvidence: "基準版這裡沒有這段字", workingEvidence: clip(change.after!.str, 1900), suggestion: shared ? COMMON_NOTE : "比對版多了這段字。確認字寫對、位置放對。", officialBox: null, workingBox: textBox(change.after) };
    return { rank, shared, category, priority: "low" as const, certainty: shared ? "unclear" as const : "suspected" as const, title: title(`換了位置：${change.after!.str}`), location: place,
      officialEvidence: `${clip(change.before!.str, 1800)}（${describeCircuitDiffPlace(change.before!)}）`, workingEvidence: `${clip(change.after!.str, 1800)}（${place}）`, suggestion: shared ? COMMON_NOTE : "字一樣，只是換了位置（通常是圖重新排過）。看看旁邊的線有沒有一起接好。", officialBox: textBox(change.before), workingBox: textBox(change.after) };
  });
  for (const finding of valueFindings(diff.valueChanges ?? [])) { counts.changed++; findings.push({ ...finding, shared: false }); }
  for (const { own, ...finding } of valueCountFindings(diff)) { if (own) counts.changed++; findings.push({ ...finding, shared: !own }); }
  if (movedOnly.length) {
    counts.moved += movedOnly.length;
    const sample = movedOnly.slice(0, 12).map(change => (change.after ?? change.before)!.str);
    findings.push({ rank: 6, shared: true, category: "label-name", priority: "low", certainty: "unclear", location: "整頁",
      title: clip(`${CIRCUIT_FOR_REFERENCE}${movedOnly.length} 段字一樣，只是換了位置或是符號上的腳位名稱（${sample.slice(0, 6).join("、")}${movedOnly.length > 6 ? "…" : ""}）`, 280),
      officialEvidence: clip(movedOnly.filter(change => change.before).map(change => `${change.before!.str}（${describeCircuitDiffPlace(change.before!)}）`).join("、") || "—", 1900),
      workingEvidence: clip(movedOnly.filter(change => change.after).map(change => `${change.after!.str}（${describeCircuitDiffPlace(change.after!)}）`).join("、") || "—", 1900),
      suggestion: "字的內容一樣，只是放的位置不同（圖重新排過、圖框位置不同）。這不是線路改了；線如果也畫得不一樣，會另外列出。", officialBox: null, workingBox: null });
  }
  // A block moved or redrawn as a whole is said once for reference; what it changed (a name only on one side) is counted on
  // its own line (2026-11-25: consistent with redrawn sheets, where layout is never a difference by itself).
  for (const area of grouping.areas) findings.push(...summarizeArea(area, diff, cross).map(finding => finding.rank === 3 ? { ...finding, title: clip(`${CIRCUIT_FOR_REFERENCE}${finding.title}`, 280), priority: "low" as const, shared: true } : { ...finding, shared: finding.rank >= 6 }));
  if (marks.length) {
    const box = boundsOf(marks.map(region => region.box));
    findings.push({ rank: 6, shared: true, category: "connectivity", priority: "low", certainty: "unclear", location: box ? describeCircuitDiffPlace(box) : "這一頁",
      title: clip(`${CIRCUIT_NOT_AN_ERROR}${marks.some(region => region.work) ? "比對版" : "基準版"}多了彩色的框線或註記 ${marks.length} 處（不是線路）`, 280),
      officialEvidence: marks.some(region => region.base) ? "基準版這裡有彩色的框線或註記" : "基準版這裡沒有", workingEvidence: marks.some(region => region.work) ? "比對版這裡有彩色的框線或註記（例如虛線框）" : "比對版這裡沒有",
      suggestion: "不一樣的只有彩色的線（通常是有人畫上去的虛線框或標記），電路本身的線都一樣。", officialBox: box && pad(box, 0.004), workingBox: box && pad(box, 0.004) });
  }
  if (nudged.length) {
    const box = boundsOf(nudged.map(region => region.box));
    findings.push({ rank: 6, shared: true, category: "connectivity", priority: "low", certainty: "unclear", location: box ? describeCircuitDiffPlace(box) : "這一頁",
      title: clip(`${CIRCUIT_FOR_REFERENCE}${nudged.length} 處符號或線只差一點點位置，形狀一樣（不到一支腳的距離）`, 280),
      officialEvidence: "基準版的位置", workingEvidence: "比對版同樣的符號或線，往旁邊偏了一點點",
      suggestion: "同樣的符號或線只偏了不到 1.5 點（一支腳的距離是 7.2 點），接不到別的腳，通常是圖庫符號的位置不同。需要時放大看一眼。", officialBox: box && pad(box, 0.004), workingBox: box && pad(box, 0.004) });
  }
  if (frameRegions.length) {
    findings.push({ rank: 6, shared: true, category: "connectivity", priority: "low", certainty: "unclear", location: "圖框",
      title: clip(`${CIRCUIT_NOT_AN_ERROR}整頁內容和圖框的相對位置不一樣（圖框沒動、內容整片平移，${frameRegions.length} 處框線）`, 280),
      officialEvidence: "基準版的圖框位置", workingEvidence: "比對版的內容整片移了一點，圖框沒有跟著移",
      suggestion: "整頁的線路一起平移了一點，只有圖框（外框、格線字）留在原地，所以框線看起來不一樣。電路內容已經對齊比過。", officialBox: null, workingBox: null });
  }
  // Drawing differences side by side are one place to look at, said once with how many spots it has.
  const clusters: Array<{ box: CircuitCropRect; regions: CircuitGraphicRegion[] }> = [];
  for (const region of grouping.regions) {
    const grown = { x: region.box.x - 0.03, y: region.box.y - 0.03, width: region.box.width + 0.06, height: region.box.height + 0.06 };
    const touching = clusters.filter(cluster => cluster.box.x <= grown.x + grown.width && grown.x <= cluster.box.x + cluster.box.width && cluster.box.y <= grown.y + grown.height && grown.y <= cluster.box.y + cluster.box.height);
    const merged = { box: boundsOf([region.box, ...touching.map(cluster => cluster.box)])!, regions: [region, ...touching.flatMap(cluster => cluster.regions)] };
    for (const cluster of touching) clusters.splice(clusters.indexOf(cluster), 1);
    clusters.push(merged);
  }
  counts.graphic = clusters.length;
  for (const { box: bounds, regions: members } of clusters) {
    const region = { box: bounds, base: members.some(member => member.base), work: members.some(member => member.work), faint: members.every(member => member.faint) };
    const box = pad(region.box, 0.004);
    findings.push({ rank: 3, shared: false, category: "connectivity", priority: "medium", certainty: "unclear", title: region.faint ? "這裡的線有一點點不一樣（接點或線的長短）" : members.length > 1 ? `這一塊的線或符號不一樣（${members.length} 處）` : "這裡的線或符號不一樣", location: describeCircuitDiffPlace(region.box),
      officialEvidence: region.base ? "基準版這裡多了一些線或圖形（看框起來的地方）" : "基準版這裡沒有這些線",
      workingEvidence: region.work ? "比對版這裡多了一些線或圖形（看框起來的地方）" : "比對版這裡沒有這些線",
      suggestion: region.faint ? "兩版這裡只差一點點，可能是多了或少了一個接點，或線長了、短了一點。請放大兩版看清楚。" : "字沒變，但線、接點或符號畫得不一樣。請把兩版放大，看線是不是接到一樣的地方。", officialBox: box, workingBox: box });
  }
  if (titleChanges.length || titleRegions.length) {
    const words = (side: "before" | "after") => [...new Set(titleChanges.flatMap(change => change[side] ? [change[side]!.str] : []))];
    const box = (side: "before" | "after", ink: "base" | "work") => { const bounds = boundsOf([...titleChanges.flatMap(change => change[side] ? [itemBox(change[side]!)] : []), ...titleRegions.filter(region => region[ink]).map(region => region.box)]); return bounds && pad(bounds, 0.004); };
    const before = words("before"), after = words("after"), logo = titleRegions.length ? "（標誌或線也不一樣）" : "";
    findings.push({ rank: 5, shared: true, category: "label-name", priority: "low", certainty: "unclear", location: "右下角標題欄",
      title: clip(`${CIRCUIT_NOT_AN_ERROR}標題欄不一樣（公司、作者、日期等 ${titleChanges.length + titleRegions.length} 處）`, 280),
      officialEvidence: clip(`${before.length ? `基準版寫：${before.slice(0, 20).join("、")}` : "基準版這裡沒有不同的字"}${logo}`, 1900),
      workingEvidence: clip(`${after.length ? `比對版寫：${after.slice(0, 20).join("、")}` : "比對版這裡沒有不同的字"}${logo}`, 1900),
      suggestion: TITLE_BLOCK_NOTE, officialBox: box("before", "base"), workingBox: box("after", "work") });
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
