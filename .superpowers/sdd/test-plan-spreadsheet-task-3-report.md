# Task 3: Excel-colored worksheet tabs below the grid

## Scope and changed paths

- `src/components/test-plan/TestPlanSpreadsheetEditor.tsx`
  - Reads each formatted worksheet's `worksheet.properties.tabColor`.
  - Resolves the color through the existing `resolveColor`, including its
    ARGB, indexed, theme, and tint support.
  - Moves the ARIA tablist from the toolbar to a footer immediately after the
    grid and before pagination.
  - Sets `--test-plan-sheet-tab-color` on every tab, using a neutral fallback
    where a worksheet does not define a color.
- `src/components/test-plan/test-plan.css`
  - Adds the footer layout and a horizontally scrollable tab strip.
  - Uses a restrained 3px color indicator, color-matched active border and
    focus ring, and neutral inactive backgrounds.
- `tests/test-plan/ui-contract.test.ts`
  - Adds the source contract for worksheet tab color lookup, the CSS custom
    property, footer layout, horizontal overflow, and footer placement after
    the grid.

No workbook number-formatting or structure-insertion code was changed.

## RED evidence

1. Added `renders Excel-colored worksheet tabs below the spreadsheet grid`
   before editing production code.
2. Ran:

   ```text
   node --test tests/test-plan/ui-contract.test.ts
   ```

3. Result: 9 passing, 1 failing. The new test failed as intended on the
   missing `worksheet.properties.tabColor` source contract.

## GREEN and verification evidence

- `node --test tests/test-plan/ui-contract.test.ts` — 10 passing, 0 failing.
- `node --test tests/test-plan/*.test.ts` — 61 passing, 0 failing.
- `npm.cmd run build` — production build completed successfully.
- `git diff --check` — no whitespace errors.

`npm.cmd` was used for the build because the local PowerShell execution
policy blocks `npm.ps1`.

## Self-review

- The only rendered tablist is in `.test-plan-sheet-footer`, positioned after
  `.test-plan-sheet-grid-wrap` and before pagination.
- The existing `role="tablist"`, `role="tab"`, `aria-selected`, button
  activation, and selection-reset behavior were retained.
- `resolveColor` is called with the worksheet tab color and the workbook's
  already-resolved theme palette, so existing theme/indexed/tint handling is
  reused rather than duplicated.
- The footer has `min-width: 0`; its tab strip remains horizontally scrollable
  on narrow widths. Inactive tabs use a neutral background, while the color is
  restricted to the 3px indicator, active border, and focus outline.
- Reviewed the scoped diff for accidental edits to number formatting and
  insertion behavior; none were present.

## Concerns

- The build emits existing repository-level warnings about stale Browserslist
  data, externalized CAD dependency modules, and large chunks. They are
  unrelated to this scoped change.
- Verification is source-contract, test-suite, and production-build based; an
  authenticated manual browser check with a workbook containing themed/indexed
  tab colors was not available in this task.
