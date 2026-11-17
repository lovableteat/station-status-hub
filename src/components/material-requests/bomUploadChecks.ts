/**
 * Column checks run on an uploaded BOM before it becomes a version, so a wrong file is caught at the door rather than
 * after its tracking failed to carry over. Pure functions: rule checks here; the AI review (bomUploadAiReview.ts)
 * adds its findings in the same shape.
 */
import { bomRefTokens, normalizeBomText } from "./bomDiff.ts";
import type { MaterialWorkbookRecord } from "./materialRequestUtils.ts";

export type BomUploadColumn = "Ref Des" | "Qty" | "Manufacturer" | "Manufacturer Part Number" | "虛擬料號" | "實體料號" | "Name";

export interface BomUploadIssue {
  /** Excel row number, when known. */
  row?: number;
  refDes: string;
  part: string;
  column: BomUploadColumn;
  reason: string;
  level: "error" | "warning";
  source: "rule" | "ai";
}

/** Rows per AI request (bomUploadAiReview.ts). */
export const AI_REVIEW_BATCH_ROWS = 120;
/** Files up to this many rows are reviewed by AI as soon as they are staged; larger ones wait for a click (25+ requests). */
export const AI_REVIEW_AUTO_ROWS = 3000;
export const countAiReviewBatches = (rows: number) => Math.ceil(rows / AI_REVIEW_BATCH_ROWS);

export interface BomAiReviewResult {
  issues: BomUploadIssue[];
  totalBatches: number;
  /** Batch numbers (0-based) that failed twice; 重試 sends only these. */
  failedBatches: number[];
  /** Why the first failed batch failed, in words for the dialog. */
  failure?: string;
}

const text = (value: unknown) => normalizeBomText(value);
const hasDigit = (value: string) => /\d/.test(value);
const describePart = (record: MaterialWorkbookRecord) => [text(record.manufacturer), text(record.manufacturerPartNumber)].filter(Boolean).join(" / ") || text(record.name) || "（未填）";
const refsOf = (record: MaterialWorkbookRecord) => bomRefTokens(record.refDes);
const digitCount = (value: string) => value.replace(/\D/g, "").length;
/** Blank-ish values that are not a maker's name or a part: "N/A", "TBD", "-", and not-fitted rows ("NC", "DNI", "DNP"). */
const PLACEHOLDER = /^(?:N\/?A|NONE|TBD|TBC|NULL|NC|N\/?C|DNI|DNP|DNF|NI|NIL|OPEN|GENERIC|[-—–_/.]+|無|空白|不上件)$/i;
/** "R1-R10", "C5~C9": one position the website cannot split. "J1-1" (a pin of J1) is not a range. */
const RANGE = /~|^([A-Z]+)\d+-\1\d+$/i;
/** The same written with spaces, "R10 - R15", which splits into two positions and a dash. */
const SPACED_RANGE = /([A-Z]+)\d+\s+[-~～]\s*\1\d+|([A-Z]+)\d+\s*[-~～]\s+\2\d+/i;

/** Rule checks; each finding names the row, the column and the concrete reason. */
export function checkBomUploadRows(records: readonly MaterialWorkbookRecord[]): BomUploadIssue[] {
  const issues: BomUploadIssue[] = [];
  const add = (record: MaterialWorkbookRecord, column: BomUploadColumn, reason: string, level: BomUploadIssue["level"] = "warning") =>
    issues.push({ row: record.sourceRow, refDes: refsOf(record).join(", ") || text(record.refGroup), part: describePart(record), column, reason, level, source: "rule" });
  // Maker names seen in this file, to recognise one typed into the MPN column. Placeholders are not names.
  const makers = new Set(records.map((record) => text(record.manufacturer).toUpperCase()).filter((value) => /[A-Z]{2,}/.test(value) && !hasDigit(value) && !PLACEHOLDER.test(value)));
  const seen = new Map<string, MaterialWorkbookRecord>();

  records.forEach((record, index) => {
    const maker = text(record.manufacturer);
    const mpn = text(record.manufacturerPartNumber);
    const physical = text(record.partNumber);
    const virtual = text(record.virtualAlternative);
    const refs = refsOf(record);

    // An MPN cut at a comma ("74LVC2G17GW,125" → "74LVC2G17GW" and "125") leaves a short all-digit piece on its own row,
    // next to the rest of it. A short number alone is a real MPN (Keystone 5001) and is not flagged.
    const neighbour = /^\d{1,4}$/.test(mpn)
      ? [records[index - 1], records[index + 1]].find((other) => other && text(other.manufacturer) === maker && bomRefTokens(other.refDes).join("|") === refs.join("|") && /[A-Z]/i.test(text(other.manufacturerPartNumber)))
      : undefined;
    // "RC0402FR-0710KL" under 廠商 with "YAGEO" under 廠商料號. A name with a digit or two (O2MICRO, 3M) is a name.
    const makerLooksLikeMpn = Boolean(maker && !/\s/.test(maker) && maker.length >= 6 && (digitCount(maker) >= 3 || (digitCount(maker) >= 2 && /-/.test(maker)))
      && mpn && !hasDigit(mpn) && !PLACEHOLDER.test(mpn));
    if (neighbour) {
      add(record, "Manufacturer Part Number", `廠商料號只有「${mpn}」，旁邊同位號同廠商的一列是「${text(neighbour.manufacturerPartNumber)}」；看起來原本是「${text(neighbour.manufacturerPartNumber)},${mpn}」被逗號拆成兩列，請合併成一列`, "error");
    } else if (makerLooksLikeMpn) {
      // One finding for one mistake: the two columns are swapped.
      add(record, "Manufacturer", `廠商欄填的是「${maker}」，廠商料號欄填的是「${mpn}」；看起來兩欄填反了`, "error");
    } else if (mpn && !hasDigit(mpn) && !PLACEHOLDER.test(mpn) && mpn.toUpperCase() !== maker.toUpperCase() && makers.has(mpn.toUpperCase())) {
      // A row whose MPN repeats its own maker ("NC / NC", "GENERIC / GENERIC") is a not-fitted or generic line, not a swap.
      add(record, "Manufacturer Part Number", `廠商料號欄填的是「${mpn}」，這是廠商名稱；廠商料號與廠商兩欄可能填反`, "error");
    }
    if (physical && virtual && physical.toUpperCase() === virtual.toUpperCase()) {
      add(record, "虛擬料號", `虛擬料號和實體料號都是「${physical}」；實體料號不能當虛擬料號填，查無虛擬料號就留白`, "error");
    }
    if (/^TEMP-/i.test(physical)) {
      add(record, "實體料號", `實體料號是暫時料號「${physical}」，網站會把這顆料當成還要申請`);
    }
    if (record.level >= 2 && refs.length === 0 && !text(record.refGroup) && (mpn || physical)) {
      add(record, "Ref Des", "料件列沒有位號");
    }
    const range = refs.find((ref) => RANGE.test(ref)) ?? SPACED_RANGE.exec(text(record.refDes))?.[0];
    if (range) add(record, "Ref Des", `位號「${range}」是範圍寫法，網站會當成一個位號；請逐一列出`);
    const qty = Number(String(record.qty ?? "").replace(/,/g, ""));
    // A range already explains a count that does not match; it is reported once, as the range.
    if (!range && refs.length > 1 && Number.isFinite(qty) && qty > 0 && Math.round(qty) !== refs.length && record.level >= 2) {
      add(record, "Qty", `數量是 ${qty}，但位號有 ${refs.length} 個`);
    }
    const key = [refs.join("|"), maker.toUpperCase(), mpn.toUpperCase(), physical.toUpperCase()].join("¦");
    if (refs.length > 0 && mpn) {
      const earlier = seen.get(key);
      if (earlier) add(record, "Manufacturer Part Number", `和第 ${earlier.sourceRow ?? "?"} 列完全重複（同位號、同廠商、同料號）`);
      else seen.set(key, record);
    }
  });
  return issues;
}
