import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculatePerformanceSummary,
  DEFAULT_PERFORMANCE_REVIEWS,
  getPerformanceStatusForAction,
  normalizePerformanceReview,
  toPerformanceCsv,
} from "../src/components/performance/performanceData.mjs";

test("performance seed data produces a useful cycle summary", () => {
  assert.deepEqual(calculatePerformanceSummary(DEFAULT_PERFORMANCE_REVIEWS), {
    total: 5,
    completed: 1,
    pending: 4,
    averageScore: 89,
    averageProgress: 60,
  });
});

test("performance rows normalize cloud snake_case data and keep goal progress safe", () => {
  const review = normalizePerformanceReview({
    id: "cloud-review",
    cycle_id: "2026-q2",
    employee_id: "employee-1",
    employee_name: "Yumin Wang",
    reviewer_name: "Ben",
    status: "not-a-status",
    score: "88",
    goals: [{ title: "整理流程", progress: 180, weight: 25 }],
  });

  assert.equal(review.cycleId, "2026-q2");
  assert.equal(review.employeeName, "Yumin Wang");
  assert.equal(review.status, "draft");
  assert.equal(review.score, 88);
  assert.equal(review.goals[0].progress, 100);
  assert.equal(review.goals[0].category, "KPI");
});

test("performance workflow maps employee and manager actions to the review status", () => {
  assert.equal(
    getPerformanceStatusForAction({
      mode: "self",
      action: "draft",
      currentStatus: "draft",
    }),
    "in-progress",
  );
  assert.equal(
    getPerformanceStatusForAction({
      mode: "self",
      action: "submit",
      currentStatus: "in-progress",
    }),
    "submitted",
  );
  assert.equal(
    getPerformanceStatusForAction({
      mode: "manager",
      action: "return",
      currentStatus: "submitted",
    }),
    "in-progress",
  );
  assert.equal(
    getPerformanceStatusForAction({
      mode: "manager",
      action: "submit",
      currentStatus: "submitted",
    }),
    "approved",
  );
});

test("performance CSV exports headers, status labels, and escaped values", () => {
  const csv = toPerformanceCsv([
    {
      ...DEFAULT_PERFORMANCE_REVIEWS[0],
      employeeName: 'Ben "B"',
    },
  ]);

  assert.match(
    csv,
    /^"員工","部門","考核人","狀態","分數","目標平均進度","截止日期"/,
  );
  assert.match(csv, /"Ben ""B"""/);
  assert.match(csv, /"填寫中"/);
  assert.match(csv, /"50"/);
});

test("performance workspace exposes RD2 workflows and persistent record filters", async () => {
  const source = await readFile(
    new URL(
      "../src/components/performance/PerformanceAppraisalPage.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  for (const text of [
    "系統說明與政策",
    "員工自評",
    "主管評分",
    "考核紀錄",
    "performanceSearch",
    "performanceStatus",
    "performanceScope",
    "全部清除",
    "目前篩選條件沒有符合的考核",
  ])
    assert.ok(source.includes(text));
  assert.doesNotMatch(
    source,
    /GithubRepositoryPanel|fetchDemoRepositorySnapshot|demo-repository/,
  );
  assert.match(source, /new URLSearchParams\(previous\)/);
});
