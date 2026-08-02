# Dashboard Supervisor Attention Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous dashboard management card with an actionable machine-attention list and a separate high-risk issue summary.

**Architecture:** Extend the existing pure dashboard metric calculation with the latest progress timestamp, then render the richer metric in the existing dashboard column. Preserve current queries and destinations while making every destination an explicit action.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, Node test runner, Vite.

## Global Constraints

- Keep the existing machine-progress and issue queries; add no database migration.
- Sort unfinished machines by calculated test completion rate from low to high.
- Display at most five machines in the dashboard panel.
- Use `開啟測試追蹤`, `查看機台`, and `查看問題` as explicit action labels.
- Treat zero critical issues as a calm success state.
- Keep the panel usable in the existing narrow dashboard column.

---

### Task 1: Expose latest machine progress activity

**Files:**
- Modify: `src/components/dashboard/dashboardMetrics.ts`
- Test: `src/components/dashboard/dashboardMetrics.test.mjs`

**Interfaces:**
- Consumes: `DashboardMetricProgress.updated_at`, `completed_at`, and `started_at`.
- Produces: `DashboardSystemMetric.lastActivityAt: string | null`.

- [ ] **Step 1: Write the failing timestamp test**

Add a test that calculates one machine with two progress records and asserts that `lastActivityAt` is the timestamp string from the newest record, while a machine without progress returns `null`.

```js
assert.equal(result.systemMetricById.get("active")?.lastActivityAt, "2026-08-03T09:30:00+08:00");
assert.equal(result.systemMetricById.get("waiting")?.lastActivityAt, null);
```

- [ ] **Step 2: Run the metric test and verify RED**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs`

Expected: FAIL because `lastActivityAt` is not defined.

- [ ] **Step 3: Implement newest activity selection**

Add `lastActivityAt` to `DashboardSystemMetric`. For each machine, sort its deduplicated progress records by `getProgressTimestamp` descending and return the first record's `updated_at`, `completed_at`, or `started_at`; return `null` when no timestamp exists.

- [ ] **Step 4: Run the metric test and verify GREEN**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs`

Expected: all metric tests pass.

### Task 2: Render an actionable supervisor panel

**Files:**
- Create: `tests/dashboardAttentionPanel.test.mjs`
- Modify: `src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `DashboardSystemMetric.completedItems`, `totalItems`, `nextStationName`, `progress`, and `lastActivityAt`.
- Produces: a `需關注機台` section and a separate `高風險問題` section.

- [ ] **Step 1: Write the failing interface-contract test**

Read `Dashboard.tsx` and assert the presence of `需關注機台`, `依測項完成率由低到高`, `未完成測項`, `卡關站點`, `負責人`, `最近更新`, `開啟測試追蹤`, `查看機台`, `高風險問題`, `目前沒有高風險問題`, `查看問題`, and the absence of `管理層待辦` and the ambiguous `查看全部` action.

- [ ] **Step 2: Run the interface test and verify RED**

Run: `node --test tests/dashboardAttentionPanel.test.mjs`

Expected: FAIL because the clarified headings, labels, and actions do not exist.

- [ ] **Step 3: Implement the clarified machine list**

Replace the current clickable rows with structured list items. Show machine, progress, `未完成測項 X / Y`, labeled next station, labeled engineer, formatted latest update, and a `查看機台` button. Add an explanatory empty state when every included machine is complete.

- [ ] **Step 4: Implement the separate issue summary**

Render an emerald zero state with `目前沒有高風險問題`, or a rose warning state with `有 N 件高風險問題待處理`. Keep `查看問題` as the only issue-tracker action.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs tests/dashboardAttentionPanel.test.mjs`

Expected: all focused tests pass.

### Task 3: Regression and visual verification

**Files:**
- Verify: `src/components/dashboard/Dashboard.tsx`
- Verify: `src/components/dashboard/dashboardMetrics.ts`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified production output.

- [ ] **Step 1: Run dashboard and related regression tests**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs tests/dashboardAttentionPanel.test.mjs tests/stationCapacityFlow.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Verify the rendered dashboard**

Open the dashboard at desktop width and confirm the narrow right column shows labeled values without overflow, zero issues use the success state, and all three explicit actions navigate correctly.

- [ ] **Step 4: Compare and publish safely**

Fetch `origin/main`, confirm no conflicting remote commit, commit the implementation, and push the completed commit series to `main` only after the regression checks remain green.
