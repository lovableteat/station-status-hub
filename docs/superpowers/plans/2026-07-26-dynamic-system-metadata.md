# Dynamic System Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow projects to define reusable software-version and statistics fields with typed per-system values while retaining all legacy data.

**Architecture:** Add unified project field-definition and per-system value tables, backfill legacy and recently added software tables, then move `SystemEditDialog` to a focused metadata editor component with compatibility helpers.

**Tech Stack:** PostgreSQL/Supabase, React, TypeScript, Radix UI, Node test runner, Vite.

## Global Constraints

- Preserve the partial software-field work already on `main`; migrate its data instead of deleting it.
- Keep legacy columns and dual-write reserved values.
- Support `text`, `number`, `boolean`, and `select`.
- Grant the app's actual `anon` role in addition to `authenticated` and `service_role`.
- Push item 4 independently after item 3 is deployed.

---

### Task 1: Define and test the database upgrade

**Files:**
- Create: `supabase/migrations/20260726120000_dynamic_system_metadata.sql`
- Create: `tests/dynamicSystemMetadataMigration.test.mjs`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces tables `test_project_system_fields` and `test_system_field_values`.
- Produces categories `software|statistics` and types `text|number|boolean|select`.

- [ ] **Step 1: Write the failing migration contract**

Check for table creation, check constraints, unique indexes, `anon` grants, RLS, four reserved keys, legacy backfill and partial-table migration.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/dynamicSystemMetadataMigration.test.mjs`

Expected: fails because the migration does not exist.

- [ ] **Step 3: Write the migration**

Create the definition table with:

```sql
category text not null check (category in ('software', 'statistics')),
field_key text not null,
field_type text not null check (field_type in ('text', 'number', 'boolean', 'select')),
options jsonb not null default '[]'::jsonb,
is_required boolean not null default false,
is_system boolean not null default false
```

Create the value table with `value jsonb not null default 'null'::jsonb` and primary key `(field_id, system_id)`. Add project/order indexes, RLS policies, realtime publication and grants to `anon`, `authenticated`, `service_role`.

- [ ] **Step 4: Seed and backfill**

Insert four reserved definitions per project using stable keys `bom_90`, `ubuntu_version`, `cuda_version`, `include_in_dashboard`. Backfill values from `test_systems`. Copy definitions and values from `test_project_software_fields` and `test_system_software_values` using deterministic field keys.

- [ ] **Step 5: Update generated TypeScript table types**

Add exact Row/Insert/Update/Relationships definitions for both tables.

- [ ] **Step 6: Run migration tests**

Run: `node --test tests/dynamicSystemMetadataMigration.test.mjs`

Expected: pass.

### Task 2: Add metadata conversion helpers

**Files:**
- Create: `src/components/test-tracker/systemMetadata.ts`
- Create: `src/components/test-tracker/systemMetadata.test.mjs`

**Interfaces:**
- Produces `parseSystemFieldValue`, `serializeSystemFieldValue`, `toLegacySystemPatch`, `validateSystemFieldDefinition`.

- [ ] **Step 1: Write tests for every field type and reserved mapping**

Cover blank text, finite numbers, booleans, valid/invalid select options, and inverse mapping from `include_in_dashboard` to `exclude_from_dashboard`.

- [ ] **Step 2: Run and verify failure**

Run: `node --test src/components/test-tracker/systemMetadata.test.mjs`

- [ ] **Step 3: Implement helpers and rerun**

Expected: all helper tests pass without Supabase access.

### Task 3: Build the project field editor

**Files:**
- Create: `src/components/test-tracker/SystemMetadataFieldsEditor.tsx`
- Modify: `src/components/test-tracker/SystemEditDialog.tsx`
- Create: `tests/systemMetadataEditor.test.mjs`

**Interfaces:**
- Consumes field definitions and values.
- Produces callbacks `onCreateField`, `onUpdateField`, `onDeleteField`, `onReorderFields`, `onValueChange`.

- [ ] **Step 1: Write the UI contract**

Require category and type controls, add/edit/delete/reorder actions, select option editing, system-field delete protection and per-field error output.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/systemMetadataEditor.test.mjs`

- [ ] **Step 3: Implement the focused editor**

Render fields from definitions instead of fixed markup. Keep reserved fields visually identified. Confirm destructive custom-field deletion.

- [ ] **Step 4: Integrate loading and saving**

Load definitions and values in parallel with system data. Upsert values on save. Dual-write the four reserved legacy columns using `toLegacySystemPatch`.

- [ ] **Step 5: Preserve failed input**

On query or write failure, keep the dialog open, retain draft values and show the Supabase message through the existing toast.

- [ ] **Step 6: Run focused tests**

Run: `node --test src/components/test-tracker/systemMetadata.test.mjs tests/systemMetadataEditor.test.mjs tests/dynamicSystemMetadataMigration.test.mjs`

Expected: pass.

### Task 4: Compatibility, browser verification and publish item 4

**Files:**
- Modify as needed: `src/components/test-tracker/cloneSystemSeries.ts`
- Modify as needed: `src/components/test-tracker/TestItemStatusReport.tsx`
- Modify as needed: `src/components/test-tracker/MobileSystemCard.tsx`

- [ ] **Step 1: Run the complete relevant suite**

Run: `node --test src/components/test-tracker/*.test.mjs tests/dynamicSystemMetadataMigration.test.mjs tests/systemMetadataEditor.test.mjs`

Run: `npx eslint src/components/test-tracker/SystemEditDialog.tsx src/components/test-tracker/SystemMetadataFieldsEditor.tsx src/components/test-tracker/systemMetadata.ts`

Run: `npm run build`

Expected: all succeed.

- [ ] **Step 2: Browser-check two systems**

Create a text, number, boolean and select field. Confirm a second system immediately shares definitions, values remain independent, reorder persists, custom delete confirms, and reserved fields cannot be deleted.

- [ ] **Step 3: Publish**

Fetch and compare `origin/main`, commit with `feat(test-tracker): add dynamic system metadata`, push `HEAD:main`, and verify GitHub Pages.

