# Workspace Schema and Security Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the three missing hosted workspace tables and close anonymous access to account password hashes and stored API keys without changing existing account credentials or operational records.

**Architecture:** One idempotent PostgreSQL migration creates missing objects directly in `workspace`, backfills only additive metadata rows, and replaces blanket sensitive-table access with authenticated RLS. A small frontend query change stops requesting the secret account column. Static migration tests and hosted REST probes provide the regression boundary.

**Tech Stack:** PostgreSQL/Supabase RLS, Supabase Auth, React/TypeScript, Node test runner, GitHub Pages.

## Global Constraints

- Do not change usernames, passwords, password hashes, Auth identities, machine rows, test-progress rows, issue rows, or project rows.
- Do not display or persist `password_hash`, stored `api_key`, service-role keys, database passwords, or access tokens.
- All SQL must be idempotent and transactional.
- Existing unresolved issues continue to project `Blocked` without rewriting persisted progress.
- Completion may be reported only after remote data and visible UI verification.

---

### Task 1: Add migration regression tests

**Files:**
- Create: `tests/workspaceSchemaSecurityRepair.test.mjs`
- Test: `tests/workspaceSchemaSecurityRepair.test.mjs`

**Interfaces:**
- Consumes: migration path `supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql`
- Produces: static guarantees for table creation, grants, policies, and non-destructive backfill

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql",
  import.meta.url,
);
const migration = () => readFile(migrationUrl, "utf8");

test("repair creates all missing tables directly in workspace", async () => {
  const sql = await migration();
  for (const table of ["performance_reviews", "test_project_system_fields", "test_system_field_values"]) {
    assert.match(sql, new RegExp(`create table if not exists workspace\\.${table}`, "i"));
  }
});

test("repair removes anonymous sensitive-table access", async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on table workspace\.system_users from anon/i);
  assert.match(sql, /revoke all on table workspace\.api_keys from anon/i);
  assert.doesNotMatch(sql, /grant[^;]+workspace\.(?:system_users|api_keys)[^;]+to anon/i);
  assert.match(sql, /grant select \([^)]*username[^)]*\) on workspace\.system_users to authenticated/is);
  assert.doesNotMatch(sql, /grant select \([^)]*password_hash/i);
});

test("metadata backfill is additive and conflict safe", async () => {
  const sql = await migration();
  assert.match(sql, /on conflict \(project_id, field_key\) do nothing/i);
  assert.match(sql, /on conflict \(field_id, system_id\) do nothing/i);
  assert.doesNotMatch(sql, /update\s+workspace\.test_progress/i);
  assert.doesNotMatch(sql, /update\s+workspace\.system_users\s+set\s+password_hash/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspaceSchemaSecurityRepair.test.mjs`
Expected: FAIL with `ENOENT` for the not-yet-created migration.

### Task 2: Implement the idempotent repair migration

**Files:**
- Create: `supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql`
- Test: `tests/workspaceSchemaSecurityRepair.test.mjs`

**Interfaces:**
- Consumes: existing `workspace.system_users`, `workspace.api_keys`, projects, machines, permission rows, and Auth JWT identity
- Produces: the three missing tables, metadata RPCs/triggers, `workspace.current_user_can_workspace(text,text)`, and hardened RLS/grants

- [ ] **Step 1: Create tables, constraints, and indexes**

Use `CREATE TABLE IF NOT EXISTS workspace.<table>` with the exact columns from
`20260726120000_dynamic_system_metadata.sql` and
`20260820123000_add_performance_workspace.sql`. Create all FK lookup indexes.

- [ ] **Step 2: Create the permission helper and explicit RLS policies**

```sql
create or replace function workspace.current_user_can_workspace(
  p_workspace text,
  p_action text
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from workspace.system_users as users
    where users.auth_user_id = (select auth.uid())
      and users.status = 'active'
      and (
        users.role in ('admin', 'super_admin')
        or coalesce(users.permissions->'workspaceAccess'->>p_workspace, 'none') = 'edit'
        or (p_action = 'view' and coalesce(users.permissions->'workspaceAccess'->>p_workspace, 'none') = 'view')
        or exists (
          select 1 from workspace.user_page_permissions as permissions
          where permissions.user_id = users.id
            and permissions.permission::text in (
              case p_workspace
                when 'ai-chat' then case when p_action = 'edit' then 'api_management_edit' else 'api_management_view' end
                when 'performance' then case when p_action = 'edit' then 'performance_edit' else 'performance_view' end
                else case when p_action = 'edit' then 'test_tracker_edit' else 'test_tracker_view' end
              end,
              case p_workspace
                when 'ai-chat' then 'api_management_edit'
                when 'performance' then 'performance_edit'
                else 'test_tracker_edit'
              end
            )
        )
      )
  );
$$;
```

Drop existing sensitive-table policies dynamically, revoke all sensitive-table
privileges from `anon` and `authenticated`, then grant only safe account columns
and permission-checked API-key access.

- [ ] **Step 3: Add conflict-safe metadata seed and RPCs**

Copy the final hardened validation behavior from
`20260726123000_harden_system_metadata.sql`, replacing every application table
reference with `workspace.<table>`. Grant execution only to `authenticated` and
`service_role`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/workspaceSchemaSecurityRepair.test.mjs`
Expected: PASS.

### Task 3: Stop the admin client from selecting the secret account column

**Files:**
- Modify: `src/components/admin/AdminPanel.tsx`
- Modify: `tests/workspaceSchemaSecurityRepair.test.mjs`

**Interfaces:**
- Consumes: authenticated column-level `system_users` grant
- Produces: an explicit safe account select list

- [ ] **Step 1: Extend the failing test**

Assert that `AdminPanel.tsx` does not use `.from('system_users').select('*')`
and that the explicit selection includes `id`, `username`, `display_name`,
`role`, `status`, `permissions`, timestamps, and Auth-link status but not
`password_hash`.

- [ ] **Step 2: Run the test and confirm the expected failure**

Run: `node --test tests/workspaceSchemaSecurityRepair.test.mjs`
Expected: FAIL because `AdminPanel.tsx` still selects `*`.

- [ ] **Step 3: Replace the wildcard query**

Use:

```ts
const SYSTEM_USER_SAFE_COLUMNS = [
  "id", "username", "display_name", "role", "status", "permissions",
  "created_at", "updated_at", "approved_at", "approved_by",
  "registration_requested_at", "auth_user_id", "auth_migrated_at",
  "last_seen_at", "avatar_path", "created_by",
].join(",");
```

Pass `SYSTEM_USER_SAFE_COLUMNS` to `.select()` and remove the unused
`password_hash` field from the local interface.

- [ ] **Step 4: Run focused tests and TypeScript**

Run: `node --test tests/workspaceSchemaSecurityRepair.test.mjs`
Expected: PASS.

Run: `node_modules/.bin/tsc.cmd --noEmit --pretty false`
Expected: exit 0.

### Task 4: Verify locally, commit, and push

**Files:**
- Verify all changed files

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: one deployable commit on `main`

- [ ] **Step 1: Run all automated verification**

Run: `node --test tests/*.test.mjs`
Expected: all tests pass.

Run: `npm run test:pcb`
Expected: 197 tests pass.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 2: Confirm the diff contains no credentials or destructive updates**

Run: `git diff --check`
Expected: no output.

Run: `git diff -- supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql`
Expected: no password literal, no API-key value, and no update/delete against existing operational rows.

- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/specs/2026-08-24-workspace-schema-security-repair-design.md \
  docs/superpowers/plans/2026-08-24-workspace-schema-security-repair.md \
  tests/workspaceSchemaSecurityRepair.test.mjs \
  src/components/admin/AdminPanel.tsx \
  supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql
git commit -m "fix: repair workspace schema security"
git push origin main
```

### Task 5: Apply and verify the hosted migration

**Files:**
- Execute: `supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql`

**Interfaces:**
- Consumes: hosted project `rfppeuzuoxtqkpbwehbq`
- Produces: repaired hosted schema and verification evidence

- [ ] **Step 1: Capture pre-migration row counts**

Record exact counts for `test_systems`, `test_progress`, `issues`,
`system_users`, `test_projects`, `material_bom_workspaces`, and
`material_bom_records`. Do not select credential columns.

- [ ] **Step 2: Execute the migration once through an authenticated Supabase admin surface**

Run the complete SQL file as one transaction. Do not run any separate password,
account, machine, issue, project, or progress update.

- [ ] **Step 3: Verify hosted schema and security**

Anonymous REST requests must return authorization errors for
`system_users?select=password_hash` and `api_keys?select=api_key`. All three new
tables must return success through an authenticated session. Existing operational
table counts must exactly match the pre-migration snapshot.

- [ ] **Step 4: Verify visible production behavior**

Open the deployed site, log in through the existing account flow without
changing credentials, inspect the admin list, performance workspace, and L10
system editor on desktop and at 390×844, and confirm no console errors.

