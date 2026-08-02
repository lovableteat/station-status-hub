# Dashboard supervisor attention panel redesign

## Problem

The current `管理層待辦` card is not a task list. It mixes a low-progress machine ranking, a link to test tracking, machine-monitor navigation, and a critical-issue counter without explaining the relationship. A supervisor cannot tell why a machine is listed or what action to take.

## Selected approach

Replace the card with two explicit sections that keep the existing data sources and routes:

1. `需關注機台` lists up to five unfinished machines ordered by test completion rate from low to high.
2. `高風險問題` reports unresolved `critical` issues separately.

Rejected alternatives:

- Removing the panel would hide useful operational signals.
- Renaming the existing labels only would leave the missing context and mixed destinations unresolved.
- Creating a new task-management data model is outside this dashboard clarification scope.

## Machine row information

Each row must answer the supervisor's immediate questions:

- Which machine needs attention?
- How much work is complete and how many test items remain?
- Which station is next?
- Who owns the machine?
- When was its test progress last updated?
- Where can I inspect and act on it?

The row displays the machine name, completion percentage, completed and total test-item counts, next incomplete station, assigned engineer, latest progress timestamp, and an explicit `查看機台` action. The section description states that the list is ordered by completion rate, so it does not pretend to be a deadline- or risk-based ranking.

`開啟測試追蹤` replaces the ambiguous `查看全部` action and continues to navigate to the test tracker.

## High-risk issue section

The issue summary is visually and semantically separate from machine progress:

- When the critical count is zero, show a calm success state: `目前沒有高風險問題`.
- When the count is positive, show the count and `有 N 件高風險問題待處理` in the destructive status color.
- The explicit action is `查看問題`, which navigates to issue tracking.

## Data changes

Extend `DashboardSystemMetric` with `lastActivityAt`. It is the timestamp string from the newest progress record for that machine, using the same newest-record precedence already applied to dashboard progress. No database migration or new query is required.

## Responsive behavior

The panel remains usable in the existing narrow dashboard column. Labels are short, values truncate safely, and the action remains visible without making the whole row an unlabeled button. Empty and zero states explain their meaning instead of leaving blank space or a standalone zero.

## Verification

- Unit-test latest activity selection and existing progress ordering inputs.
- Component-contract test the new headings, explanatory copy, labels, actions, and removal of the misleading labels.
- Run the dashboard test suite and production build.
- Verify the rendered panel at desktop dashboard width.
