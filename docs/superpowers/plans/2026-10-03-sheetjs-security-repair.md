# SheetJS Security Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace reachable SheetJS 0.18.5 with the exact official 0.20.3 artifact and prove the material workbook workflow retains its supported behavior.

**Architecture:** Keep every existing `xlsx` import and parser call unchanged, replacing only the direct dependency source in `package.json` and its npm lock data. Add a focused Node test that treats the package source, exact installed version, official resolved URL, and SHA-512 lock integrity as security invariants, then exercises the real material workbook parser across representative XLS/XLSX inputs.

**Tech Stack:** npm lockfile v3, SheetJS CE 0.20.3, Node test runner, TypeScript, Vite.

## Global Constraints

- `GHSA-4r6h-8v6p-xvw6` affects `xlsx < 0.19.3`; `GHSA-5pgg-2g8v-p4x9` affects `xlsx < 0.20.2`.
- Pin `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; do not resolve `xlsx` from the stale npm registry.
- Require lockfile SHA-512 integrity and exact installed version `0.20.3`.
- Do not use `npm audit fix --force`, perform blanket upgrades, change database migrations, or change production security settings.
- Preserve existing dynamic imports, real workbook data, and realtime behavior.

---

### Task 1: Supply-chain regression contract

**Files:**
- Create: `tests/sheetjsSecurity.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: root `dependencies.xlsx` and `packages["node_modules/xlsx"]` from `package-lock.json`.
- Produces: an exact official tarball dependency with a non-empty `sha512-` integrity value.

- [ ] **Step 1: Write the failing dependency policy test**

Add a Node test that asserts:

```js
const expectedArtifact = "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz";
assert.equal(packageJson.dependencies.xlsx, expectedArtifact);
assert.equal(packageLock.packages[""].dependencies.xlsx, expectedArtifact);
assert.equal(packageLock.packages["node_modules/xlsx"].version, "0.20.3");
assert.equal(packageLock.packages["node_modules/xlsx"].resolved, expectedArtifact);
assert.match(packageLock.packages["node_modules/xlsx"].integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
assert.equal(XLSX.version, "0.20.3");
```

- [ ] **Step 2: Run the policy test and verify RED**

Run: `node --test --test-name-pattern="official SheetJS" tests/sheetjsSecurity.test.mjs`

Expected: FAIL because the dependency and installed package are still `0.18.5` from `registry.npmjs.org`.

- [ ] **Step 3: Install the exact official artifact**

Run: `npm install --save-exact --legacy-peer-deps https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`

Expected: `package.json` and `package-lock.json` point to the exact CDN tarball, and npm records its SHA-512 integrity.

- [ ] **Step 4: Run the policy test and verify GREEN**

Run: `node --test --test-name-pattern="official SheetJS" tests/sheetjsSecurity.test.mjs`

Expected: PASS with installed SheetJS `0.20.3`.

---

### Task 2: Workbook compatibility regression coverage

**Files:**
- Modify: `tests/sheetjsSecurity.test.mjs`
- Modify: `tests/test-plan/spreadsheet-interaction.test.ts`

**Interfaces:**
- Consumes: `parseMaterialWorkbookFile(file)` and `buildMaterialDataset(payload)` from `src/components/material-requests/materialRequestUtils.ts`.
- Produces: regression evidence for the existing material workbook behavior under SheetJS 0.20.3.

- [ ] **Step 1: Add representative XLSX and XLS fixtures**

Create in-memory workbooks with English headers and Chinese cell values. Cover blue-filled group starts, hyperlinks, multiple sheets, merged cells, and duplicate material rows; parse them through the real material workbook function and assert the selected sheet, text, group keys, URL, record count, and merged dataset grouping.

- [ ] **Step 2: Add empty, malformed, and bounded large-workbook cases**

Assert empty and malformed uploads reject, a workbook with thousands of material rows parses completely, and the source retains `sheetRows: 100_000` as a resource bound rather than claiming it is the security patch.

- [ ] **Step 3: Add an Excel date/timezone regression test**

Round-trip a numeric Excel date cell through ExcelJS and assert the resulting `Date` reaches the SheetJS formatter unchanged. Run this test under `TZ=Asia/Taipei` so a future double timezone adjustment cannot silently shift the rendered calendar date.

- [ ] **Step 4: Run focused workbook tests**

Run: `node --test tests/sheetjsSecurity.test.mjs tests/auditSpreadsheetSelection.integration.cjs tests/test-plan/spreadsheet-interaction.test.ts tests/test-plan/spreadsheet-workbook.test.ts`

Expected: all focused XLS/XLSX tests PASS.

---

### Task 3: Full verification and handoff

**Files:**
- Modify only if verification exposes a SheetJS-specific defect: files listed in Tasks 1-2.

**Interfaces:**
- Consumes: the exact dependency pin and regression coverage.
- Produces: build, type, unit, lint-baseline, diff, commit, and draft-PR evidence.

- [ ] **Step 1: Verify the dependency tree and advisories**

Run: `npm ls xlsx --depth=0` and `npm audit --json`.

Expected: direct `xlsx@0.20.3`; neither target GHSA remains reachable. Other advisories, if any, are reported separately.

- [ ] **Step 2: Run repository verification**

Run: `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, and `git diff --check`.

Expected: focused tests, full tests, typecheck, build, and whitespace check PASS. Lint is compared with the known baseline and reported separately rather than silently broadened into this repair.

- [ ] **Step 3: Review and commit the exact diff**

Run: `git diff -- package.json package-lock.json tests/sheetjsSecurity.test.mjs docs/superpowers/plans/2026-10-03-sheetjs-security-repair.md`, then commit the scoped files.

- [ ] **Step 4: Push the repair branch and create a draft PR**

Push only the repair branch and create a draft pull request targeting `main`. Do not merge or deploy until the parent independently reviews the exact head and checks.
