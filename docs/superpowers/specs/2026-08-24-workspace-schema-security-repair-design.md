# Workspace Schema and Security Repair Design

## Goal

Repair the hosted `workspace` schema without changing existing account names,
password hashes, machine rows, project rows, test progress, or issue history.
The repair must restore the three missing feature tables and prevent the public
publishable key from reading or mutating sensitive account and API-key data.

## Confirmed root causes

1. `20260822120000_archive_workspace_schema.sql` moves a table only when the
   table already exists in `public`. The hosted project did not contain
   `performance_reviews`, `test_project_system_fields`, or
   `test_system_field_values` when that migration ran, so the archive step
   skipped them.
2. The same archive migration grants `SELECT, INSERT, UPDATE, DELETE` on every
   `workspace` table to `anon`. That blanket grant overrides earlier table
   hardening and exposes `system_users.password_hash` and `api_keys.api_key`.
3. Existing unresolved issues projected as `Blocked` while persisted progress
   remains `Done` are intentional. The current completion trigger blocks new
   invalid completion writes, so this repair must not rewrite those rows.

## Approaches considered

### Recommended: authenticated RLS plus column-level account reads

Keep the current Supabase Auth bridge and Edge Function login. Remove all
anonymous access from `system_users` and `api_keys`, expose only non-secret
`system_users` columns to authenticated accounts, and use permission-aware RLS
for API-key management. Create the missing tables directly in `workspace` with
authenticated policies and idempotent backfills.

This preserves current accounts and application behavior while closing both
anonymous read and anonymous write paths.

### Rejected: revoke only sensitive column reads

This would hide `password_hash` and `api_key` but still leave anonymous callers
able to insert, update, or delete the tables. It does not repair the underlying
authorization failure.

### Deferred: move every sensitive operation to new Edge Functions

This is the strongest long-term boundary, but it is larger than the immediate
repair. The existing authenticated client and account-management Edge Function
already provide enough identity to enforce least privilege at PostgreSQL RLS.

## Schema repair

- Add `performance_view` and `performance_edit` enum values idempotently.
- Create `workspace.performance_reviews` with its status and score constraints
  plus indexes on cycle, status, and employee.
- Create `workspace.test_project_system_fields` and
  `workspace.test_system_field_values` with primary keys, foreign keys, checks,
  and lookup indexes.
- Seed the four reserved metadata fields for every existing project and copy
  values from the existing machine columns using `ON CONFLICT DO NOTHING`.
- Restore future-project seeding, reserved-definition protection,
  `save_test_system_metadata`, and field reordering against the `workspace`
  schema.
- Do not insert default performance reviews and do not modify any existing
  machine, progress, issue, or account row.

## Authorization repair

- Introduce a stable security-definer helper that maps the authenticated Supabase
  identity to `workspace.system_users` and checks the existing workspace/page
  permission model.
- Remove all existing policies on `workspace.system_users` and
  `workspace.api_keys` before installing explicit authenticated policies.
- `anon` receives no table privileges on either sensitive table.
- `authenticated` may select only non-secret columns from `system_users`; no
  authenticated or anonymous caller can select `password_hash` directly.
- Authenticated users with API-management view/edit access can read API keys;
  only edit-capable users can insert, update, or delete them.
- The service role retains full access for `account-login`,
  `account-admin-sync`, and hosted API validation.

## Safety and rollback

Before remote execution, record exact row counts for all current non-empty
tables and safe aggregate profiles for machines, progress, issues, and accounts.
The migration is transactional and idempotent. A failed statement rolls back the
entire repair. No password value is selected, logged, copied, or regenerated.

If application verification fails after deployment, restore the previous table
grants and policies in a separate rollback transaction; do not drop the newly
created tables because they are additive and may already contain user data.

## Verification

- Static regression tests prove the repair migration creates all three tables,
  does not grant sensitive tables to `anon`, limits account reads to safe
  columns, and uses conflict-safe metadata backfills.
- TypeScript, the full Node test suite, PCB tests, and production build run
  locally before commit.
- After hosted execution, anonymous REST requests for `password_hash` and
  `api_key` must return authorization errors; safe authenticated UI paths must
  still load.
- Hosted REST must report all three repaired tables and unchanged counts for
  the existing machine/progress/issue/account tables.
- Desktop and 390×844 mobile views are inspected visually before completion is
  reported.

