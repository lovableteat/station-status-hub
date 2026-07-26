# GB300 Rack Equipment Implementation Plan

> Execute inline in the isolated `codex/gb300-rack-equipment` worktree. The user explicitly approved the design and requested direct implementation. Do not use subagents in this side conversation.

## Task 1: Lock the equipment contract with failing tests

**Files**

- Create: `tests/dataCenterGb300RackEquipment.test.mjs`
- Create: `src/components/data-center/gb300RackEquipment.mjs`

**Steps**

1. Add tests asserting the six logical rack regions contain two Power Shelves, one Switch Tray bank, one CDU, and two references to the existing L10 zones without creating a Compute Tray model.
2. Add tests for deterministic U ranges and legacy device resolution.
3. Add tests for healthy, warning, critical, and offline LED output.
4. Run `node --test tests/dataCenterGb300RackEquipment.test.mjs` and confirm it fails because the topology module does not exist.
5. Implement the smallest pure module that satisfies the contract.
6. Re-run the test and confirm it passes.

## Task 2: Build the isolated interactive 3D overlay

**Files**

- Create: `src/components/data-center/GB300RackEquipment3D.tsx`
- Modify: `src/components/data-center/DataCenter3DPlanner.tsx`
- Modify: `tests/dataCenterGb300RackEquipment.test.mjs`

**Steps**

1. Add a failing source contract test requiring the GB300 overlay to be mounted separately from `RackL10Modules`.
2. Run the focused test and confirm the expected failure.
3. Implement memoized Power Shelf, Switch Tray, CDU, LED, port, grille, and hit-target components.
4. Mount the overlay only when `rack.modelId === "nv-mgx-rack-v1-2-rev7"`.
5. Pass selection and health update callbacks without changing `RackL10Modules`.
6. Re-run the focused test.

## Task 3: Add the equipment inspector and persistent status editing

**Files**

- Modify: `src/components/data-center/DataCenter3DPlanner.tsx`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Modify: `src/components/data-center/dataCenterSeed.ts`
- Modify: `tests/dataCenterGb300RackEquipment.test.mjs`

**Steps**

1. Add failing tests for the status-edit callback contract and explicit seed records for upper/lower Power Shelf and CDU.
2. Run the focused test and confirm expected failures.
3. Add equipment selection state and a platform-styled HTML inspector with semantic status controls.
4. Wire the callback to immutable `sites` updates so the existing local-storage persistence effect stores changes.
5. Extend only GB300 seed rack devices with explicit upper/lower Power Shelf and CDU records.
6. Re-run the focused and existing Data Center tests.

## Task 4: Verify the rendered product

**Steps**

1. Run focused test: `node --test tests/dataCenterGb300RackEquipment.test.mjs`.
2. Run Data Center suite: `node --test tests/dataCenter*.test.mjs`.
3. Run changed-file lint: `npx eslint src/components/data-center/GB300RackEquipment3D.tsx src/components/data-center/DataCenter3DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx src/components/data-center/dataCenterSeed.ts`.
4. Run production build: `npm run build`.
5. Start the local Vite app and use the in-app browser first; use Playwright only if the browser connector is unavailable.
6. Capture desktop and mobile screenshots and inspect them with `view_image` against the supplied actual rack/anatomy references.
7. Verify clicks and all four states for Power Shelf, Switch Tray, and CDU; confirm the L10 model remains unchanged.
8. Record any baseline unrelated failures separately and do not mix fixes into this task.

## Task 5: Integrate and publish safely

**Steps**

1. Review `git diff`, confirm only GB300 task files changed, and remove temporary artifacts.
2. Fetch `origin/main`; if it advanced, rebase the feature branch and rerun focused tests plus build.
3. Commit with an explicit GB300 message.
4. Push `HEAD:main` without force.
5. Verify the remote main commit and GitHub deployment/check status.

