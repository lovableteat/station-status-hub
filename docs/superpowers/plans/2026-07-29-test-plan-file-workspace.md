# Test_Plan File Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready personal engineering-file workspace named Test_Plan to the maintenance platform.

**Architecture:** A focused domain layer classifies and validates files, a Supabase repository owns metadata and private-object operations, and a React hook presents one coherent state/action API to the page. The page is lazy-loaded by the existing Index shell and uses the same maintenance navigation, permissions, and visual tokens.

**Tech Stack:** React 18, TypeScript, Supabase Postgres/Storage, Tailwind/shadcn, Node test runner, Vite.

## Global Constraints

- Location is the station-status left navigation with module id `test-plan`.
- Data is scoped by the current `system_users.id`.
- Storage bucket is private and named `test-plan-files`.
- Maximum file size is 500 MiB and maximum batch size is 20.
- PPT/PPTX, XLS/XLSX/XLSM/CSV, STEP/STP/STL/OBJ/GLB/GLTF/3MF/IGES/IGS, and BRD/KiCad/Gerber formats are first-class.
- Unknown non-executable files remain uploadable; executable/script files are rejected.
- No destructive action proceeds without confirmation.
- Push is fast-forward only after a fresh `origin/main` comparison.

---

### Task 1: Domain rules and tests

**Files:**
- Create: `src/components/test-plan/types.ts`
- Create: `src/components/test-plan/core/files.ts`
- Create: `src/components/test-plan/core/tree.ts`
- Create: `tests/test-plan/domain.test.ts`

**Interfaces:**
- Produces `TestPlanFileCategory`, `classifyTestPlanFile`, `validateTestPlanUpload`, `buildStoragePath`, `buildFolderBreadcrumbs`, `isFolderDescendant`, `filterAndSortEntries`.

- [ ] Write failing tests for all first-class formats, blocked executable formats, 500 MiB and 20-file limits, safe object paths, breadcrumbs, descendant cycles, filtering, and stable sorting.
- [ ] Run `node --test tests/test-plan/domain.test.ts` and confirm failures are caused by missing modules.
- [ ] Implement the typed domain helpers without browser or Supabase dependencies.
- [ ] Rerun the domain tests and confirm every case passes.

### Task 2: Database, storage, and permission contracts

**Files:**
- Create: `supabase/migrations/20260729160000_create_test_plan_workspace.sql`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/lib/workspacePermissions.ts`
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/collaboration/CollaborationCenter.tsx`
- Modify: `src/components/collaboration/AdminCollaborationPanel.tsx`
- Modify: `src/utils/siteArchiveExport.ts`
- Create: `tests/test-plan/platform-integration.test.ts`

**Interfaces:**
- Consumes domain type names from Task 1.
- Produces database tables `test_plan_spaces`, `test_plan_folders`, `test_plan_files`, bucket `test-plan-files`, and permission prefix `test_plan`.

- [ ] Write a failing source integration test that requires the new navigation, lazy route, permissions, tables, triggers, private bucket, and storage policies.
- [ ] Run the integration test and confirm it fails on the missing Test_Plan contracts.
- [ ] Add the enum permissions, validation-RPC workspace payload compatibility, tables, indexes, timestamps, hierarchy guards, and storage bucket/policies in one idempotent migration.
- [ ] Update generated database type declarations and all platform module labels/maps.
- [ ] Add the lazy page route and station-content guard.
- [ ] Rerun integration and existing PCB integration tests.

### Task 3: Repository and state hook

**Files:**
- Create: `src/components/test-plan/core/repository.ts`
- Create: `src/components/test-plan/hooks/useTestPlanWorkspace.ts`
- Create: `tests/test-plan/repository.test.ts`

**Interfaces:**
- Consumes `TestPlanSpace`, `TestPlanFolder`, `TestPlanFile`, domain validation/path helpers, current user id, and Supabase client.
- Produces `TestPlanRepository` and `UseTestPlanWorkspaceResult` with load, select, create, rename, move, upload, download, and delete actions.

- [ ] Write failing repository tests using an in-memory adapter for owner scoping, first-space activation, nested folder navigation, partial batch failure cleanup, safe move targets, and storage-before-metadata deletion.
- [ ] Run the repository tests and verify expected failures.
- [ ] Implement a dependency-injected repository that coordinates metadata and object storage.
- [ ] Implement the hook with loading/error/progress state, stale-request suppression, and permission guards.
- [ ] Rerun repository/domain tests and focused ESLint.

### Task 4: Test_Plan page and dialogs

**Files:**
- Create: `src/components/test-plan/TestPlanWorkspace.tsx`
- Create: `src/components/test-plan/TestPlanSidebar.tsx`
- Create: `src/components/test-plan/TestPlanToolbar.tsx`
- Create: `src/components/test-plan/TestPlanContent.tsx`
- Create: `src/components/test-plan/TestPlanDialogs.tsx`
- Create: `src/components/test-plan/test-plan.css`
- Create: `tests/test-plan/ui-contract.test.ts`

**Interfaces:**
- Consumes `UseTestPlanWorkspaceResult`.
- Produces the lazy-rendered page component `TestPlanWorkspace`.

- [ ] Write failing UI contract tests for page identity, space/folder creation, drag/drop and multi-file input, search/category/sort, list/grid switch, breadcrumb, rename/move/download/delete actions, format badges, empty/error states, view-only disablement, and mobile drawer.
- [ ] Run the UI test and confirm missing UI failures.
- [ ] Build the responsive shell, rail, toolbar, breadcrumb, drop zone, entry views, progress panel, and accessible dialogs using existing shadcn primitives.
- [ ] Connect every visible control to the hook action and provide concise Traditional Chinese success/error feedback.
- [ ] Rerun UI tests and focused ESLint.

### Task 5: End-to-end verification and safe main delivery

**Files:**
- Modify only files required by verified defects.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified production build and a fast-forward GitHub main update.

- [ ] Run `node --test tests/test-plan/*.test.ts tests/pcb-designer/*.test.ts`.
- [ ] Run focused ESLint over all Test_Plan and changed PCB files.
- [ ] Run `npm.cmd run build` and confirm the 3D bundle is lazy.
- [ ] Use the local app in demo/admin mode to verify desktop and mobile Test_Plan flows and recheck PCB 2D/3D.
- [ ] Run `git diff --check`, replacement-character scan, and a final code review.
- [ ] Stage only intended files and create the feature commit.
- [ ] Run `git fetch origin main` and inspect `git log --left-right origin/main...HEAD`.
- [ ] If remote advanced, rebase/merge safely, resolve deliberately, and rerun tests/build.
- [ ] Push with `git push origin HEAD:main` without force and verify remote `main` equals local `HEAD`.
