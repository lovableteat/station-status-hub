import assert from "node:assert/strict";
import test from "node:test";
import { getMaterialApplicationTiming, formatMaterialApplicationDays, describeMaterialApplicationTiming } from "../src/components/material-requests/materialApplicationTiming.ts";

const now = Date.parse("2026-10-30T04:15:00Z");
const entry = createdAt => ({ id: createdAt, status: "已發信", createdAt });

test("application age uses the earliest dated update, independent of history order and later changes", () => {
  const record = { trackingHistory: [entry("2026-10-30T04:00:00Z"), entry("2026-10-28T20:00:00-04:00"), entry("2026-10-29T03:00:00Z")] };
  const original = structuredClone(record);
  const timing = getMaterialApplicationTiming(record, now);
  assert.equal(timing.startedAt, "2026-10-29T00:00:00.000Z");
  assert.equal(timing.fullDays, 1);
  assert.equal(timing.elapsedDays, 28.25 / 24);
  assert.equal(formatMaterialApplicationDays(timing), "1 天");
  assert.match(describeMaterialApplicationTiming(timing, now), /1 天 4 小時 15 分鐘/);
  assert.deepEqual(record, original, "calculating duration must not reorder or rewrite saved history");
});

test("missing, invalid and future dates do not invent an application start from other metadata", () => {
  for (const trackingHistory of [undefined, [], [null, entry(""), entry("not a date"), entry(123), entry("0"), entry("2026-02-30T00:00:00Z"), entry("2026-11-01T00:00:00Z")]]) {
    const timing = getMaterialApplicationTiming({ trackingHistory, generatedAt: "2020-01-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", trackingStatus: "已發信" }, now);
    assert.equal(timing, null);
    assert.equal(formatMaterialApplicationDays(timing), "尚無紀錄");
    assert.match(describeMaterialApplicationTiming(timing, now), /尚無起始紀錄/);
  }
  assert.equal(getMaterialApplicationTiming({ trackingHistory: [entry("2026-10-29T00:00:00Z")] }, NaN), null);
});

test("every 24 hours counts as one day, including leap dates and sub-day durations", () => {
  const record = { trackingHistory: [entry("2024-02-28T12:00:00Z")] };
  const beforeDay = getMaterialApplicationTiming(record, Date.parse("2024-02-29T11:59:59Z"));
  assert.equal(formatMaterialApplicationDays(beforeDay), "未滿1天");
  assert.equal(beforeDay.fullDays, 0);
  assert.equal(formatMaterialApplicationDays(getMaterialApplicationTiming(record, Date.parse("2024-02-29T12:00:00Z"))), "1 天");
  assert.equal(getMaterialApplicationTiming(record, Date.parse("2024-03-01T12:00:00Z")).fullDays, 2);
});

test("completed status keeps counting to now; separate manufacturers never borrow each other's dates", () => {
  const completed = { trackingStatus: "已完成", trackingHistory: [entry("2026-10-28T04:15:00Z"), { ...entry("2026-10-29T04:15:00Z"), status: "已完成" }] };
  assert.equal(getMaterialApplicationTiming(completed, now).fullDays, 2);
  assert.equal(getMaterialApplicationTiming({ trackingHistory: [entry("2026-10-30T04:15:00Z")] }, now).elapsedMilliseconds, 0);
  assert.equal(getMaterialApplicationTiming({ trackingHistory: [] }, now), null);
});
