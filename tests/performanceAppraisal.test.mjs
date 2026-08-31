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
  assert.equal(review.goals[0].category, "KPI");
});

test("performance workflow maps employee and manager actions to the review status", () => {
  assert.equal(getPerformanceStatusForAction({ mode: "self", action: "draft", currentStatus: "draft" }), "in-progress");
  assert.equal(getPerformanceStatusForAction({ mode: "self", action: "submit", currentStatus: "in-progress" }), "submitted");
  assert.equal(getPerformanceStatusForAction({ mode: "manager", action: "return", currentStatus: "submitted" }), "in-progress");
  assert.equal(getPerformanceStatusForAction({ mode: "manager", action: "submit", currentStatus: "submitted" }), "approved");
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

test("performance workspace keeps its navigation in a responsive sidebar", async () => {
  const [pageSource, styleSource, shellSource, githubSource] = await Promise.all([
    readFile(new URL("../src/components/performance/PerformanceAppraisalPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/performance/performance.css", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/performance/githubPerformanceData.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /data-testid="performance-sidebar"/);
  assert.match(pageSource, /data-testid="performance-mobile-nav"/);
  assert.match(pageSource, /data-performance-nav=\{item\.id\}/);
  assert.match(pageSource, /績效總覽/);
  assert.match(pageSource, /我的考核/);
  assert.match(pageSource, /團隊考核/);
  assert.match(styleSource, /\.performance-sidebar\.is-collapsed/);
  assert.match(styleSource, /\.performance-sidebar\.is-mobile-open/);
  assert.match(styleSource, /grid-template-columns: var\(--performance-sidebar-width\)/);
  assert.match(styleSource, /\.performance-workspace\.is-sidebar-collapsed/);
  assert.match(styleSource, /\.performance-content\s*\{[\s\S]*overflow: visible/);
  assert.match(styleSource, /overscroll-behavior: contain/);
  assert.match(styleSource, /@media \(max-width: 1180px\)/);
  assert.match(styleSource, /@media \(max-width: 480px\)/);
  assert.match(shellSource, /activeWorkspace === "performance" && "performance-app-shell"/);
  assert.match(shellSource, /activeWorkspace === "performance"[\s\S]*?"min-h-0"/);
  assert.match(pageSource, /data-performance-zone="github-source"/);
  assert.match(pageSource, /fetchDemoRepositorySnapshot/);
  assert.match(pageSource, /openReviewFromCommit/);
  assert.match(pageSource, /帶入考核/);
  assert.match(githubSource, /demo-repository/);
  assert.match(githubSource, /DEMO_REPOSITORY_CACHED_SNAPSHOT/);
  assert.match(githubSource, /source: "live"/);
  assert.match(githubSource, /Promise\.all\(\[/);
  assert.match(styleSource, /\.performance-repository/);
});
