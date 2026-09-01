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

  const employeeCsv = toPerformanceCsv(
    [
      {
        ...DEFAULT_PERFORMANCE_REVIEWS[0],
        managerFeedback: "主管私密回饋",
        score: 99,
      },
    ],
    { includeManager: false },
  );
  assert.doesNotMatch(employeeCsv, /分數|主管回饋|主管私密回饋|"99"/);
});

test("performance workspace exposes RD2 workflows and persistent record filters", async () => {
  const [source, flowGuide] = await Promise.all([
    readFile(
      new URL(
        "../src/components/performance/PerformanceAppraisalPage.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/performance/PerformanceFlowGuide.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
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
  assert.match(source, /主管評分（主管專用）/);
  assert.match(source, /requestedTab === "manager" && !canEdit/);
  assert.match(source, /matchesReviewer/);
  assert.match(source, /reviewsQuery\.eq\("employee_id", userId\)/);
  assert.match(source, /toPerformanceCsv\(visibleReviews, \{ includeManager: canEdit \}/);
  assert.match(source, /showManagerAssessment/);
  assert.match(flowGuide, /canManage = false/);
  assert.match(flowGuide, /主管評分與回饋不會出現在員工畫面/);
});

test("performance workspace inherits the platform theme without a separate light-mode preference", async () => {
  const [source, styles] = await Promise.all([
    readFile(
      new URL(
        "../src/components/performance/PerformanceAppraisalPage.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/components/performance/performance.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(source, /rd2-theme|rd2-light|rd2-dark|setLight/);
  for (const token of [
    "background",
    "card",
    "foreground",
    "muted-foreground",
    "primary",
    "sidebar-background",
    "destructive",
    "platform-green",
    "warning",
  ]) {
    assert.ok(
      styles.includes(`hsl(var(--${token})`),
      `Uses platform ${token} color`,
    );
  }
  // The workspace must not shadow shared component tokens or retain a hardcoded palette.
  assert.doesNotMatch(
    styles,
    /--(?:background|foreground|card|secondary|primary|border|ring)\s*:/,
  );
  assert.doesNotMatch(
    styles,
    /#[0-9a-f]{3,8}\b|rd2-light|rd2-dark|button\.interactive-lift/i,
  );
  assert.match(styles, /--rd2-bg: var\(--mobile-canvas\)/);
  assert.match(styles, /--rd2-panel: var\(--mobile-panel\)/);
});
