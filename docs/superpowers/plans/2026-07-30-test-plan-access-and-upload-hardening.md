# Test_Plan Access and Upload Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Test_Plan automatically available to every active user who can access the maintenance workspace, and make engineering-file uploads reliable for Unicode filenames and a broad engineering format set.

**Architecture:** Treat Test_Plan as a child capability of the canonical `station-status` workspace. The browser and PostgreSQL RLS function will share the same rule: configured station `view` grants Test_Plan viewing, configured station `edit` grants viewing and editing, configured `none` denies access, and only legacy accounts without a `station-status` key fall back to explicit `test_plan_*` page permissions. Store human-readable Unicode filenames only in metadata while generating opaque ASCII-only Supabase Storage object keys.

**Tech Stack:** React 18, TypeScript, Supabase Postgres/Storage, Tailwind/shadcn, Node test runner, Vite.

## Global Constraints

- Preserve active-user checks, administrator bypasses, owner scoping, private bucket policies, and 500 MiB per-file limit.
- Do not backfill or trust stale `test_plan_*` permission rows when `station-status` is explicitly configured.
- Preserve original filenames exactly for display and download.
- Storage object keys may contain only ASCII owner/space/object identifiers plus a normalized safe extension.
- Unknown non-executable engineering artifacts remain uploadable and are classified as `other`.
- Potentially active browser content is never rendered as HTML or SVG; supported text/source files are shown only as escaped text.
- Maximum upload batch remains 20 files and gains a 1 GiB aggregate limit.

---

### Task 1: Lock the access contract with failing tests

**Files:**
- Modify: `tests/workspacePermissions.test.mjs`
- Modify: `tests/test-plan/platform-integration.test.ts`

- [ ] Add cases proving station `view` grants Test_Plan view, station `edit` grants view/edit, and station `none` defeats stale explicit Test_Plan rows.
- [ ] Add a legacy fallback case for accounts without a `station-status` workspace key.
- [ ] Add a migration contract requiring the database predicate to derive access from `workspaceAccess.station-status`.
- [ ] Run the focused tests and confirm the new assertions fail for the existing implementation.

### Task 2: Lock filename, format, and upload behavior with failing tests

**Files:**
- Modify: `tests/test-plan/domain.test.ts`
- Modify: `tests/test-plan/repository.test.ts`
- Modify: `tests/test-plan/errors.test.ts`

- [ ] Add an engineering format matrix covering Office/OpenDocument, CAD/3D, PCB/EDA/Gerber, source/configuration, firmware, archives, logs, and raster images.
- [ ] Add Unicode, accented, emoji, multi-dot, empty-MIME, duplicate-name, and ASCII-only object-key cases.
- [ ] Add blocked executable and 1 GiB aggregate-batch cases.
- [ ] Add a user-facing mapping for defensive `Invalid key` failures.
- [ ] Run the focused tests and confirm failures are limited to the missing behavior.

### Task 3: Implement the shared access rule

**Files:**
- Modify: `src/lib/workspacePermissions.ts`
- Modify: `src/components/admin/UserPermissionsDialog.tsx`
- Create: `supabase/migrations/20260730220000_inherit_test_plan_maintenance_access.sql`

- [ ] Make `canAccessModule` return directly from configured `station-status` access for `test-plan`, while retaining explicit-permission fallback only when the workspace key is absent.
- [ ] Present Test_Plan as an inherited maintenance capability in the administrator permission editor instead of a misleading independent toggle.
- [ ] Replace `test_plan_current_user_can` with the same configured-workspace/legacy-fallback rule and reapply execution grants.
- [ ] Rerun access and migration contract tests.

### Task 4: Implement robust engineering uploads

**Files:**
- Modify: `src/components/test-plan/types.ts`
- Modify: `src/components/test-plan/core/files.ts`
- Modify: `src/components/test-plan/core/preview.ts`
- Modify: `src/components/test-plan/core/errors.ts`
- Modify: `src/components/test-plan/TestPlanWorkspace.tsx`

- [ ] Generate object paths as `ownerId/spaceId/objectId.ext`, validating every segment and normalizing the extension to ASCII.
- [ ] Keep `original_name` unchanged in repository metadata and use it for downloaded filenames.
- [ ] Expand classifications and visible format guidance without adding a restrictive browser `accept` filter.
- [ ] Allow engineering scripts and firmware artifacts as private download/text assets, but continue rejecting direct OS executables/installers.
- [ ] Restrict inline image preview to safe raster extensions and render source/configuration formats only as escaped text.
- [ ] Enforce per-file, count, and aggregate-batch limits with clear Traditional Chinese errors.
- [ ] Rerun all Test_Plan tests.

### Task 5: Verify and deliver safely to main

**Files:**
- Modify only files required by verified defects.

- [ ] Run all Test_Plan, permission, and permission-persistence tests.
- [ ] Run focused ESLint, TypeScript/build, `git diff --check`, and replacement-character scans.
- [ ] Exercise a real local browser flow for inherited access plus uploads using Chinese PDF, empty-MIME firmware, CAD/PCB, and duplicate filenames.
- [ ] Request an independent code review and address all important findings.
- [ ] Fetch `origin/main`, compare both histories, and integrate any concurrent remote commits without overwriting them.
- [ ] Commit the reviewed changes and push `HEAD:main` without force.
- [ ] Verify GitHub `main` equals the pushed commit and confirm the production deployment completes.
