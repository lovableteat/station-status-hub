# BOM Page Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load only the active BOM record range needed for the current page, while retaining the remote metadata count and promoting to a full load when cross-page operations require it.

**Architecture:** Add a page-aware Supabase range loader in `materialBomStorage.ts`; its workspace payload keeps the remote total count while `records` contains the loaded range. `MaterialRequestPage.tsx` requests page ranges as the page changes and requests a full load for search/filter/export paths. Existing 1,000-row batching remains the upper bound for full loads.

**Tech Stack:** React, TypeScript, Supabase range queries, Node test runner, TypeScript transpilation tests.

## Global Constraints

- Stable ordering is always `order_index ASC`.
- A partial workspace must never be treated as a complete cache.
- Full-load consumers must retain the existing complete-record behavior.
- Do not change write, conflict, or realtime record semantics.

### Task 1: Add page-aware range contracts

**Files:**
- Modify: `src/components/material-requests/materialBomPerformance.ts`
- Modify: `tests/materialBomPerformance.test.mjs`

- [x] Add helpers that normalize page number/page size and return one inclusive raw-record range.
- [x] Test page 1, later pages, invalid inputs, and full-load range compatibility.

### Task 2: Load partial active workspaces without losing metadata

**Files:**
- Modify: `src/components/material-requests/materialBomStorage.ts`

- [x] Add `recordPage`, `recordPageSize`, and `loadAllRecords` options.
- [x] Use the page range for partial loads, preserve `record_count`, and set `isLoaded` only when all rows are present.
- [x] Keep summaries for inactive workspaces and existing full-load behavior for writes/recovery.

### Task 3: Wire page changes and full-load promotion in the BOM page

**Files:**
- Modify: `src/components/material-requests/MaterialRequestPage.tsx`

- [x] Request the current raw-record page on initial load and page/page-size changes.
- [x] Use full-load mode for search/filter/sort/export operations that need complete data.
- [x] Keep page controls and loading indicators truthful when a requested page is pending.

### Task 4: Verify

- [x] Run focused BOM performance tests.
- [x] Run `npm run lint` and `npm run build`.
