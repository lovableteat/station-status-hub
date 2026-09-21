# Performance Return Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make returned performance feedback immediately distinguishable in individual replies, return history, and department summary history on desktop and mobile.

**Architecture:** Add semantic state attributes to the existing React markup and style those states through the existing performance CSS. Reuse current data (`history` and `event.action`) without adding components, packages, or persisted fields.

**Tech Stack:** React, TypeScript, CSS, Node test runner.

## Global Constraints

- Use the existing rose return-state color family.
- Keep a textual return label so color is not the only indicator.
- Do not change workflow data, attachments, layout, or approval styling.
- Use full 1px borders and tinted surfaces; do not introduce accent side stripes.
- After implementation is authorized, continue through verification, commit, and push without intermediate approval questions unless a destructive or externally consequential decision requires new authority.

---

### Task 1: Lock the return-state contract with a failing test

**Files:**
- Modify: `tests/performanceWorkflowCompletion.test.mjs`

**Interfaces:**
- Consumes: current TSX and CSS source files.
- Produces: a static regression test for `data-return-state`, `data-action`, return copy, and rose-state selectors.

- [ ] **Step 1: Write the failing test**

Add a test that reads `AssessmentEntryFeedback.tsx`, `PerformanceSectionReports.tsx`, and `performance.css`; assert that returned entry feedback uses `data-return-state`, section history uses `data-action={event.action}`, returned copy contains `主管逐項退回回應`, and CSS targets both semantic attributes.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/performanceWorkflowCompletion.test.mjs`

Expected: FAIL because the new semantic attributes and selectors do not exist yet.

### Task 2: Add semantic markup and restrained return styling

**Files:**
- Modify: `src/components/performance/AssessmentEntryFeedback.tsx`
- Modify: `src/components/performance/PerformanceSectionReports.tsx`
- Modify: `src/components/performance/performance.css`

**Interfaces:**
- Consumes: `history.length` and section feedback `event.action`.
- Produces: `data-return-state="returned"` and `data-action="return|approve"` hooks used only for presentation.

- [ ] **Step 1: Implement the minimal markup**

Mark read-only returned entry feedback and all return-history containers with `data-return-state="returned"`. Change its heading to `主管逐項退回回應`. Mark each department feedback event with `data-action={event.action}` and the legacy fallback with the report status.

- [ ] **Step 2: Implement the minimal CSS**

Define a shared dark rose tint, full rose border, high-contrast heading/summary text, and a small textual return badge. Leave approve entries unchanged.

- [ ] **Step 3: Run the regression test**

Run: `node --test tests/performanceWorkflowCompletion.test.mjs`

Expected: all tests pass.

### Task 3: Persist the collaboration rule and verify delivery

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: a repository rule to continue approved implementation without routine intermediate approval prompts.

- [ ] **Step 1: Add the workflow rule**

Document that explicit implementation approval authorizes normal in-scope implementation, verification, commit, and push without further progress questions; still stop when new authority is required.

- [ ] **Step 2: Run full scoped verification**

Run the relevant performance tests, ESLint on changed TSX/tests, `npm run build`, and `git diff --check`.

- [ ] **Step 3: Visually verify responsive states**

Open the performance UI at desktop and mobile widths and confirm returned entries are prominent, readable, and distinct from approvals.

- [ ] **Step 4: Commit and push**

Commit only the plan, rule, test, TSX, and CSS files; leave unrelated `.claude/` untouched. Push `main` and wait for the deployment workflow.
