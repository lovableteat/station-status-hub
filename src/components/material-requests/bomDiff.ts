/**
 * Content-based BOM comparison and tracking carry-over.
 *
 * Rows are grouped by Ref Des, groups are matched by Ref Des overlap and vendor
 * lines by 實體料號 → 廠商+MPN → MPN, so inserted rows or re-ordered sheets never
 * shift the comparison. Pure functions only: no React, no Supabase, no imports
 * with runtime side effects, so the module also runs under `node --test`.
 */
import { getMaterialSpecDocuments } from "./materialAttachments.ts";
import { getLatestTrackingEntry, type MaterialTrackingHistoryEntry, type MaterialWorkbookRecord } from "./materialRequestUtils.ts";
import { isTrackedMaterialApplication } from "./materialTrackingStatus.ts";

export type BomDiffField =
  | "name" | "qty" | "refDes" | "manufacturer" | "manufacturerPartNumber" | "sourcingStatus"
  | "virtualAlternative" | "partNumber" | "partName" | "partSpec" | "schematicPart"
  | "pcbFootprint" | "phaseOutStatus" | "partUsageStatus" | "grouping";

export type BomChangeKind = "added" | "removed" | "refDes" | "qty" | "primary" | "vendors" | "status" | "spec";
export type BomChangeImpact = "production" | "status" | "text" | "none";

export const BOM_DIFF_FIELDS: ReadonlyArray<{ key: BomDiffField; label: string; scope: "group" | "line"; kind: BomChangeKind }> = [
  { key: "refDes", label: "Ref Des", scope: "group", kind: "refDes" },
  { key: "qty", label: "Qty", scope: "group", kind: "qty" },
  { key: "name", label: "Name", scope: "group", kind: "spec" },
  { key: "partSpec", label: "Part Spec", scope: "group", kind: "spec" },
  { key: "schematicPart", label: "Schematic_Part", scope: "group", kind: "spec" },
  { key: "pcbFootprint", label: "PCB_Footprint", scope: "group", kind: "spec" },
  { key: "grouping", label: "系統／模組", scope: "group", kind: "spec" },
  { key: "manufacturer", label: "Manufacturer", scope: "line", kind: "vendors" },
  { key: "manufacturerPartNumber", label: "Manufacturer Part Number", scope: "line", kind: "vendors" },
  { key: "partNumber", label: "實體料號", scope: "line", kind: "vendors" },
  { key: "virtualAlternative", label: "虛擬料號", scope: "line", kind: "spec" },
  { key: "partName", label: "Part Name", scope: "line", kind: "spec" },
  { key: "sourcingStatus", label: "Sourcing Status", scope: "line", kind: "status" },
  { key: "phaseOutStatus", label: "phase out", scope: "line", kind: "status" },
  { key: "partUsageStatus", label: "零件狀態", scope: "line", kind: "status" },
];

export const BOM_CHANGE_KINDS: ReadonlyArray<{ key: BomChangeKind; label: string; impact: BomChangeImpact }> = [
  { key: "added", label: "新增", impact: "production" },
  { key: "removed", label: "移除", impact: "production" },
  { key: "refDes", label: "位號", impact: "production" },
  { key: "qty", label: "數量", impact: "production" },
  { key: "primary", label: "主料", impact: "production" },
  { key: "vendors", label: "替代料", impact: "production" },
  { key: "status", label: "狀態", impact: "status" },
  { key: "spec", label: "規格", impact: "text" },
];

export const BOM_CHANGE_IMPACTS: ReadonlyArray<{ key: BomChangeImpact; label: string }> = [
  { key: "production", label: "影響生產" },
  { key: "status", label: "狀態變更" },
  { key: "text", label: "文字變更" },
  { key: "none", label: "未變更" },
];

const KIND_LABELS = new Map(BOM_CHANGE_KINDS.map((kind) => [kind.key, kind.label]));
const KIND_IMPACTS = new Map(BOM_CHANGE_KINDS.map((kind) => [kind.key, kind.impact]));
const FIELD_LABELS = new Map(BOM_DIFF_FIELDS.map((field) => [field.key, field.label]));
const IMPACT_RANK: Record<BomChangeImpact, number> = { production: 3, status: 2, text: 1, none: 0 };
const IMPORTED_TRACKING_PREFIX = "imported-tracking-";
const MANUAL_RECORD_PREFIX = "manual-";

export const bomChangeKindLabel = (kind: BomChangeKind) => KIND_LABELS.get(kind) ?? kind;
export const bomChangeImpactLabel = (impact: BomChangeImpact) => BOM_CHANGE_IMPACTS.find((item) => item.key === impact)?.label ?? impact;
export const bomDiffFieldLabel = (field: BomDiffField) => FIELD_LABELS.get(field) ?? field;

export interface BomDiffGroup {
  key: string;
  tokens: string[];
  rows: MaterialWorkbookRecord[];
  primary: MaterialWorkbookRecord;
  displayRef: string;
  name: string;
  index: number;
}

export interface BomFieldChange {
  field: BomDiffField;
  label: string;
  before: string;
  after: string;
  /** Vendor context for line-level fields: "廠商 / MPN" of the compared line. */
  vendor?: string;
}

export interface BomVendorLineChange {
  kind: "added" | "removed" | "changed" | "same";
  before?: MaterialWorkbookRecord;
  after?: MaterialWorkbookRecord;
  changes: BomFieldChange[];
  /** A removed line whose vendor part sits at another location of the new version (its Ref Des there). */
  movedTo?: string;
  /** That part's row in the new version. */
  movedRecord?: MaterialWorkbookRecord;
  /** An added line that is a part moved from another location of the old version (its Ref Des there). */
  movedFrom?: string;
  /** The old line has website data that its counterpart in the new version does not have. */
  notCarried?: boolean;
}

export interface BomDiffEntry {
  id: string;
  kinds: BomChangeKind[];
  impact: BomChangeImpact;
  displayRef: string;
  name: string;
  before?: BomDiffGroup;
  after?: BomDiffGroup;
  refAdded: string[];
  refRemoved: string[];
  changes: BomFieldChange[];
  lines: BomVendorLineChange[];
  /** Old vendor lines with tracking activity that have no counterpart in the new version. */
  trackingLost: number;
  trackingAfter: boolean;
  searchText: string;
}

export interface BomDiffSummary {
  beforeRows: number;
  afterRows: number;
  beforeGroups: number;
  afterGroups: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  kinds: Record<BomChangeKind, number>;
  trackingLost: number;
  /** Lost lines whose part is in the new version: 帶入舊版資料 can fill these in one go. */
  recarry: number;
}

export interface BomDiffResult {
  entries: BomDiffEntry[];
  summary: BomDiffSummary;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function normalizeBomText(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Text for matching keys only (never for what the comparison shows): invisible characters pasted from PLM exports
 * (zero-width space, soft hyphen, BOM) and look-alike dashes would make the same MPN or Ref Des look like another one.
 */
function foldBomKeyText(value: unknown) {
  return normalizeBomText(String(value ?? "").replace(/[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g, "").replace(/[\u2010-\u2015\u2212\ufe58\ufe63]/g, "-"));
}

const upper = (value: unknown) => foldBomKeyText(value).toUpperCase();

/** Ref Des tokens, uppercase, de-duplicated and numerically sorted; mirrors splitRefDesignators. */
export function bomRefTokens(...values: unknown[]) {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of foldBomKeyText(value).split(/[\s,，、;；]+/)) {
      const trimmed = token.trim().toUpperCase();
      if (trimmed && trimmed !== "-") tokens.add(trimmed);
    }
  }
  return [...tokens].sort(collator.compare);
}

function fallbackGroupKey(record: MaterialWorkbookRecord, index: number) {
  const virtual = upper(record.virtualAlternative);
  if (virtual) return `noref:virtual:${virtual}`;
  const part = upper(record.partNumber);
  if (part) return `noref:part:${part}`;
  const mpn = upper(record.manufacturerPartNumber);
  if (mpn) return `noref:mpn:${upper(record.manufacturer)}|${mpn}`;
  const name = upper(record.name);
  if (name) return `noref:name:${name}|${upper(record.partSpec)}`;
  return `noref:row:${index}`;
}

/** Groups rows by design position; rows without any Ref Des fall back to part identity. */
export function buildBomDiffGroups(records: readonly MaterialWorkbookRecord[]): BomDiffGroup[] {
  const groups = new Map<string, BomDiffGroup>();
  records.forEach((record, index) => {
    const own = bomRefTokens(record.refDes);
    const tokens = own.length > 0 ? own : bomRefTokens(record.refGroup);
    const key = tokens.length > 0 ? tokens.join("|") : fallbackGroupKey(record, index);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(record);
      return;
    }
    groups.set(key, {
      key,
      tokens,
      rows: [record],
      primary: record,
      displayRef: tokens.length > 0 ? tokens.join(", ") : normalizeBomText(record.name) || "（無位號）",
      name: normalizeBomText(record.name),
      index,
    });
  });
  return [...groups.values()];
}

interface GroupMatch {
  before?: BomDiffGroup;
  after?: BomDiffGroup;
}

function matchGroups(before: BomDiffGroup[], after: BomDiffGroup[]): GroupMatch[] {
  const matches: GroupMatch[] = [];
  const usedBefore = new Set<string>();
  const usedAfter = new Set<string>();
  const beforeByKey = new Map(before.map((group) => [group.key, group]));

  for (const group of after) {
    const candidate = beforeByKey.get(group.key);
    if (candidate && !usedBefore.has(candidate.key)) {
      matches.push({ before: candidate, after: group });
      usedBefore.add(candidate.key);
      usedAfter.add(group.key);
    }
  }

  const tokenIndex = new Map<string, BomDiffGroup[]>();
  for (const group of before) {
    if (usedBefore.has(group.key)) continue;
    for (const token of group.tokens) {
      const list = tokenIndex.get(token);
      if (list) list.push(group);
      else tokenIndex.set(token, [group]);
    }
  }
  const candidates: Array<{ before: BomDiffGroup; after: BomDiffGroup; overlap: number }> = [];
  for (const group of after) {
    if (usedAfter.has(group.key) || group.tokens.length === 0) continue;
    const overlaps = new Map<BomDiffGroup, number>();
    for (const token of group.tokens) {
      for (const candidate of tokenIndex.get(token) ?? []) overlaps.set(candidate, (overlaps.get(candidate) ?? 0) + 1);
    }
    for (const [candidate, overlap] of overlaps) candidates.push({ before: candidate, after: group, overlap });
  }
  // Largest overlap first; ties prefer the tighter pair so a split group does not swallow its neighbour.
  candidates.sort((left, right) => right.overlap - left.overlap
    || (left.before.tokens.length + left.after.tokens.length) - (right.before.tokens.length + right.after.tokens.length)
    || collator.compare(left.after.key, right.after.key)
    || collator.compare(left.before.key, right.before.key));
  for (const candidate of candidates) {
    if (usedBefore.has(candidate.before.key) || usedAfter.has(candidate.after.key)) continue;
    matches.push({ before: candidate.before, after: candidate.after });
    usedBefore.add(candidate.before.key);
    usedAfter.add(candidate.after.key);
  }

  for (const group of before) if (!usedBefore.has(group.key)) matches.push({ before: group });
  for (const group of after) if (!usedAfter.has(group.key)) matches.push({ after: group });
  return matches;
}

interface LineMatch {
  before?: MaterialWorkbookRecord;
  after?: MaterialWorkbookRecord;
}

const lineKeys = (record: MaterialWorkbookRecord) => {
  const part = upper(record.partNumber);
  const mpn = upper(record.manufacturerPartNumber);
  // The same MPN typed with or without its dashes, slashes or spaces (RC0402FR-0710KL / RC0402FR0710KL).
  // Dots stay: SMBJ5.0A and SMBJ50A are different parts.
  const bare = mpn.replace(/[\s\-_/]+/g, "");
  const maker = upper(record.manufacturer);
  return {
    part: part ? `part:${part}` : "",
    vendorMpn: mpn ? `vendor:${maker}|${mpn}` : "",
    mpn: mpn ? `mpn:${mpn}` : "",
    bareMpn: bare ? `bare:${bare}` : "",
    vendorBare: bare && maker ? `vendor-bare:${maker}|${bare}` : "",
  };
};

const PLACEHOLDER_MPNS = new Set(["NA", "N/A", "TBD", "TBA", "NONE", "NULL", "無", "待確認", "待定"]);

/** A placeholder ("-", "N/A", "TBD") or a code too short to name one part is never searched for across the board. */
function isSearchableMpn(record: MaterialWorkbookRecord) {
  const mpn = upper(record.manufacturerPartNumber);
  const bare = mpn.replace(/[\s\-_/.]+/g, "");
  return bare.length >= 4 && /[0-9]/.test(bare) && !PLACEHOLDER_MPNS.has(mpn);
}

/** Strongest vendor identity first: 實體料號, 廠商+MPN, MPN, then the MPN without punctuation. */
const LINE_KEY_LEVELS = ["part", "vendorMpn", "mpn", "bareMpn"] as const;

/** Pairs vendor lines of two groups by 實體料號, then 廠商+MPN, then MPN, then the MPN without punctuation. */
export function matchBomVendorLines(before: readonly MaterialWorkbookRecord[], after: readonly MaterialWorkbookRecord[]): LineMatch[] {
  const matches: LineMatch[] = [];
  const usedBefore = new Set<MaterialWorkbookRecord>();
  const usedAfter = new Set<MaterialWorkbookRecord>();
  for (const level of LINE_KEY_LEVELS) {
    const index = new Map<string, MaterialWorkbookRecord[]>();
    for (const record of before) {
      if (usedBefore.has(record)) continue;
      const key = lineKeys(record)[level];
      if (!key) continue;
      const list = index.get(key);
      if (list) list.push(record);
      else index.set(key, [record]);
    }
    for (const record of after) {
      if (usedAfter.has(record)) continue;
      const key = lineKeys(record)[level];
      if (!key) continue;
      const candidate = (index.get(key) ?? []).find((item) => !usedBefore.has(item));
      if (!candidate) continue;
      matches.push({ before: candidate, after: record });
      usedBefore.add(candidate);
      usedAfter.add(record);
    }
  }
  for (const record of before) if (!usedBefore.has(record)) matches.push({ before: record });
  for (const record of after) if (!usedAfter.has(record)) matches.push({ after: record });
  return matches;
}

/** A vendor line with the Ref Des of the location it sits in. */
export interface BomLocatedLine {
  record: MaterialWorkbookRecord;
  tokens: readonly string[];
}

/**
 * Board-wide identities, strongest first. Across the whole board the vendor must agree, except for an
 * exact MPN that appears once on each side (the vendor name is often written differently).
 */
const MOVED_KEY_LEVELS = ["part", "vendorMpn", "vendorBare", "mpn"] as const;

/**
 * Second look for old lines that the location match left without a partner: the same vendor part
 * anywhere in the new version. Locations get renumbered, split, merged or lose their Ref Des on a
 * vendor row between two Excel files; an application in progress belongs to the part, so it should
 * follow it. Strongest identity first; among equal candidates the one sharing the most Ref Des wins,
 * then the earliest row. Each new line takes at most one old line.
 */
export function matchBomMovedLines(previous: readonly BomLocatedLine[], next: readonly BomLocatedLine[]) {
  const pairs: Array<{ before: BomLocatedLine; after: BomLocatedLine }> = [];
  const usedBefore = new Set<MaterialWorkbookRecord>();
  const usedAfter = new Set<MaterialWorkbookRecord>();
  const overlap = (left: readonly string[], right: readonly string[]) => {
    const tokens = new Set(left);
    return right.reduce((count, token) => count + (tokens.has(token) ? 1 : 0), 0);
  };
  const keyOf = (line: BomLocatedLine, level: (typeof MOVED_KEY_LEVELS)[number]) =>
    level !== "part" && !isSearchableMpn(line.record) ? "" : lineKeys(line.record)[level];
  for (const level of MOVED_KEY_LEVELS) {
    const index = new Map<string, BomLocatedLine[]>();
    for (const line of next) {
      if (usedAfter.has(line.record)) continue;
      const key = keyOf(line, level);
      if (!key) continue;
      const list = index.get(key);
      if (list) list.push(line);
      else index.set(key, [line]);
    }
    const previousCount = new Map<string, number>();
    if (level === "mpn") {
      for (const line of previous) {
        if (usedBefore.has(line.record)) continue;
        const key = keyOf(line, level);
        if (key) previousCount.set(key, (previousCount.get(key) ?? 0) + 1);
      }
    }
    for (const line of previous) {
      if (usedBefore.has(line.record)) continue;
      const key = keyOf(line, level);
      if (!key) continue;
      const candidates = (index.get(key) ?? []).filter((candidate) => !usedAfter.has(candidate.record));
      // Without the vendor, only a part that is unambiguous on both sides moves.
      if (level === "mpn" && (candidates.length !== 1 || previousCount.get(key) !== 1)) continue;
      let best: BomLocatedLine | undefined;
      let bestOverlap = -1;
      for (const candidate of candidates) {
        const score = overlap(line.tokens, candidate.tokens);
        if (score > bestOverlap) { best = candidate; bestOverlap = score; }
      }
      if (!best) continue;
      pairs.push({ before: line, after: best });
      usedBefore.add(line.record);
      usedAfter.add(best.record);
    }
  }
  return pairs;
}

const isImportedTrackingEntry = (entry: MaterialTrackingHistoryEntry) => entry.id.startsWith(IMPORTED_TRACKING_PREFIX);

/**
 * True when the row holds something entered on the website (not text read from the uploaded Excel):
 * an update in the tracking history, a status set before history existed, 需申請, the 負責人 or
 * 分類 picked in 待處理料, the website Note, or SPEC attachments.
 */
export function bomRecordHasWebsiteData(record: MaterialWorkbookRecord) {
  const history = record.trackingHistory ?? [];
  const ownEntries = history.some((entry) => !isImportedTrackingEntry(entry));
  const status = normalizeBomText(record.trackingStatus);
  const importedStatus = normalizeBomText([...history].reverse().find(isImportedTrackingEntry)?.status);
  const statusWithoutHistory = !ownEntries && Boolean(status) && status !== "未處理" && status !== "無狀態" && status !== importedStatus;
  return Boolean(
    ownEntries
    || statusWithoutHistory
    || record.applicationRequired === true
    || normalizeBomText(record.requestOwnerName)
    || normalizeBomText(record.requestOwnerId)
    || normalizeBomText(record.note)
    || Boolean(record.pendingCategory)
    || getMaterialSpecDocuments(record).length > 0,
  );
}

export function bomDiffFieldValue(record: MaterialWorkbookRecord | undefined, field: BomDiffField): string {
  if (!record) return "";
  if (field === "grouping") return [normalizeBomText(record.sectionName), normalizeBomText(record.assemblyName)].filter(Boolean).join(" / ");
  if (field === "refDes") return bomRefTokens(record.refDes).join(", ") || bomRefTokens(record.refGroup).join(", ");
  return normalizeBomText(record[field]);
}

function sameFieldValue(field: BomDiffField, before: string, after: string) {
  if (field === "qty") {
    const left = Number(before.replace(/,/g, ""));
    const right = Number(after.replace(/,/g, ""));
    if (before !== "" && after !== "" && Number.isFinite(left) && Number.isFinite(right)) return left === right;
  }
  if (field === "refDes") return before === after;
  return before === after;
}

const vendorLabel = (record: MaterialWorkbookRecord | undefined) => {
  if (!record) return "";
  return [normalizeBomText(record.manufacturer), normalizeBomText(record.manufacturerPartNumber)].filter(Boolean).join(" / ");
};

const lineIdentity = (record: MaterialWorkbookRecord | undefined) => {
  if (!record) return "";
  return upper(record.partNumber) || upper(record.manufacturerPartNumber) || `${upper(record.manufacturer)}|${upper(record.name)}`;
};

function latestEntry(history: MaterialTrackingHistoryEntry[] | undefined) {
  return history && history.length > 0 ? history[history.length - 1] : undefined;
}

/**
 * True when the row carries anything maintained on the website rather than in the
 * imported Excel: tracking status, history, ticket or link, the 負責人 or 分類 picked
 * in 待處理料, the website Note, or SPEC attachments.
 */
export function bomRecordHasTracking(record: MaterialWorkbookRecord) {
  const latest = latestEntry(record.trackingHistory);
  return Boolean(
    (record.trackingHistory?.length ?? 0) > 0
    || record.applicationRequired === true
    || normalizeBomText(record.trackingStatus)
    || normalizeBomText(record.trackingNote)
    || normalizeBomText(record.requestTicket)
    || normalizeBomText(record.requestUrl)
    || normalizeBomText(latest?.note)
    || normalizeBomText(latest?.requestInfo)
    || normalizeBomText(record.requestOwnerName)
    || normalizeBomText(record.requestOwnerId)
    || normalizeBomText(record.note)
    || Boolean(record.pendingCategory)
    || getMaterialSpecDocuments(record).length > 0,
  );
}

const PENDING_CATEGORY_LABELS: Record<NonNullable<MaterialWorkbookRecord["pendingCategory"]>, string> = { connector: "CONNECTOR", ic: "IC", rlc: "RLC", other: "其他" };

/** Short labels of the website data on a row, for the 未帶入 detail ("狀態 已發信", "負責人 王小明", ...). */
export function describeBomWebsiteData(record: MaterialWorkbookRecord) {
  const latest = latestEntry(record.trackingHistory);
  const status = normalizeBomText(record.trackingStatus) || normalizeBomText(latest?.status);
  const progress = normalizeBomText(latest?.note) || normalizeBomText(record.trackingNote) || normalizeBomText(latest?.requestInfo);
  const owner = normalizeBomText(record.requestOwnerName);
  const note = normalizeBomText(record.note);
  const documents = getMaterialSpecDocuments(record).length;
  const ticket = normalizeBomText(record.requestTicket) || normalizeBomText(latest?.requestTicket);
  return [
    status && `狀態 ${status}`,
    progress && `進度 ${progress}`,
    ticket && `單號 ${ticket}`,
    owner && `負責人 ${owner}`,
    note && `Note ${note}`,
    documents > 0 && `SPEC 附件 ${documents} 個`,
    record.pendingCategory && `待處理分類 ${PENDING_CATEGORY_LABELS[record.pendingCategory] ?? record.pendingCategory}`,
    !status && record.applicationRequired === true && "需申請",
    !status && (record.trackingHistory?.length ?? 0) > 0 && `追蹤紀錄 ${record.trackingHistory!.length} 筆`,
  ].filter((item): item is string => Boolean(item));
}

function diffLine(before: MaterialWorkbookRecord | undefined, after: MaterialWorkbookRecord | undefined): BomVendorLineChange {
  if (!before) return { kind: "added", after, changes: [] };
  if (!after) return { kind: "removed", before, changes: [] };
  const changes: BomFieldChange[] = [];
  for (const field of BOM_DIFF_FIELDS) {
    if (field.scope !== "line") continue;
    const left = bomDiffFieldValue(before, field.key);
    const right = bomDiffFieldValue(after, field.key);
    if (!sameFieldValue(field.key, left, right)) changes.push({ field: field.key, label: field.label, before: left, after: right, vendor: vendorLabel(after) || vendorLabel(before) });
  }
  return { kind: changes.length > 0 ? "changed" : "same", before, after, changes };
}

function entrySearchText(entry: Pick<BomDiffEntry, "displayRef" | "name" | "before" | "after" | "changes">) {
  const parts = [entry.displayRef, entry.name];
  for (const group of [entry.before, entry.after]) {
    for (const row of group?.rows ?? []) {
      parts.push(row.manufacturer, row.manufacturerPartNumber, row.partNumber, row.virtualAlternative ?? "", row.partName, row.partSpec);
    }
  }
  for (const change of entry.changes) parts.push(change.before, change.after);
  return normalizeBomText(parts.join(" ")).toLowerCase();
}

function buildEntry(match: GroupMatch): BomDiffEntry {
  const { before, after } = match;
  const kinds = new Set<BomChangeKind>();
  const changes: BomFieldChange[] = [];
  const lines: BomVendorLineChange[] = [];
  let refAdded: string[] = [];
  let refRemoved: string[] = [];

  if (before && after) {
    const beforeTokens = new Set(before.tokens);
    const afterTokens = new Set(after.tokens);
    refAdded = after.tokens.filter((token) => !beforeTokens.has(token));
    refRemoved = before.tokens.filter((token) => !afterTokens.has(token));
    for (const field of BOM_DIFF_FIELDS) {
      if (field.scope !== "group") continue;
      const left = bomDiffFieldValue(before.primary, field.key);
      const right = bomDiffFieldValue(after.primary, field.key);
      if (sameFieldValue(field.key, left, right)) continue;
      changes.push({ field: field.key, label: field.label, before: left, after: right });
      kinds.add(field.kind);
    }
    for (const line of matchBomVendorLines(before.rows, after.rows)) {
      const change = diffLine(line.before, line.after);
      lines.push(change);
      if (change.kind === "added" || change.kind === "removed") {
        kinds.add(line.before === before.primary || line.after === after.primary ? "primary" : "vendors");
        continue;
      }
      for (const fieldChange of change.changes) {
        changes.push(fieldChange);
        const kind = BOM_DIFF_FIELDS.find((field) => field.key === fieldChange.field)?.kind ?? "spec";
        kinds.add(kind === "vendors" && (line.before === before.primary || line.after === after.primary) ? "primary" : kind);
      }
    }
    if (lineIdentity(before.primary) !== lineIdentity(after.primary)) kinds.add("primary");
  } else if (after) {
    kinds.add("added");
    for (const row of after.rows) lines.push({ kind: "added", after: row, changes: [] });
  } else if (before) {
    kinds.add("removed");
    for (const row of before.rows) lines.push({ kind: "removed", before: row, changes: [] });
  }

  const impact = [...kinds].reduce<BomChangeImpact>((current, kind) => {
    const candidate = KIND_IMPACTS.get(kind) ?? "text";
    return IMPACT_RANK[candidate] > IMPACT_RANK[current] ? candidate : current;
  }, "none");
  const trackingLost = lines.filter((line) => line.kind === "removed" && line.before && bomRecordHasTracking(line.before)).length;
  const group = after ?? before!;
  const entry: BomDiffEntry = {
    id: group.key,
    kinds: BOM_CHANGE_KINDS.map((kind) => kind.key).filter((kind) => kinds.has(kind)),
    impact,
    displayRef: group.displayRef,
    name: after?.name || before?.name || "",
    before,
    after,
    refAdded,
    refRemoved,
    changes,
    lines,
    trackingLost,
    trackingAfter: Boolean(after?.rows.some(bomRecordHasTracking)),
    searchText: "",
  };
  entry.searchText = entrySearchText(entry);
  return entry;
}

/** Compares two versions of the same BOM; entries include unchanged groups so the view can show everything. */
export function diffBomRecords(before: readonly MaterialWorkbookRecord[], after: readonly MaterialWorkbookRecord[]): BomDiffResult {
  const beforeGroups = buildBomDiffGroups(before);
  const afterGroups = buildBomDiffGroups(after);
  const entries = matchGroups(beforeGroups, afterGroups).map(buildEntry);
  markMovedAndUncarriedLines(entries, before, after);
  entries.sort((left, right) => collator.compare(left.displayRef, right.displayRef) || collator.compare(left.id, right.id));
  const kinds = Object.fromEntries(BOM_CHANGE_KINDS.map((kind) => [kind.key, 0])) as Record<BomChangeKind, number>;
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  let trackingLost = 0;
  let recarry = 0;
  for (const entry of entries) {
    for (const kind of entry.kinds) kinds[kind] += 1;
    if (entry.kinds.includes("added")) added += 1;
    else if (entry.kinds.includes("removed")) removed += 1;
    else if (entry.kinds.length > 0) changed += 1;
    else unchanged += 1;
    trackingLost += entry.trackingLost;
    recarry += entry.lines.filter((line) => line.notCarried).length;
  }
  return {
    entries,
    summary: {
      beforeRows: before.length,
      afterRows: after.length,
      beforeGroups: beforeGroups.length,
      afterGroups: afterGroups.length,
      added,
      removed,
      changed,
      unchanged,
      kinds,
      trackingLost,
      recarry,
    },
  };
}

/**
 * Applies the same second look as the carry-over to a comparison: an old line with website data
 * whose part moved to another location is not lost (its new location is named), and a pair whose
 * new line lacks the old line's website data (an upload that missed it) is counted as 未帶入.
 */
function markMovedAndUncarriedLines(entries: BomDiffEntry[], before: readonly MaterialWorkbookRecord[], after: readonly MaterialWorkbookRecord[]) {
  const beforeIndex = new Map(before.map((record, index) => [record, index]));
  const afterIndex = new Map(after.map((record, index) => [record, index]));
  const removed: Array<BomLocatedLine & { line: BomVendorLineChange }> = [];
  const added: Array<BomLocatedLine & { line: BomVendorLineChange; entry: BomDiffEntry }> = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.kind === "removed" && line.before && bomRecordHasWebsiteData(line.before)) removed.push({ record: line.before, tokens: entry.before?.tokens ?? [], line });
      if (line.kind === "added" && line.after) added.push({ record: line.after, tokens: entry.after?.tokens ?? [], line, entry });
    }
  }
  // Row order, as the carry-over walks them, so both pick the same partner on a tie.
  removed.sort((left, right) => (beforeIndex.get(left.record) ?? 0) - (beforeIndex.get(right.record) ?? 0));
  added.sort((left, right) => (afterIndex.get(left.record) ?? 0) - (afterIndex.get(right.record) ?? 0));
  const removedByRecord = new Map(removed.map((item) => [item.record, item]));
  const addedByRecord = new Map(added.map((item) => [item.record, item]));
  const fromEntry = new Map<MaterialWorkbookRecord, BomDiffEntry>();
  for (const entry of entries) for (const line of entry.lines) if (line.before) fromEntry.set(line.before, entry);
  for (const pair of matchBomMovedLines(removed, added)) {
    const old = removedByRecord.get(pair.before.record)!;
    const target = addedByRecord.get(pair.after.record)!;
    old.line.movedTo = target.entry.displayRef;
    old.line.movedRecord = pair.after.record;
    target.line.movedFrom = fromEntry.get(pair.before.record)?.displayRef ?? "";
    if (needsRecarry(pair.before.record, pair.after.record)) old.line.notCarried = true;
  }
  for (const entry of entries) {
    for (const line of entry.lines) {
      if ((line.kind === "same" || line.kind === "changed") && line.before && line.after && needsRecarry(line.before, line.after)) line.notCarried = true;
    }
    entry.trackingLost = entry.lines.filter((line) => isLostLine(line)).length;
  }
}

/**
 * The new line has none of the old line's website data, and carrying it would really give it some
 * (a status typed in the new Excel can win over the old one; that is not something 帶入 can fill).
 */
function needsRecarry(before: MaterialWorkbookRecord, after: MaterialWorkbookRecord) {
  return bomRecordHasWebsiteData(before) && !bomRecordHasWebsiteData(after) && bomRecordHasWebsiteData(carryLine(before, after));
}

/** Old website data that the new version does not hold: no counterpart at all, or a counterpart that never received it. */
export function isLostLine(line: BomVendorLineChange) {
  if (line.notCarried) return true;
  return line.kind === "removed" && !line.movedTo && Boolean(line.before && bomRecordHasTracking(line.before));
}

/**
 * One line per change for the 變更內容 column: field changes first, then the vendor
 * lines that appeared or disappeared, named by 廠商 / MPN instead of "N 處增減".
 */
export function bomDiffEntryPreview(entry: Pick<BomDiffEntry, "kinds" | "changes" | "lines" | "before" | "after">) {
  if (entry.kinds.includes("added")) return [`新版新增 ${entry.after?.rows.length ?? 0} 筆廠商明細`];
  if (entry.kinds.includes("removed")) return [`舊版 ${entry.before?.rows.length ?? 0} 筆廠商明細在新版消失`];
  const vendorText = (record: MaterialWorkbookRecord | undefined) => vendorLabel(record) || normalizeBomText(record?.partNumber) || "（未填廠商）";
  return [
    ...entry.changes.map((change) => `${change.label}：${change.before || "（空白）"} → ${change.after || "（空白）"}`),
    ...entry.lines.filter((line) => line.kind === "removed").map((line) => `移除廠商：${vendorText(line.before)}`),
    ...entry.lines.filter((line) => line.kind === "added").map((line) => `新增廠商：${vendorText(line.after)}`),
  ];
}

const isImportedEntry = (entry: MaterialTrackingHistoryEntry) => entry.id.startsWith(IMPORTED_TRACKING_PREFIX);

function hasEntryContent(entry: MaterialTrackingHistoryEntry) {
  return [entry.status, entry.note, entry.requestInfo, entry.requestTicket, entry.requestUrl].some((value) => normalizeBomText(value).length > 0);
}

/** New imported entries first, then the previous version's manual entries; same rule as the legacy same-file merge. */
export function mergeBomTrackingHistories(previous: MaterialTrackingHistoryEntry[] = [], imported: MaterialTrackingHistoryEntry[] = []) {
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const importedIds = new Set(imported.map((entry) => entry.id));
  const importedEntries = imported.map((entry) => ({ ...(previousById.get(entry.id) ?? {}), ...entry }));
  const preserved = previous.filter((entry) => !importedIds.has(entry.id) && !isImportedEntry(entry));
  return [...importedEntries, ...preserved];
}

const filled = (value: string | undefined) => (normalizeBomText(value) ? (value as string) : "");

/**
 * Website-only fields never come from an imported workbook (Note, 負責人, SPEC files),
 * so they always follow the matched line; the newer copy wins when both have one.
 */
function carryWebsiteFields(primary: MaterialWorkbookRecord, fallback: MaterialWorkbookRecord) {
  const documents = getMaterialSpecDocuments({ specDocuments: [...getMaterialSpecDocuments(primary), ...getMaterialSpecDocuments(fallback)] });
  const ownerSource = normalizeBomText(primary.requestOwnerName) || normalizeBomText(primary.requestOwnerId) ? primary : fallback;
  return {
    note: filled(primary.note) || fallback.note || "",
    ...(ownerSource.requestOwnerId ? { requestOwnerId: ownerSource.requestOwnerId } : {}),
    ...(ownerSource.requestOwnerName ? { requestOwnerName: ownerSource.requestOwnerName } : {}),
    ...(documents.length > 0 ? { specDocuments: documents, specDocument: documents[0] } : {}),
    pendingCategory: primary.pendingCategory ?? fallback.pendingCategory,
  };
}

/** A new Excel upload: tracking typed into the workbook is refreshed, everything else follows from the old version. */
function carryLine(previous: MaterialWorkbookRecord, next: MaterialWorkbookRecord): MaterialWorkbookRecord {
  const importedHasTracking = Boolean(normalizeBomText(next.trackingStatus) || (next.trackingHistory ?? []).some(hasEntryContent));
  const previousHadImported = (previous.trackingHistory ?? []).some(isImportedEntry);
  const trackingHistory = mergeBomTrackingHistories(previous.trackingHistory, next.trackingHistory);
  const latest = latestEntry(trackingHistory);
  const pick = (own: string | undefined, fromLatest: string | undefined, fromPrevious: string | undefined) =>
    normalizeBomText(own) ? (own as string) : normalizeBomText(fromLatest) ? (fromLatest as string) : previousHadImported ? "" : fromPrevious ?? "";
  return {
    ...next,
    trackingStatus: importedHasTracking
      ? (normalizeBomText(next.trackingStatus) || "新增追蹤")
      : (normalizeBomText(latest?.status) || (previousHadImported ? "" : normalizeBomText(previous.trackingStatus)) || ""),
    trackingHistory,
    trackingNote: pick(next.trackingNote, latest?.note, previous.trackingNote),
    requestTicket: pick(next.requestTicket, latest?.requestTicket, previous.requestTicket),
    requestUrl: pick(next.requestUrl, latest?.requestUrl, previous.requestUrl),
    remark: normalizeBomText(next.remark) ? next.remark : previous.remark ?? "",
    ...carryWebsiteFields(previous, next),
    ...(typeof (next.applicationRequired ?? previous.applicationRequired) === "boolean" ? { applicationRequired: next.applicationRequired ?? previous.applicationRequired } : {}),
  };
}

const entryTime = (entry: MaterialTrackingHistoryEntry) => {
  const parsed = Date.parse(entry.createdAt ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Making another version current again. The version that was current is the live
 * copy, so its Note, 負責人, SPEC files and 分類 replace the target's, including
 * values that were cleared on purpose. History is never lost: entries only the
 * target has stay in front, except entries dated after everything the current
 * version has (made while the target was current), which go last and decide the
 * status. Undated entries are never given a date; they simply stay in front.
 */
function carryLineFromCurrent(current: MaterialWorkbookRecord, target: MaterialWorkbookRecord): MaterialWorkbookRecord {
  const ownHistory = current.trackingHistory ?? [];
  const targetHistory = target.trackingHistory ?? [];
  // Progress kept only on the record (no history yet) would lose to the target's entries, because the latest entry
  // is what the page shows. Keep it as the undated legacy entry, the same thing the tracking editor does before its first entry.
  const legacy = ownHistory.length === 0 && targetHistory.length > 0 ? getLatestTrackingEntry(current) : null;
  // The target may already hold this same legacy entry from an earlier switch: reuse it instead of storing it twice.
  const sameId = legacy ? targetHistory.find((entry) => entry.id === legacy.id) : undefined;
  const sameContent = (entry: MaterialTrackingHistoryEntry) => legacy !== null
    && (["status", "note", "requestTicket", "requestUrl"] as const).every((key) => normalizeBomText(entry[key]) === normalizeBomText(legacy[key]));
  const legacyEntry = !legacy ? null : !sameId ? legacy : sameContent(sameId) ? sameId : { ...legacy, id: `${legacy.id}:${current.id}` };
  const currentHistory = legacyEntry ? [legacyEntry] : ownHistory;
  const currentIds = new Set(currentHistory.map((entry) => entry.id));
  const targetOnly = targetHistory.filter((entry) => !currentIds.has(entry.id));
  const currentTimes = currentHistory.map(entryTime).filter((value): value is number => value !== null);
  const currentNewest = currentTimes.length > 0 ? Math.max(...currentTimes) : null;
  const newer = currentNewest === null ? [] : targetOnly.filter((entry) => (entryTime(entry) ?? -Infinity) > currentNewest);
  const trackingHistory = [...targetOnly.filter((entry) => !newer.includes(entry)), ...currentHistory, ...newer];
  const latest = latestEntry(trackingHistory);
  const currentLatest = latestEntry(currentHistory);
  // Only progress fields decide whether the current version "has tracking"; a Note alone does not clear an old status.
  const currentHasTracking = Boolean(currentHistory.length > 0 || normalizeBomText(current.trackingStatus) || normalizeBomText(current.trackingNote)
    || normalizeBomText(current.requestTicket) || normalizeBomText(current.requestUrl));
  const progress = newer.length > 0
    // The newest entries are the target's own, so is the progress that went with them (a ticket cleared there stays cleared).
    ? { status: normalizeBomText(latest?.status) || target.trackingStatus || "", note: target.trackingNote ?? "", ticket: target.requestTicket ?? "", url: target.requestUrl ?? "" }
    : currentHasTracking
      ? { status: filled(current.trackingStatus) || normalizeBomText(currentLatest?.status), note: current.trackingNote ?? "", ticket: current.requestTicket ?? "", url: current.requestUrl ?? "" }
      // The current version never tracked this line: the target keeps its own progress.
      : { status: target.trackingStatus ?? "", note: target.trackingNote ?? "", ticket: target.requestTicket ?? "", url: target.requestUrl ?? "" };
  const documents = getMaterialSpecDocuments(current);
  const applicationRequired = current.applicationRequired ?? target.applicationRequired;
  return {
    ...target,
    trackingStatus: progress.status,
    trackingHistory,
    trackingNote: progress.note,
    requestTicket: progress.ticket,
    requestUrl: progress.url,
    // remark is a workbook column: the target's own value, or the current one when the target's is blank (same as an upload).
    remark: normalizeBomText(target.remark) ? target.remark : current.remark ?? "",
    note: current.note ?? "",
    requestOwnerId: current.requestOwnerId,
    requestOwnerName: current.requestOwnerName,
    specDocuments: documents.length > 0 ? documents : undefined,
    specDocument: documents[0],
    pendingCategory: current.pendingCategory,
    ...(typeof applicationRequired === "boolean" ? { applicationRequired } : {}),
  };
}

export interface BomCarryResult {
  records: MaterialWorkbookRecord[];
  /** Old lines matched to a new line by position and vendor identity. */
  matched: number;
  /** Matched old lines that had website data (tracking, Note, 負責人, SPEC files) carried over. */
  tracked: number;
  /** Of those, lines found by vendor part at another location (renumbered or regrouped). */
  moved: number;
  orphaned: MaterialWorkbookRecord[];
  manual: number;
}

/**
 * Old and new lines that are the same part: by location and vendor first, then old lines with
 * website data that found no partner are looked up by vendor part anywhere in the new version.
 * Shared by the upload carry-over and 帶入舊版資料, and the same rule the comparison uses.
 */
export function pairBomLines(previous: readonly MaterialWorkbookRecord[], next: readonly MaterialWorkbookRecord[]) {
  const pairs: Array<{ before: MaterialWorkbookRecord; after: MaterialWorkbookRecord; moved: boolean }> = [];
  const usedPrevious = new Set<MaterialWorkbookRecord>();
  const usedNext = new Set<MaterialWorkbookRecord>();
  const previousGroups = buildBomDiffGroups(previous);
  const nextGroups = buildBomDiffGroups(next);
  for (const match of matchGroups(previousGroups, nextGroups)) {
    if (!match.before || !match.after) continue;
    for (const line of matchBomVendorLines(match.before.rows, match.after.rows)) {
      if (!line.before || !line.after) continue;
      pairs.push({ before: line.before, after: line.after, moved: false });
      usedPrevious.add(line.before);
      usedNext.add(line.after);
    }
  }
  const tokensOf = (groups: BomDiffGroup[]) => new Map(groups.flatMap((group) => group.rows.map((row) => [row, group.tokens] as const)));
  const previousTokens = tokensOf(previousGroups);
  const nextTokens = tokensOf(nextGroups);
  const moved = matchBomMovedLines(
    // Only data entered on the website follows a part elsewhere; text read from the old Excel stays with its row.
    previous.filter((record) => !usedPrevious.has(record) && bomRecordHasWebsiteData(record)).map((record) => ({ record, tokens: previousTokens.get(record) ?? [] })),
    next.filter((record) => !usedNext.has(record)).map((record) => ({ record, tokens: nextTokens.get(record) ?? [] })),
  );
  for (const pair of moved) {
    pairs.push({ before: pair.before.record, after: pair.after.record, moved: true });
    usedPrevious.add(pair.before.record);
  }
  return { pairs, usedPrevious };
}

/**
 * Copies website data (RD tracking, Note, 負責人, SPEC files) from the previous
 * version onto the matching rows of the new version. Rows are matched by design
 * position and vendor identity, never by row number. Old rows with data and no
 * counterpart are reported, not dropped. `from: "current"` is the switch back to an
 * older version, where the version that was current wins over the target's own data.
 */
export function carryBomTracking(previous: readonly MaterialWorkbookRecord[], next: readonly MaterialWorkbookRecord[], options: { from?: "upload" | "current" } = {}): BomCarryResult {
  const fromCurrent = options.from === "current";
  const carryOne = fromCurrent ? carryLineFromCurrent : carryLine;
  const carried = new Map<MaterialWorkbookRecord, MaterialWorkbookRecord>();
  const { pairs, usedPrevious: matchedPrevious } = pairBomLines(previous, next);
  let tracked = 0;
  let moved = 0;
  for (const pair of pairs) {
    // Switching back replaces the target's Note, 負責人 and SPEC files; a part found at another location
    // only fills a target row that has nothing of its own.
    if (fromCurrent && pair.moved && bomRecordHasWebsiteData(pair.after)) continue;
    carried.set(pair.after, carryOne(pair.before, pair.after));
    if (bomRecordHasTracking(pair.before)) tracked += 1;
    if (pair.moved) moved += 1;
  }
  const nextIds = new Set(next.map((record) => record.id));
  const manualRecords = previous.filter((record) => record.id.startsWith(MANUAL_RECORD_PREFIX) && !matchedPrevious.has(record) && !nextIds.has(record.id));
  const orphaned = previous.filter((record) => !matchedPrevious.has(record) && !manualRecords.includes(record) && bomRecordHasTracking(record));
  return {
    records: [...next.map((record) => carried.get(record) ?? record), ...manualRecords.map((record) => ({ ...record }))],
    matched: matchedPrevious.size,
    tracked,
    moved,
    orphaned,
    manual: manualRecords.length,
  };
}

export interface BomRecarryResult {
  /** The version's rows with the filled ones replaced, in their order. */
  records: MaterialWorkbookRecord[];
  /** Only the rows that received old website data, to write back one by one. */
  filled: MaterialWorkbookRecord[];
  /** Old lines with website data that still have no counterpart in this version. */
  remaining: number;
}

/**
 * 帶入舊版資料: fills website data that an earlier upload left behind (an older matching rule, or
 * a part that moved to another location). Only rows that have no website data of their own are
 * filled, so anything entered on this version since stays as it is; running it twice changes nothing.
 * Manual rows are never re-added: one missing here was deleted on purpose.
 */
export function recarryBomTracking(previous: readonly MaterialWorkbookRecord[], current: readonly MaterialWorkbookRecord[]): BomRecarryResult {
  const { pairs } = pairBomLines(previous, current);
  const replacements = new Map<MaterialWorkbookRecord, MaterialWorkbookRecord>();
  for (const pair of pairs) {
    if (!needsRecarry(pair.before, pair.after)) continue;
    replacements.set(pair.after, carryLine(pair.before, pair.after));
  }
  const records = current.map((record) => replacements.get(record) ?? record);
  return {
    records,
    filled: [...replacements.values()],
    remaining: diffBomRecords(previous, records).summary.trackingLost,
  };
}

export interface BomRetainedApplication {
  /** The other version's row under an id of its own, so it never collides with a row of the version on screen. */
  record: MaterialWorkbookRecord;
  /** The row's id in the version it comes from. */
  sourceRecordId: string;
  fromWorkspaceId: string;
  /** "V1" */
  fromLabel: string;
  /** gone: this version has no such part (position, vendor or MPN changed); uncarried: the part is here but the application cannot be brought over automatically. */
  reason: "gone" | "uncarried";
}

export interface BomVersionLink {
  workspaceId: string;
  label: string;
  records: readonly MaterialWorkbookRecord[];
  /** Each application row's partner on screen, by id. */
  toCurrent: ReadonlyMap<MaterialWorkbookRecord, string>;
  /** Each row's partner in the next newer version of the chain; absent for the newest one, whose next version is the one on screen. */
  toNewer?: ReadonlyMap<MaterialWorkbookRecord, MaterialWorkbookRecord>;
}

/** An application entered on the website (an editor update, a status set by hand, 需申請), not only status text read from an Excel. */
const isWebsiteApplication = (record: MaterialWorkbookRecord) => isTrackedMaterialApplication(record) && bomRecordHasWebsiteData(record);

/**
 * The structural half of findRetainedApplications, kept apart so the page can reuse it while only statuses change:
 * which row on screen (by id) each row of the other versions pairs with, and which row of the next newer version.
 * `others` is newest first.
 */
export function linkBomVersions(
  current: readonly MaterialWorkbookRecord[],
  others: ReadonlyArray<{ workspaceId: string; label: string; records: readonly MaterialWorkbookRecord[] }>,
): BomVersionLink[] {
  return others.map((version, index) => {
    const toCurrent = new Map<MaterialWorkbookRecord, string>();
    for (const pair of pairBomLines(version.records, current).pairs) toCurrent.set(pair.before, pair.after.id);
    const toNewer = index === 0 ? undefined : new Map(pairBomLines(version.records, others[index - 1].records).pairs.map((pair) => [pair.before, pair.after] as const));
    return { workspaceId: version.workspaceId, label: version.label, records: version.records, toCurrent, ...(toNewer ? { toNewer } : {}) };
  });
}

export interface BomRetainedResult {
  retained: BomRetainedApplication[];
  /** Applications whose part is on screen without them, that 帶入舊版資料 from the previous version fills; not listed twice. */
  recarry: number;
}

/**
 * Applications made on other versions of the board that the version on screen does not hold. An application belongs to
 * the board's process even when a new Excel drops that vendor line (AGENTS.md: 申請過的料件…待處理料、每週進度與匯出都須保留),
 * so 待處理料, 每週申請進度 and their exports keep showing it, read-only, from the version it was made on.
 * - A row whose copy in the next newer version still holds the application is that copy's history: skipped.
 * - A row whose partner on screen holds an application is already listed there: skipped.
 * - A row whose partner on screen lacks it and that 帶入舊版資料 can fill (from the previous version) is only counted,
 *   so the same vendor line is never listed twice; the page offers the fill instead.
 * - Everything else is listed once (gone, or uncarried when it cannot be filled automatically).
 */
export function classifyRetainedApplications(
  links: readonly BomVersionLink[],
  currentById: ReadonlyMap<string, MaterialWorkbookRecord>,
  previousWorkspaceId?: string,
): BomRetainedResult {
  const seen = new Set<string>();
  const retained: BomRetainedApplication[] = [];
  let recarry = 0;
  for (const link of links) {
    for (const record of link.records) {
      if (!isWebsiteApplication(record)) continue;
      const newer = link.toNewer?.get(record);
      if (newer && isWebsiteApplication(newer)) continue;
      const partnerId = link.toCurrent.get(record);
      const partner = partnerId ? currentById.get(partnerId) : undefined;
      if (partner && isTrackedMaterialApplication(partner)) continue;
      if (partner && link.workspaceId === previousWorkspaceId && needsRecarry(record, partner)) {
        recarry += 1;
        continue;
      }
      const refs = bomRefTokens(record.refDes).join("|") || bomRefTokens(record.refGroup).join("|") || `name:${upper(record.name)}`;
      const identity = [refs, upper(record.manufacturer), upper(record.manufacturerPartNumber)].join("¦");
      if (seen.has(identity)) continue;
      seen.add(identity);
      const reason = partner ? "uncarried" as const : "gone" as const;
      retained.push({
        record: { ...record, id: `retained:${link.workspaceId}:${record.id}`, retainedFrom: { workspaceId: link.workspaceId, label: link.label, reason } },
        sourceRecordId: record.id,
        fromWorkspaceId: link.workspaceId,
        fromLabel: link.label,
        reason,
      });
    }
  }
  return { retained, recarry };
}

/** linkBomVersions and classifyRetainedApplications in one call. */
export function findRetainedApplications(
  current: readonly MaterialWorkbookRecord[],
  others: ReadonlyArray<{ workspaceId: string; label: string; records: readonly MaterialWorkbookRecord[] }>,
  previousWorkspaceId?: string,
): BomRetainedResult {
  return classifyRetainedApplications(linkBomVersions(current, others), new Map(current.map((record) => [record.id, record] as const)), previousWorkspaceId);
}
