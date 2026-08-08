# Test Plan Lower Workspace Design

## Goal

Use the large unused area beneath the Test Plan file workspace as a compact engineering overview. The overview should help a user understand the active space at a glance without interrupting file browsing or introducing a new backend data model.

## Decision

Add a responsive three-panel overview below the existing three-column file workspace:

1. **Space summary** — active space name, description, current location, and a short next-action prompt based on the current folder contents.
2. **File composition** — counts and relative proportions for the supported file categories in the active space. The panel uses existing `files` data and stays useful even when the current folder is empty.
3. **Recent updates** — the four most recently updated files in the active space, showing category, size, and date. Selecting an item opens the existing inspector; no separate activity log is implied.

The recommended approach is selected over a chart-heavy dashboard or a test-management panel because the current page already owns authoritative file metadata, while test execution and activity history are not available in this domain.

## Scope and component boundaries

- Create `src/components/test-plan/TestPlanOverview.tsx` as a presentational component.
- Pass the active space, active folder label, folders, files, and selection callback from `TestPlanWorkspace`.
- Reuse `TestPlanFileCategory`, `TestPlanFileRecord`, `formatTestPlanFileSize`, and the existing category icon treatment.
- Do not add Supabase tables, storage calls, or a second source of truth.
- Keep the existing toolbar, file grid/list, inspector, dialogs, and upload flow unchanged.

## Interaction

- Recent-file rows are keyboard-focusable buttons. Clicking or pressing Enter selects the file using the existing `selectedEntryKey` flow.
- The summary panel's primary prompt is informational and must not pretend to perform an action that is not wired to the existing controls.
- Category bars are read-only and expose their counts in text, not only through color.
- If there are no files, the composition panel shows a clear empty state and the recent-updates panel tells the user to upload an engineering file.
- If there is no active space, the overview is not rendered because the page already has a dedicated create-space empty state.

## Layout and visual direction

- Desktop: three columns with the summary panel slightly wider than the two supporting panels.
- Tablet/mobile: panels stack in source order, with no horizontal scrolling required for the overview.
- Use the existing Test Plan CSS variables, navy surfaces, cyan focus color, restrained semantic category colors, 10–12px borders, and numeric accents.
- The lower overview is a sibling of `.test-plan-shell`, not nested inside the file grid, so it can fill the previously unused page area without changing file-list scrolling.
- Use compact cards and rows; avoid a second toolbar or a duplicated metric strip.

## Derived data

- Category counts are calculated from the active-space `files` array.
- Category distribution percentages are calculated against `files.length`; zero-file spaces render zero-width bars and explanatory text.
- Recent updates sort by `updatedAt` descending and use a stable filename tie-breaker.
- Current location comes from the active space name plus the existing folder breadcrumbs supplied by the parent.

## Responsive and accessibility requirements

- Every recent-file item has an accessible name containing the filename.
- Decorative category bars have adjacent visible labels and counts.
- Focus states must be visible against the dark surface.
- At mobile widths the overview uses one column and preserves readable file names through truncation plus the accessible name.
- Respect `prefers-reduced-motion` for any hover or progress transitions.

## Verification

- Add focused source-contract tests for the overview labels, recent-file selection hook-up, empty states, and responsive class names where the existing test style supports it.
- Run the focused Test Plan tests, ESLint, and production build.
- Use browser QA to verify the active Test Plan page is nonblank, the lower overview appears with seeded files, recent-file selection updates the inspector, and the overview stacks on a narrow viewport.
