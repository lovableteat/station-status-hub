# Station Capacity Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present every production station in an unmistakable first-to-last sequence even when the number of stations grows.

**Architecture:** Preserve dashboard metric calculations, expose station order in each metric row, and replace the wrapping card grid with an accessible horizontal process rail.

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix HoverCard, Node test runner, Vite.

## Global Constraints

- Sequence is determined by `station_order`, then station name as a stable tie-breaker.
- Do not change bottleneck calculations or card navigation.
- The sequence must remain one line at every responsive breakpoint.
- Push item 3 independently after item 2 is deployed.

---

### Task 1: Strengthen metric ordering tests

**Files:**
- Modify: `src/components/dashboard/dashboardMetrics.ts`
- Modify: `src/components/dashboard/dashboardMetrics.test.mjs`

**Interfaces:**
- `DashboardStationMetric` produces `order: number`.

- [ ] **Step 1: Add the failing test**

Pass stations in order 30, 10, 20 and assert:

```js
assert.deepEqual(
  result.stationRows.map((station) => [station.order, station.name]),
  [[10, "First"], [20, "Second"], [30, "Last"]],
);
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs`

Expected: fails because station metrics do not expose `order`.

- [ ] **Step 3: Implement stable ordering**

```ts
const sortedStations = [...stations].sort(
  (left, right) =>
    left.station_order - right.station_order ||
    left.station_name.localeCompare(right.station_name, "zh-Hant"),
);
```

Return `order: station.station_order` from each metric row.

### Task 2: Replace the wrapping grid with a process rail

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`
- Create: `tests/stationCapacityFlow.test.mjs`

**Interfaces:**
- Consumes: ordered `stationRows`.
- Produces: `data-testid="station-capacity-flow"` and `data-station-order`.

- [ ] **Step 1: Write the UI contract test**

Assert that `Dashboard.tsx` contains:

```js
assert.match(source, /data-testid="station-capacity-flow"/);
assert.match(source, /overflow-x-auto/);
assert.match(source, /snap-x/);
assert.match(source, /data-station-order=\{station\.order\}/);
assert.match(source, /第 \{index \+ 1\} 站/);
```

Also assert the old `md:grid-cols-2 2xl:grid-cols-4` capacity layout is absent.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/stationCapacityFlow.test.mjs`

Expected: fails on the new flow contract.

- [ ] **Step 3: Implement the rail**

Use an `overflow-x-auto snap-x snap-mandatory` container with an ordered list. Each item has `min-w-[280px]`, `snap-start`, a sequence badge and a connector between adjacent items.

- [ ] **Step 4: Keep detailed formulas accessible**

Retain the existing HoverCard content and focusable button. Add visible `第 N 站` and `瓶頸` text so meaning does not depend on color.

- [ ] **Step 5: Run focused tests**

Run: `node --test src/components/dashboard/dashboardMetrics.test.mjs tests/stationCapacityFlow.test.mjs`

Expected: pass.

### Task 3: Responsive verification and publish item 3

- [ ] **Step 1: Run lint and build**

Run: `npx eslint src/components/dashboard/Dashboard.tsx src/components/dashboard/dashboardMetrics.ts src/components/dashboard/dashboardMetrics.test.mjs tests/stationCapacityFlow.test.mjs`

Run: `npm run build`

Expected: succeed.

- [ ] **Step 2: Browser-check station counts**

Verify 1, 6 and 12 stations at desktop and phone sizes. Confirm order, scroll, focus, bottleneck highlight and navigation.

- [ ] **Step 3: Publish**

Fetch and compare `origin/main`, commit with `feat(dashboard): clarify station capacity flow`, push `HEAD:main`, and verify GitHub Pages.

