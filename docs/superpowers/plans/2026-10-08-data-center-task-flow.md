# Data Center task flow implementation plan

> **For agentic workers:** Use executing-plans inline. Steps use checkbox (`- [ ]`) syntax for tracking. The user has authorized implementation, verification, commit and push without phase questions.

**Goal:** Make the existing Data Center workspace understandable and make all of its planning dialogs readable on desktop and mobile.

**Architecture:** Reuse the existing scene, project selectors, rack inspector and model library. Task navigation changes view; settings actions open named dialogs. Scoped CSS also reaches portaled Data Center dialogs without changing shared UI or other workspaces.

**Tech Stack:** React, TypeScript, existing Radix dialog/select components, CSS and node:test. No new dependencies.

## Global constraints

- Change Data Center only; preserve the current palette, access checks, data schema and autosave safeguards.
- Preserve 3D/2D planning, site/project management, models, rack equipment and daily reports.
- Keep result search immediately above the rack results with its visible clearable conditions.
- Never mutate production configuration merely to check UI. Browser viewport checks are not physical-device validation.

### Task 1: Purpose and navigation

**Files:** `tests/dataCenterTaskFlow.test.mjs`, `src/components/data-center/DeploymentPlanningCenter.tsx`, `src/components/data-center/data-center.css`.

**Interfaces:** Existing `changeView(boolean)`, `setWorkspaceMode("3d" | "2d")` and dialog state setters remain the source of truth.

- [x] Add and run the regression: `node --test tests/dataCenterTaskFlow.test.mjs`; expect the missing overview handler to fail.
- [x] Implement the common overview action:

```tsx
const openSceneOverview = () => {
  changeView(false);
  setWorkspaceMode("3d");
  setMobileLeftOpen(false);
  setMobileRightOpen(false);
  requestCamera("overview");
};
```

- [x] Group navigation into `查看與回報` and `配置工具`, with visible purpose text and mobile labels. Explain that the scene shows configured equipment rather than claiming live telemetry.
- [x] Run `node --test tests/dataCenterTaskFlow.test.mjs` and all `tests/dataCenter*.test.mjs`.

### Task 2: Dialog consistency

**Files:** The main component, `DataCenterModelViewer.tsx`, `FacilityAisleCreationDialog.tsx`, `DataCenter2DPlanner.tsx`, scoped CSS and relevant existing UI contract tests.

**Interfaces:** Add optional `hideHeader?: boolean` to the existing navigator/inspector props, default false. Only portaled dialogs opt into `dc-dialog`.

- [x] Run the new dialog/title checks while red.
- [x] Use a visible dialog header and pass `hideHeader` to nested panels; close the selector before opening project/model management.
- [x] Apply the scoped layout floor:

```css
.dc-dialog[data-ui="dialog"] {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  max-height: min(calc(100dvh - 32px), 860px);
}
```

- [x] Normalize heading/body/control sizes within Data Center only, retain scrollable bodies and read-only/disabled states, and retain 44px mobile primary targets.
- [x] Update only intentionally changed labels/layout assertions in existing source-contract tests; do not weaken geometry, data or permission tests.

### Task 3: Verification and release

- [x] Run scoped ESLint, `npm run typecheck`, `npm run build`, Data Center source tests and existing service/React integration tests.
- [x] Browser-check 1440px and 1024px desktop plus 390px mobile: overview has no popup, selectors/rack/model/facility dialogs fit, controls have readable labels, and 2D/3D and reports remain usable. Save screenshots outside the repository before handoff.
- [x] Run the impeccable detector once on the finished changed UI; resolve in-scope findings.
- [x] Review the complete diff and the independent reviewer findings.

**Release procedure:** Commit the verified changes, fast-forward main, push, then verify GitHub Pages and the formal page. The final handoff records the resulting commit and deployment run.

Known unrelated baseline: three full-suite tests fail in collaboration/performance modules. Report them separately if still present; do not claim full-suite green.

## Verification evidence

- Source contracts: 142/142 passed, including task flow, facility placement, 3D camera geometry, mobile controls and visible result filters.
- Scoped ESLint, application/node TypeScript checks and the production build passed. The full unit suite is 1086/1089: only the same three pre-existing collaboration/performance failures remain; no Data Center failure remains.
- Service and rendered React integration: 13/13 passed, including view-only access, serialized/CAS saves, foreign updates, failed-save draft recovery and report ownership.
- Actual browser operations: overview opens zero dialogs; project/model transitions close the selector; model search/category chips clear independently and together; empty results retain the list heading; model action shortcut scrolls to the existing controls; model inspection, import mode, aisle creation and project creation can be opened and cancelled without writes.
- Desktop 1440px: site/rack/model/project/facility dialogs measure 680/980/1120/1040/760px, all with zero outer padding and no horizontal overflow. Mobile 390px dialogs measure 366px; the final 2D canvas is 374px wide and 343px high, with a single-row tool strip and clear space for the unchanged floating-chat button.
- Independent review found repeated camera selection suppressed by Radix Select and a 40px wrapper around a 44px mobile input. Both fixed; camera presets use repeatable action-menu commands with a runnable request-ID regression. Browser inspection also caught unused model-preview grid height, now assigned to the model.
- Browser console: no warnings or errors during the local UI walkthrough. Production project timestamps remained unchanged; only the agent's old localhost QA draft was cleared.
- Actual convenience walkthrough: selecting TPE-B04, opening its contextual equipment action, closing it, visiting reports and returning retains Test / Taipei AI Lab / TPE-B04. Search for Generic hides the original model's actions until the Generic card is explicitly selected; only then is the Generic-to-TPE-B04 action shown. No model was applied during this check.
- Model-selection regression: removed the display-only first-result fallback, which could show one model while parent apply/add callbacks still used the original ID. A runnable expression check now requires the visible selection to match the authoritative selected ID.
- Physical phone keyboard, IME and safe-area behavior were not tested; mobile evidence is a browser viewport check.
