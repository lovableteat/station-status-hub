import type { MaterialWorkbookRecord } from "./materialRequestUtils";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Application age comes only from dated tracking entries, never BOM imports or the last edit. */
export function getMaterialApplicationTiming(record: Pick<MaterialWorkbookRecord, "trackingHistory">, now = Date.now()) {
  if (!Number.isFinite(now)) return null;
  let first = Infinity;
  for (const entry of Array.isArray(record.trackingHistory) ? record.trackingHistory : []) {
    const value = typeof entry?.createdAt === "string" ? entry.createdAt.trim() : "";
    // Imported history may have no date. Reject short strings Date.parse interprets as a year/month.
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|\s|$)/.test(value)) continue;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp > now || timestamp >= first) continue;
    // Some browsers roll an impossible date such as February 30 into March.
    const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === value.slice(0, 10)) first = timestamp;
  }
  if (!Number.isFinite(first)) return null;
  const elapsedMilliseconds = now - first;
  return {
    startedAt: new Date(first).toISOString(),
    elapsedMilliseconds,
    elapsedDays: elapsedMilliseconds / DAY_MS,
    fullDays: Math.floor(elapsedMilliseconds / DAY_MS),
  };
}

export function formatMaterialApplicationDays(timing: ReturnType<typeof getMaterialApplicationTiming>) {
  if (!timing) return "尚無紀錄";
  return timing.fullDays < 1 ? "未滿1天" : `${timing.fullDays.toLocaleString("zh-TW")} 天`;
}

export function describeMaterialApplicationTiming(timing: ReturnType<typeof getMaterialApplicationTiming>, now: number) {
  if (!timing) return "尚無起始紀錄；有時間的第一筆追蹤紀錄才會開始計算。";
  const minutes = Math.floor(timing.elapsedMilliseconds / 60_000);
  const format = (date: string | number) => new Date(date).toLocaleString("zh-TW", { hour12: false });
  return `首次更新：${format(timing.startedAt)}\n統計截至：${format(now)}\n申請耗時：${timing.fullDays} 天 ${Math.floor(minutes / 60) % 24} 小時 ${minutes % 60} 分鐘（每 24 小時計 1 天，所有狀態皆計算至現在）`;
}
