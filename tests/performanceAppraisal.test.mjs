import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePerformanceSummary,
  DEFAULT_PERFORMANCE_REVIEWS,
  normalizePerformanceReview,
  toPerformanceCsv,
} from "../src/components/performance/performanceData.mjs";

test("performance seed data produces a useful cycle summary", () => {
  assert.deepEqual(
    calculatePerformanceSummary(DEFAULT_PERFORMANCE_REVIEWS),
    {
      total: 5,
      completed: 1,
      pending: 4,
      averageScore: 89,
      averageProgress: 60,
    },
  );
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
});

test("performance CSV exports headers, status labels, and escaped values", () => {
  const csv = toPerformanceCsv([
    {
      ...DEFAULT_PERFORMANCE_REVIEWS[0],
      employeeName: 'Ben "B"',
    },
  ]);

  assert.match(csv, /^"員工","部門","考核人","狀態","分數","目標平均進度","截止日期"/);
  assert.match(csv, /"Ben ""B"""/);
  assert.match(csv, /"填寫中"/);
  assert.match(csv, /"50"/);
});
