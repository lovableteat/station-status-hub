# Test_Plan Spreadsheet Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Test_Plan Excel editor display values with Excel formatting, insert rows and columns beside the current selection, and render Excel-colored sheet tabs below the grid.

**Architecture:** Keep ExcelJS as the editable `.xlsx` workbook and dynamically load SheetJS only for SSF formatting and legacy workbooks. Add pure selection/number helpers to `spreadsheetInteraction.ts`, then keep workbook mutation and rendering in the existing editor so save behavior remains unchanged.

**Tech Stack:** React 18, TypeScript, ExcelJS 4.4, SheetJS 0.18, Node test runner, Vite.

## Global Constraints

- Preserve raw values, formulas, styles, merges, other worksheets, and the existing save-to-original-file flow.
- Insert below the selected range or to its right; never split an existing merged range.
- Keep SheetJS dynamically imported so the initial application bundle does not grow.
- Sheet tabs must remain keyboard-accessible and horizontally scrollable on narrow screens.
- Use the existing Test_Plan dark product UI tokens and interaction vocabulary.

---

### Task 1: Pure display and insertion helpers

**Files:**
- Modify: `src/components/test-plan/spreadsheetInteraction.ts`
- Modify: `tests/test-plan/spreadsheet-interaction.test.ts`

**Interfaces:**
- Produces: `formatSpreadsheetNumber(value, numberFormat, formatter)`.
- Produces: `getSpreadsheetInsertionIndex(selection, axis, merges)`.
- Consumes: existing `SpreadsheetSelection` and normalized selection helpers.

- [ ] **Step 1: Write failing number-format tests**

Add tests that expect IEEE-754 tails to normalize and custom Excel formats to be delegated:

```ts
assert.equal(formatSpreadsheetNumber(50.400000000000006, "General"), "50.4");
assert.equal(formatSpreadsheetNumber(0.125, "0.0%", (format, value) => `${format}:${value}`), "0.0%:0.125");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/test-plan/spreadsheet-interaction.test.ts`

Expected: FAIL because `formatSpreadsheetNumber` is not exported.

- [ ] **Step 3: Implement the number formatter**

Implement a formatter that calls the supplied SSF function with `numberFormat || "General"`, catches invalid formats, and otherwise falls back to a 15-significant-digit General representation:

```ts
export type SpreadsheetNumberFormatter = (format: string, value: number) => string;

export function formatSpreadsheetNumber(
  value: number,
  numberFormat = "General",
  formatter?: SpreadsheetNumberFormatter,
): string {
  try {
    const formatted = formatter?.(numberFormat || "General", value);
    if (formatted !== undefined && formatted !== "") return formatted;
  } catch {
    // Fall through to a safe General representation.
  }
  return String(Number(value.toPrecision(15)));
}
```

- [ ] **Step 4: Write failing insertion-position tests**

Cover a single selection, a multi-cell selection, and a merge crossing the first candidate position:

```ts
assert.equal(getSpreadsheetInsertionIndex(selection, "row", []), 9);
assert.equal(getSpreadsheetInsertionIndex(selection, "column", []), 6);
assert.equal(getSpreadsheetInsertionIndex(selection, "row", [{ startRow: 9, endRow: 11, startColumn: 1, endColumn: 3 }]), 12);
```

- [ ] **Step 5: Verify RED, implement, and verify GREEN**

Run the focused test before and after implementation. The helper must repeatedly advance past overlapping merge ranges until the insertion point no longer splits a merge.

- [ ] **Step 6: Commit the helper cycle**

```bash
git add src/components/test-plan/spreadsheetInteraction.ts tests/test-plan/spreadsheet-interaction.test.ts
git commit -m "feat: add spreadsheet fidelity helpers"
```

---

### Task 2: Excel formatted display and workbook insertion

**Files:**
- Modify: `src/components/test-plan/TestPlanSpreadsheetEditor.tsx`
- Modify: `tests/test-plan/ui-contract.test.ts`

**Interfaces:**
- Consumes: `formatSpreadsheetNumber` and `getSpreadsheetInsertionIndex` from Task 1.
- Consumes: `XLSX.SSF.format` through a dynamically loaded module reference.
- Produces: formatted cell display and insertion actions that preserve styles and merges.

- [ ] **Step 1: Add failing UI contract assertions**

Assert that the editor loads ExcelJS and SheetJS in parallel for `.xlsx`, calls `SSF.format`, labels the actions `向下插入列` and `向右插入欄`, and reveals the inserted selection.

- [ ] **Step 2: Run the UI contract and verify RED**

Run: `node --test tests/test-plan/ui-contract.test.ts`

Expected: FAIL on the new SSF and insertion contracts.

- [ ] **Step 3: Integrate Excel number formats**

For `.xlsx`, load both libraries concurrently:

```ts
const [ExcelJS, spreadsheet] = await Promise.all([
  import("exceljs"),
  import("xlsx"),
]);
```

Store `spreadsheet.SSF.format` in a ref and call `formatSpreadsheetNumber` for numeric values and formula results. Keep formula input/editing behavior unchanged.

- [ ] **Step 4: Implement structure insertion**

Before ExcelJS splicing, snapshot and unmerge existing ranges; after splicing, shift ranges at or after the insertion index and merge them again. Copy only style, row height, or column width from the adjacent source, clear inserted values, mark the structure dirty, and reveal the new cell.

For legacy sheets, shift address-keyed cells in descending order and update `!ref`, `!rows`, `!cols`, and `!merges` with the same insertion index.

- [ ] **Step 5: Run focused and full Test_Plan tests**

```bash
node --test tests/test-plan/spreadsheet-interaction.test.ts tests/test-plan/ui-contract.test.ts
node --test tests/test-plan/*.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit workbook behavior**

```bash
git add src/components/test-plan/TestPlanSpreadsheetEditor.tsx tests/test-plan/ui-contract.test.ts
git commit -m "feat: improve Test Plan spreadsheet editing"
```

---

### Task 3: Bottom sheet tabs with Excel colors

**Files:**
- Modify: `src/components/test-plan/TestPlanSpreadsheetEditor.tsx`
- Modify: `src/components/test-plan/test-plan.css`
- Modify: `tests/test-plan/ui-contract.test.ts`

**Interfaces:**
- Consumes: existing `resolveColor` and workbook theme color resolution.
- Produces: `--test-plan-sheet-tab-color` on each tab button and `.test-plan-sheet-footer` layout.

- [ ] **Step 1: Add failing bottom-tab contract assertions**

Assert that the source reads `worksheet.properties.tabColor`, defines `.test-plan-sheet-footer`, emits `--test-plan-sheet-tab-color`, and renders the tablist after the grid.

- [ ] **Step 2: Run the UI contract and verify RED**

Run: `node --test tests/test-plan/ui-contract.test.ts`

Expected: FAIL because the tablist is still in the top toolbar.

- [ ] **Step 3: Move and color the tabs**

Remove the tablist from the top toolbar. Add a footer that places tabs before pagination, keeps the current tab semantics, and sets the CSS custom property from `properties.tabColor` through `resolveColor`.

- [ ] **Step 4: Add restrained tab states**

Use the workbook color for a 3px bottom indicator, active border, and focus ring. Keep inactive backgrounds neutral and provide horizontal scrolling at narrow widths.

- [ ] **Step 5: Verify and commit**

```bash
node --test tests/test-plan/ui-contract.test.ts
git add src/components/test-plan/TestPlanSpreadsheetEditor.tsx src/components/test-plan/test-plan.css tests/test-plan/ui-contract.test.ts
git commit -m "feat: render Excel sheet tabs below grid"
```

---

### Task 4: Production verification and durable report

**Files:**
- Create: `docs/superpowers/reports/2026-08-08-test-plan-spreadsheet-fidelity-completion.md`
- Modify only when verification finds a concrete defect: Test_Plan editor implementation files from Tasks 1-3.

**Interfaces:**
- Consumes: all behavior from Tasks 1-3.
- Produces: reproducible verification evidence and GitHub history.

- [ ] **Step 1: Run automated verification**

```bash
node --test tests/test-plan/*.test.ts
npx eslint src/components/test-plan/TestPlanSpreadsheetEditor.tsx src/components/test-plan/spreadsheetInteraction.ts tests/test-plan/spreadsheet-interaction.test.ts tests/test-plan/ui-contract.test.ts
npm run build
git diff --check
```

Expected: tests and build PASS; focused lint has no new errors; whitespace check is clean.

- [ ] **Step 2: Verify the rendered editor**

Open an authenticated Test_Plan Excel file and verify decimal formatting, insertion focus, bottom tab placement, tab colors, keyboard access, and narrow-width horizontal scrolling. If authentication is unavailable locally, record that limitation and rely on source contracts plus production build evidence.

- [ ] **Step 3: Write the completion report**

Record the user-visible outcomes, root causes, changed files, test commands, commit IDs, and deployment/push verification in the report.

- [ ] **Step 4: Commit and push**

```bash
git add docs/superpowers/reports/2026-08-08-test-plan-spreadsheet-fidelity-completion.md
git commit -m "docs: record spreadsheet fidelity completion"
git fetch origin main
git push origin HEAD:main
git ls-remote origin refs/heads/main
```

Expected: `origin/main` resolves to the final local commit.

