/**
 * Content-based BOM comparison and tracking carry-over.
 *
 * Rows are grouped by Ref Des, groups are matched by Ref Des overlap and vendor
 * lines by 實體料號 → 廠商+MPN → MPN, so inserted rows or re-ordered sheets never
 * shift the comparison. Pure functions only: no React, no Supabase, no imports
 * with runtime side effects, so the module also runs under `node --test`.
 */
import type { MaterialTrackingHistoryEntry, MaterialWorkbookRecord } from "./materialRequestUtils";

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
}

export interface BomDiffResult {
  entries: BomDiffEntry[];
  summary: BomDiffSummary;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function normalizeBomText(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

const upper = (value: unknown) => normalizeBomText(value).toUpperCase();

/** Ref Des tokens, uppercase, de-duplicated and numerically sorted; mirrors splitRefDesignators. */
export function bomRefTokens(...values: unknown[]) {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of normalizeBomText(value).split(/[\s,，、;；]+/)) {
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
  return {
    part: part ? `part:${part}` : "",
    vendorMpn: mpn ? `vendor:${upper(record.manufacturer)}|${mpn}` : "",
    mpn: mpn ? `mpn:${mpn}` : "",
  };
};

/** Pairs vendor lines of two groups by 實體料號, then 廠商+MPN, then MPN. */
export function matchBomVendorLines(before: readonly MaterialWorkbookRecord[], after: readonly MaterialWorkbookRecord[]): LineMatch[] {
  const matches: LineMatch[] = [];
  const usedBefore = new Set<MaterialWorkbookRecord>();
  const usedAfter = new Set<MaterialWorkbookRecord>();
  for (const level of ["part", "vendorMpn", "mpn"] as const) {
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

/** True when the row carries any tracking status, note, ticket, link or history. */
export function bomRecordHasTracking(record: MaterialWorkbookRecord) {
  const latest = latestEntry(record.trackingHistory);
  return Boolean(
    (record.trackingHistory?.length ?? 0) > 0
    || normalizeBomText(record.trackingStatus)
    || normalizeBomText(record.trackingNote)
    || normalizeBomText(record.requestTicket)
    || normalizeBomText(record.requestUrl)
    || normalizeBomText(latest?.note)
    || normalizeBomText(latest?.requestInfo),
  );
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
  entries.sort((left, right) => collator.compare(left.displayRef, right.displayRef) || collator.compare(left.id, right.id));
  const kinds = Object.fromEntries(BOM_CHANGE_KINDS.map((kind) => [kind.key, 0])) as Record<BomChangeKind, number>;
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  let trackingLost = 0;
  for (const entry of entries) {
    for (const kind of entry.kinds) kinds[kind] += 1;
    if (entry.kinds.includes("added")) added += 1;
    else if (entry.kinds.includes("removed")) removed += 1;
    else if (entry.kinds.length > 0) changed += 1;
    else unchanged += 1;
    trackingLost += entry.trackingLost;
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
    },
  };
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
    specDocument: next.specDocument ?? previous.specDocument,
    pendingCategory: next.pendingCategory ?? previous.pendingCategory,
  };
}

export interface BomCarryResult {
  records: MaterialWorkbookRecord[];
  matched: number;
  orphaned: MaterialWorkbookRecord[];
  manual: number;
}

/**
 * Copies RD tracking from the previous version onto the matching rows of the new
 * version. Rows are matched by design position and vendor identity, never by row
 * number. Old rows with tracking and no counterpart are reported, not dropped.
 */
export function carryBomTracking(previous: readonly MaterialWorkbookRecord[], next: readonly MaterialWorkbookRecord[]): BomCarryResult {
  const carried = new Map<MaterialWorkbookRecord, MaterialWorkbookRecord>();
  const matchedPrevious = new Set<MaterialWorkbookRecord>();
  for (const match of matchGroups(buildBomDiffGroups(previous), buildBomDiffGroups(next))) {
    if (!match.before || !match.after) continue;
    for (const line of matchBomVendorLines(match.before.rows, match.after.rows)) {
      if (!line.before || !line.after) continue;
      carried.set(line.after, carryLine(line.before, line.after));
      matchedPrevious.add(line.before);
    }
  }
  const nextIds = new Set(next.map((record) => record.id));
  const manualRecords = previous.filter((record) => record.id.startsWith(MANUAL_RECORD_PREFIX) && !matchedPrevious.has(record) && !nextIds.has(record.id));
  const orphaned = previous.filter((record) => !matchedPrevious.has(record) && !manualRecords.includes(record) && bomRecordHasTracking(record));
  return {
    records: [...next.map((record) => carried.get(record) ?? record), ...manualRecords.map((record) => ({ ...record }))],
    matched: matchedPrevious.size,
    orphaned,
    manual: manualRecords.length,
  };
}
