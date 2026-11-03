import type { MaterialTrackingHistoryEntry, MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_TRACKING_STATUS_OPTIONS, normalizeMaterialTrackingStatus } from "./materialTrackingStatus.ts";

const DAY = 86_400_000;
const TAIPEI_OFFSET = 8 * 3_600_000;
export const NO_WEEKLY_HISTORY = "無追蹤紀錄";
export const MATERIAL_WEEKLY_SIMPLIFIED_STATUSES = ["未處理", "已發信", "文件已收齊", "料號申請中", "已完成"] as const;

/** Imported dates without an offset are Taipei wall time, independent of the viewer's computer. */
export function materialProgressTimestamp(value?: string): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return null;
  const day = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== text.slice(0, 10)) return null;
  if (text.length > 10 && (Number(text.slice(11, 13)) > 23 || Number(text.slice(14, 16)) > 59 || Number(text.slice(17, 19) || 0) > 59)) return null;
  const explicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const timestamp = Date.parse(text.length === 10 ? `${text}T00:00:00+08:00` : text.replace(" ", "T") + (explicitOffset ? "" : "+08:00"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function taipeiProgressDate(timestamp: number) {
  return new Date(timestamp + TAIPEI_OFFSET).toISOString().slice(0, 10);
}

export interface MaterialProgressWeek {
  key: string;
  label: string;
  start: number;
  end: number; // exclusive: next Monday 00:00 Taipei
  cutoff: number;
  isCurrent: boolean;
}

export function getMaterialProgressWeeks(endDate: string, count: number, asOf: number): MaterialProgressWeek[] {
  const requested = materialProgressTimestamp(endDate);
  if (requested === null || !Number.isFinite(asOf)) return [];
  const date = new Date(Math.min(requested, asOf) + TAIPEI_OFFSET);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - TAIPEI_OFFSET;
  const lastMonday = midnight - ((date.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: Math.max(1, Math.min(12, Math.floor(count) || 6)) }, (_, index) => {
    const start = lastMonday - (Math.max(1, Math.min(12, Math.floor(count) || 6)) - 1 - index) * 7 * DAY;
    const end = start + 7 * DAY;
    const key = taipeiProgressDate(start);
    const endKey = taipeiProgressDate(end - 1);
    return { key, label: `${key} ～ ${key.slice(0, 4) === endKey.slice(0, 4) ? endKey.slice(5) : endKey}`, start, end, cutoff: Math.min(end - 1, asOf), isCurrent: asOf >= start && asOf < end };
  });
}

export interface MaterialProgressCell {
  status: string;
  updated: boolean;
  updates: MaterialTrackingHistoryEntry[];
  latest: MaterialTrackingHistoryEntry | null;
}

export interface MaterialProgressRow {
  record: MaterialWorkbookRecord;
  currentStatus: string;
  undatedCount: number;
  firstUpdate: number | null;
  cells: MaterialProgressCell[];
}

function entryStatus(entry?: MaterialTrackingHistoryEntry) {
  return entry?.status?.trim() ? normalizeMaterialTrackingStatus(entry.status) : entry?.note?.trim() || entry?.requestInfo?.trim() ? "處理中" : "";
}

/** One row per actual vendor record. Never merge equal MPNs, mutate history, or backfill an undated status. */
export function buildMaterialWeeklyProgress(records: MaterialWorkbookRecord[], weeks: MaterialProgressWeek[], asOf: number): MaterialProgressRow[] {
  return records.map(record => {
    const history = Array.isArray(record.trackingHistory) ? record.trackingHistory.filter(Boolean) : [];
    const dated = history.map((entry, index) => ({ entry, index, time: materialProgressTimestamp(entry.createdAt) }))
      .filter((item): item is { entry: MaterialTrackingHistoryEntry; index: number; time: number } => item.time !== null && item.time <= asOf)
      .sort((a, b) => a.time - b.time || a.index - b.index);
    const undated = history.filter(entry => materialProgressTimestamp(entry.createdAt) === null);
    const lastStored = history.at(-1);
    const currentStatus = lastStored && materialProgressTimestamp(lastStored.createdAt) === null
      ? entryStatus(lastStored) || NO_WEEKLY_HISTORY
      : entryStatus(dated.at(-1)?.entry) || (history.length === 0 && record.trackingStatus?.trim() ? normalizeMaterialTrackingStatus(record.trackingStatus) : NO_WEEKLY_HISTORY);
    let cursor = 0;
    let latest: MaterialTrackingHistoryEntry | null = null;
    const cells = weeks.map(week => {
      const updates: MaterialTrackingHistoryEntry[] = [];
      while (cursor < dated.length && dated[cursor].time <= week.cutoff) {
        const item = dated[cursor++];
        if (entryStatus(item.entry)) latest = item.entry;
        if (item.time >= week.start) updates.push(item.entry);
      }
      return { status: entryStatus(latest ?? undefined) || NO_WEEKLY_HISTORY, updated: updates.length > 0, updates, latest };
    });
    return { record, currentStatus, undatedCount: undated.length + (history.length === 0 && currentStatus !== NO_WEEKLY_HISTORY ? 1 : 0), firstUpdate: dated[0]?.time ?? null, cells };
  });
}

export function filterMaterialWeeklyProgress(rows: MaterialProgressRow[], query: string, status: string, owner: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => (!status || row.currentStatus === status) && (!owner || (row.record.requestOwnerName?.trim() || "未指定") === owner) && terms.every(term => [row.record.refDes, row.record.name, row.record.manufacturerPartNumber, row.record.manufacturer, row.record.partNumber, row.record.virtualAlternative, row.record.requestOwnerName].join(" ").toLocaleLowerCase().includes(term)));
}

export function summarizeMaterialWeeklyProgress(rows: MaterialProgressRow[], weeks: MaterialProgressWeek[], simplified = false) {
  const statuses: string[] = simplified ? [...MATERIAL_WEEKLY_SIMPLIFIED_STATUSES] : [...MATERIAL_TRACKING_STATUS_OPTIONS, "處理中", "新增追蹤", NO_WEEKLY_HISTORY];
  if (!simplified) for (const row of rows) for (const cell of row.cells) if (!statuses.includes(cell.status)) statuses.push(cell.status);
  return weeks.map((week, index) => ({
    week,
    updatedCount: rows.filter(row => row.cells[index]?.updated).length,
    startedCount: rows.filter(row => row.firstUpdate !== null && row.firstUpdate >= week.start && row.firstUpdate <= week.cutoff).length,
    counts: Object.fromEntries(statuses.map(status => [status, rows.filter(row => {
      const value = row.cells[index]?.status;
      return value === status || (simplified && status === "料號申請中" && value && value !== NO_WEEKLY_HISTORY && !statuses.includes(value));
    }).length])),
  }));
}
