import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialWeeklyProgress, filterMaterialWeeklyProgress, getMaterialProgressWeeks, materialProgressTimestamp, NO_WEEKLY_HISTORY, summarizeMaterialWeeklyProgress } from "../src/components/material-requests/materialWeeklyProgress.ts";

const asOf = Date.parse("2026-11-04T04:00:00Z");
const weeks = getMaterialProgressWeeks("2026-11-04", 4, asOf);
const entry = (id, status, createdAt, extra = {}) => ({ id, status, createdAt, ...extra });
const record = (id, history = [], extra = {}) => ({ id, name: "IC DRIVER", refDes: id, manufacturerPartNumber: "00001234", manufacturer: "Vendor A", requestOwnerName: "CE A", trackingHistory: history, ...extra });

test("required applications are available as a distinct current-week filter and summary count", () => {
  const rows = buildMaterialWeeklyProgress([record("J-required", [entry("required", "需申請", "2026-11-03T02:00:00Z")], { trackingStatus: "需申請" }), record("J-sent", [entry("sent", "已發信", "2026-11-03T02:00:00Z")])], weeks, asOf);
  const filtered = filterMaterialWeeklyProgress(rows, "", "需申請", "");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].record.id, "J-required");
  assert.equal(filtered[0].cells.at(-1).status, "需申請");
  assert.equal(summarizeMaterialWeeklyProgress(filtered, weeks).at(-1).counts["需申請"], 1);
});

test("weeks use Taipei Mondays, including UTC Sunday, year boundaries and unfinished current weeks", () => {
  assert.deepEqual(weeks.map(week => week.key), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  assert.equal(weeks.at(-1).start, Date.parse("2026-11-01T16:00:00Z"));
  assert.equal(weeks.at(-1).cutoff, asOf);
  assert.equal(weeks.at(-1).isCurrent, true);
  assert.equal(weeks[2].cutoff, Date.parse("2026-11-01T15:59:59.999Z"));
  assert.equal(getMaterialProgressWeeks("2027-01-01", 1, Date.parse("2027-01-01T01:00:00Z"))[0].key, "2026-12-28");
  assert.equal(getMaterialProgressWeeks("2027-01-01", 1, Date.parse("2027-01-01T01:00:00Z"))[0].label, "2026-12-28 ～ 2027-01-03");
  assert.equal(getMaterialProgressWeeks("2099-01-01", 1, asOf)[0].key, "2026-11-02", "future selection never invents future weeks");
  assert.deepEqual(getMaterialProgressWeeks("", 6, asOf), []);
});

test("invalid dates are rejected and offset-less imported dates always mean Taipei time", () => {
  for (const date of [undefined, "", "0", "2026-02-30", "2026-10-01T25:00:00Z", "2026-10-01T12:99:00Z", "2026-10-01T12:00:99Z", "2026-10-01 garbage"]) assert.equal(materialProgressTimestamp(date), null);
  assert.equal(materialProgressTimestamp("2026-10-26 00:00:00"), Date.parse("2026-10-25T16:00:00Z"));
  assert.equal(materialProgressTimestamp("2026-10-26"), Date.parse("2026-10-25T16:00:00Z"));
  assert.equal(materialProgressTimestamp("2026-10-26T01:00:00+09:00"), Date.parse("2026-10-25T16:00:00Z"));
  assert.equal(materialProgressTimestamp("2024-02-29"), Date.parse("2024-02-28T16:00:00Z"));
});

test("weekly states use chronological history, not today's state; notes and every within-week update remain available", () => {
  const source = record("J1", [
    entry("complete", "已完成", "2026-10-28T03:00:00Z", { note: "完整核對紀錄" }),
    entry("sent", "已發信", "2026-10-25T15:59:59Z"),
    entry("cis", "已取得料號待CIS申請", "2026-10-25T16:00:00Z", { createdBy: "實際更新者", requestInfo: "料號核發" }),
    entry("reopened", "申請料被退回", "2026-11-02T04:00:00Z"),
    entry("future", "已完成", "2026-12-01T04:00:00Z"),
  ], { trackingStatus: "已完成" });
  const original = structuredClone(source);
  const [row] = buildMaterialWeeklyProgress([source], weeks, asOf);
  assert.deepEqual(row.cells.map(cell => cell.status), [NO_WEEKLY_HISTORY, "已發信", "已完成", "申請料被退回"]);
  assert.deepEqual(row.cells[2].updates.map(update => update.id), ["cis", "complete"]);
  assert.equal(row.cells[2].updates[0].requestInfo, "料號核發");
  assert.equal(row.currentStatus, "申請料被退回");
  assert.equal(row.firstUpdate, Date.parse("2026-10-25T15:59:59Z"));
  assert.deepEqual(source, original, "reading a report must never reorder or edit saved history");
});

test("no-update weeks carry forward; missing dates and undated current states are never backfilled", () => {
  const rows = buildMaterialWeeklyProgress([
    record("J1", [entry("old", "已發信", "2026-10-01T00:00:00Z")]),
    record("J2", [entry("imported", "已取得料號待CIS申請", "")]),
    record("J3", [], { trackingStatus: "已完成" }),
    record("J4", [entry("done", "已完成", "2026-10-01T00:00:00Z"), entry("undated", "與廠商溝通中", "")]),
    record("J5"),
  ], weeks, asOf);
  assert.ok(rows[0].cells.every(cell => cell.status === "已發信" && !cell.updated));
  assert.ok(rows[1].cells.every(cell => cell.status === NO_WEEKLY_HISTORY));
  assert.equal(rows[1].currentStatus, "已取得料號待CIS申請");
  assert.equal(rows[1].undatedCount, 1);
  assert.ok(rows[2].cells.every(cell => cell.status === NO_WEEKLY_HISTORY));
  assert.equal(rows[2].currentStatus, "已完成");
  assert.equal(rows[2].undatedCount, 1);
  assert.ok(rows[3].cells.every(cell => cell.status === "已完成"));
  assert.equal(rows[3].currentStatus, "與廠商溝通中");
  assert.equal(rows[4].currentStatus, NO_WEEKLY_HISTORY);
});

test("same-week equal timestamps follow append order, and distinct vendor rows are not merged by MPN", () => {
  const rows = buildMaterialWeeklyProgress([record("A", [entry("a", "已發信", "2026-10-26T01:00:00Z"), entry("b", "已完成", "2026-10-26T01:00:00Z")]), record("B", [entry("c", "料號申請中", "2026-10-28T01:00:00Z")])], weeks, asOf);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.cells[2].status), ["已完成", "料號申請中"]);
  const summary = summarizeMaterialWeeklyProgress(rows, weeks);
  assert.equal(summary[2].updatedCount, 2, "count materials, not the number of updates");
  assert.equal(summary[2].startedCount, 2);
  for (const week of summary) assert.equal(Object.values(week.counts).reduce((sum, count) => sum + count, 0), 2);
});

test("search, current status and assigned owner combine without conflating the history updater", () => {
  const rows = buildMaterialWeeklyProgress([record("A", [entry("a", "已完成", "2026-10-26T00:00:00Z", { createdBy: "CE B" })]), record("B", [], { manufacturer: "Vendor B", requestOwnerName: "CE B" })], weeks, asOf);
  assert.equal(filterMaterialWeeklyProgress(rows, "00001234 vendor", "已完成", "CE A").length, 1);
  assert.equal(filterMaterialWeeklyProgress(rows, "", "已完成", "CE B").length, 0);
  assert.equal(filterMaterialWeeklyProgress(rows, "not-found", "", "").length, 0);
  assert.equal(filterMaterialWeeklyProgress(rows, "", "", "").length, 2);
});
