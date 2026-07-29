# Test_Plan and Admin UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Test_Plan engineering-file workflow and align the administration workspace with the machine-maintenance shell.

**Architecture:** Keep the existing Supabase repository and permission model, add focused space-form and inspector components, and compose them in a responsive three-region file workspace. Replace the administration hero and horizontal tabs with a dedicated responsive sidebar while reusing maintenance header and metric primitives.

**Tech Stack:** React 18, TypeScript, Vite, shadcn/Radix, Tailwind CSS, Supabase Storage, Node test runner.

## Global Constraints

- Existing Test_Plan tables, private storage bucket, owner scoping and permissions remain unchanged.
- Existing user, collaboration and API mutations remain unchanged.
- Test_Plan file limits remain 500 MiB per file and 20 files per batch.
- Visual tokens follow the maintenance workspace: `#06111f`, `#071522`, `#2a526f`, `#4c8dff`.
- Browser preview must release Blob URLs on selection change and unmount.
- No force push; compare `origin/main` immediately before commit and push.

---

### Task 1: Lock the UI and preview contracts

**Files:**
- Modify: `tests/test-plan/ui-contract.test.ts`
- Modify: `tests/adminControlRoomUi.test.mjs`
- Create: `src/components/test-plan/core/preview.ts`
- Modify: `tests/test-plan/domain.test.ts`

**Interfaces:**
- Produces `getTestPlanPreviewKind(file): "image" | "pdf" | "text" | "unsupported"`.
- Requires `TestPlanSpaceDialog`, `TestPlanInspector`, `AdminSidebar`, maintenance tokens, and responsive drawer contracts.

- [ ] Add domain assertions for image, PDF, text/CSV/Markdown, and unsupported Office/3D/PCB preview classification.
- [ ] Add source-contract assertions for the space description/color fields, guided empty state, inspector, private Blob preview, object URL cleanup, and admin sidebar.
- [ ] Run `node --test tests/test-plan/domain.test.ts tests/test-plan/ui-contract.test.ts tests/adminControlRoomUi.test.mjs`.
- [ ] Confirm the new assertions fail because the preview helper and redesigned components do not exist.

### Task 2: Complete Test_Plan forms and inspector

**Files:**
- Create: `src/components/test-plan/TestPlanSpaceDialog.tsx`
- Create: `src/components/test-plan/TestPlanInspector.tsx`
- Create: `src/components/test-plan/core/preview.ts`
- Modify: `src/components/test-plan/TestPlanWorkspace.tsx`
- Modify: `src/components/test-plan/test-plan.css`

**Interfaces:**
- `TestPlanSpaceDialog` consumes the current space, `busy`, `open`, and `onSubmit({name, description, color})`.
- `TestPlanInspector` consumes the selected entry, `downloadFile`, `onDownload`, edit callbacks, and permission flags.
- The workspace owns `selectedEntryId` and clears it when the active space/folder changes.

- [ ] Implement preview classification with extension and MIME checks.
- [ ] Implement the full space form with trimmed name, optional description and six accessible color choices.
- [ ] Implement cancellable private-file loading, Blob URL cleanup, image/PDF/text preview, metadata, and unsupported-format download state.
- [ ] Replace the name-only space action with the full form and pass description/color to `createSpace` and `updateSpace`.
- [ ] Change file interaction to select/inspect, preserve double-click folder navigation, and expose preview/download from the inspector.
- [ ] Replace the oversized empty canvas with a three-step quick-start state and maintenance-style metric strip.
- [ ] Run the focused tests until green.

### Task 3: Rebuild the administration shell

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/components/admin/admin-panel.css`
- Modify: `src/components/admin/AdminPanel.tsx`
- Modify: `tests/adminControlRoomUi.test.mjs`

**Interfaces:**
- `AdminSidebar` consumes `activeTab`, `canViewApiManagement`, `onTabChange`, `isOpen`, and `onOpenChange`.
- `AdminPanel` remains the owner of `activeTab` and every existing mutation.

- [ ] Implement the desktop collapsible sidebar and mobile drawer with users, collaboration, and conditional API navigation.
- [ ] Replace the decorative administration hero with `MaintenancePageHeader`.
- [ ] Replace the horizontal `TabsList` with visually hidden tab triggers plus sidebar-driven state.
- [ ] Restyle status, filters and account surfaces to maintenance tokens without changing handlers.
- [ ] Add responsive layout rules and verify keyboard labels and focus states.
- [ ] Run the admin contract test until green.

### Task 4: Browser and production verification

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Produces a browser-verified desktop and narrow-screen implementation.

- [ ] Run focused Node tests for Test_Plan and admin.
- [ ] Run `tsc --noEmit`, focused ESLint, `git diff --check`, and replacement-character scan.
- [ ] Run `npm.cmd run build`.
- [ ] Use the Browser plugin against the demo admin route to test sidebar navigation, collapse/drawer, and console health.
- [ ] Use a local authenticated-component preview or source-backed Test_Plan harness to verify empty, populated, selected-preview, and narrow-screen states without committing QA-only code.
- [ ] Compare screenshots against the supplied maintenance and before-state references and repair remaining visual drift.
- [ ] Fetch and compare `origin/main`, commit intended files, fetch again, and push `HEAD:main` without force.
- [ ] Verify the GitHub Pages action and the deployed administration route.
