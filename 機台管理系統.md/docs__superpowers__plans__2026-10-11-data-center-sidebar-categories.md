> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-11-data-center-sidebar-categories.md`；程式參考基準：`22f669036d89108fe73cf4b74d4117f3e332739f`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Data Center sidebar categories

> Execute inline with the existing approved workflow; no additional phase approval is needed.

**Goal:** Make the existing sidebar categories immediately distinguishable without changing palette, action order, data or permissions.

**Design:** Keep the two existing categories and seven actions. Use labelled navigation groups, 14px bold foreground headings on the existing neutral secondary surface, an explicit separator and 16px group spacing. Keep 4px within each group and the existing selection/focus states. The current-project summary remains separate with the same heading treatment. Do not add collapsible categories or reduce click targets.

**Files:** `DeploymentPlanningCenter.tsx`, `data-center.css`, `tests/dataCenterTaskFlow.test.mjs`.

## Checks

- [x] Add the labelled-group/header regression to the existing task-flow test; run it and confirm the missing grouping fails.
- [x] Wrap the existing action arrays into `role="group" aria-label={group.label}` sections, preserving every callback and button attribute. Scope the heading/spacing styles to the Data Center sidebar.
- [x] Run Data Center contracts, scoped ESLint, TypeScript and the production build.
- [x] Actually open each navigation category, collapse/expand the sidebar, check a short desktop viewport, and confirm the unchanged mobile controls. Preserve production configuration.
- [x] Review the final diff and independent source-review findings; save screenshots outside the repository.

**Release procedure:** Commit the verified changes, fast-forward main, push, then verify Pages success and the formal sidebar. Record the resulting commit and deployment in the final handoff.

The independent layout assessment identified 12px muted category headings matching the helper text; the isolated mechanical layout pre-scan reported no findings. Only the sidebar findings are in scope.

## Verification evidence

- TDD: the new category regression failed before implementation; the final Data Center/facility contracts passed 143/143. Scoped ESLint, application/node TypeScript checks and the production build passed.
- Actual browser: opened all seven sidebar actions, returned from reports and 2D to overview, and closed each settings dialog without editing configuration or submitting reports. Selection indicators stayed correct and overview opened no dialog.
- Desktop checks: 1280x720, 1440x900 and 1024x600 had no page-level horizontal overflow. The short sidebar scrolled to its project summary. All three title bands share the same 188px width and existing neutral tokens, with 14px/700 headings. Collapsed action targets remain centered at 44x44px.
- Mobile 390x844: desktop groups stay hidden; the unchanged primary controls measure 90.5x54px. The project/site dialog is 366px wide with 12px viewport margins and no horizontal overflow. This is browser-size validation, not physical-phone testing.
- Final browser console had no warnings or errors. Independent source review found no blocking issues; mechanical layout detection is a separate check, not proof of usability.
- Screenshots are saved outside Git under the task visualization directory `data-center-sidebar-2026-10-11`.
- The full repository suite, other workspaces and physical screen-reader/device behavior are outside this narrowly scoped visual change.
