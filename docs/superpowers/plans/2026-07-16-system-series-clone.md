# System Series Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe bulk cloning of a source machine into sequentially named machines with copied L10 progress.

**Architecture:** A pure naming helper creates deterministic previews. A focused clone service performs preflight reads, atomic multi-row machine insertion, progress copying, exclusion copying, and compensating rollback. A dialog launched from each tracker row owns user input and reports completion.

**Tech Stack:** React 18, TypeScript, Supabase JS, node:test, Tailwind CSS.

## Global Constraints

- Keep all operations inside the source machine's project and flow version.
- Do not copy unique hardware identifiers, issues, attachments, audits, or actual timing records.
- A batch may contain 1 to 100 machines.
- Follow test-first red-green-refactor for each behavior.

---

### Task 1: Sequential naming

**Files:**
- Create: `src/components/test-tracker/systemClone.mjs`
- Test: `tests/systemCloneNaming.test.mjs`

**Interfaces:**
- Produces: `parseSystemSequence(sourceName)` and `buildSystemSeriesNames({ prefix, startNumber, count, padding })`.

- [ ] Write tests for `Golden3 -> Golden4..Golden8`, `System003 -> System004`, a source without a numeric suffix, and invalid counts.
- [ ] Run `node --test tests/systemCloneNaming.test.mjs` and confirm the missing-module failure.
- [ ] Implement the helper and rerun the focused test until it passes.

### Task 2: Clone data service

**Files:**
- Create: `src/components/test-tracker/cloneSystemSeries.ts`
- Test: `tests/systemCloneService.test.mjs`

**Interfaces:**
- Consumes: source machine UUID and validated system names.
- Produces: `cloneSystemSeries({ sourceSystemId, systemNames })`, returning created IDs and names.

- [ ] Add a source contract test requiring source metadata, progress, exclusions, batched inserts, and compensating rollback through `delete_test_system`.
- [ ] Run the focused test and confirm failure because the service is absent.
- [ ] Implement the minimal Supabase service and rerun the test.

### Task 3: Tracker dialog and row action

**Files:**
- Create: `src/components/test-tracker/SystemCloneDialog.tsx`
- Modify: `src/components/test-tracker/TestProgressTable.tsx`
- Modify: `src/components/test-tracker/TestTracker.tsx`
- Test: `tests/systemCloneUi.test.mjs`

**Interfaces:**
- Consumes: `{ id, system_name }` source machine and `onCloned` callback.
- Produces: a controlled dialog with prefix, start number, count, preview, and submit state.

- [ ] Add a source contract test for the row action, preview and dialog wiring.
- [ ] Run the focused test and confirm failure before editing production components.
- [ ] Implement the row action, controlled dialog and refresh callback.
- [ ] Run all focused tests until green.

### Task 4: Verification and release

**Files:**
- Verify all changed files.

- [ ] Run `node --test tests/*.test.mjs` and require zero failures.
- [ ] Run scoped ESLint and `npm.cmd run build`.
- [ ] Fetch `origin/main`, integrate any remote work, commit only task files, and push the current branch plus `main`.
- [ ] Wait for GitHub Pages success and confirm the deployed tracker bundle contains the clone feature.
