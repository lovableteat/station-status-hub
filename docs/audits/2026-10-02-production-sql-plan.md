# Prepared production permission corrections — not executed

These files are source changes, not evidence of deployed server policy. Main frontend deployment can proceed separately after technical acceptance; it does not install these database functions. No production SQL, account changes, permission grants, backfill or credential setup was performed in this audit.

## Exact files and order

1. `supabase/migrations/20261002160000_enforce_explicit_permission_revocation.sql`
2. `supabase/migrations/20261002170000_align_account_permission_mutation_entrypoints.sql`

Apply in that order through an authorized migration operator after a separate action-time confirmation. Both contain explicit transactions and notify PostgREST to reload schema. Check the runner's transaction/migration-record behavior rather than assuming an ad hoc SQL editor records migration versions.

## First migration

Creates/replaces `workspace.current_user_has_stored_page_permission(text)`; replaces public and workspace `can_view_data_center_projects()`, `can_edit_data_center_projects()`, `can_manage_system_users()`; replaces workspace `can_manage_performance_record(text,text,uuid[])` and `can_read_performance_section_report(uuid,uuid,text,uuid[])`. Public wrappers preserve existing function identities for policies calling those aliases. The internal stored-page helper is not callable by authenticated/anonymous clients; intended predicates remain callable by authenticated/service roles.

Effective narrowing:

- Data-center explicit workspace access is authoritative: none/null/invalid denies, view reads only, edit permits editing. When the workspace key is absent, a durable `pagePermissions` array (including empty) precedes legacy table rows. Active global admins retain the existing exception; inactive accounts are denied.
- Non-admin account administrators need configured user-management edit when that key exists AND effective `admin_edit`. Empty durable detail permissions cannot be resurrected by old table rows. If no durable array exists, legitimate legacy rows retain compatibility. Active global-admin exceptions remain.
- Performance management additionally requires the current manager flag, performance edit, actual direct-manager hierarchy and the existing supervisor group unlock. The flag's revocation prevents previously assigned supervisors from reading/writing subordinate assessments. Director reads of another chief's submitted report also require the current assignment flag, hierarchy and unlock. Employee self access and chief own-report access remain; global website admin has no assessment-data bypass.

No policy is dropped/created and no table/enum/column is altered. Existing performance review/section-report RLS and RPC guards, Data-center CRUD policies, account-administration consumers and Edge account-service authorization that call these predicates acquire the corrected behavior. Actual production policy dependencies and definitions must still be checked for drift before execution.

## Second migration

Replaces workspace/public `set_user_access_permissions(uuid,public.page_permission[],jsonb,text)` and `approve_system_user(uuid)`. Public aliases delegate to guarded workspace functions. Revoke anonymous/default-public execution and retain authenticated/service execution. Permissions RPC retains its existing service-role exception; approval still requires an identified authorized administrator. Null/missing auth no longer passes a SQL three-valued authorization comparison.

Before any permission/status mutation, authenticated callers must satisfy `workspace.can_manage_system_users()`. Merely having user-management edit cannot grant one's own/another account extra permissions when the detailed admin permission is revoked. Invalid/null workspace payloads are rejected. Future successful permission RPC calls atomically synchronize `workspaceAccess`, durable `pagePermissions` and the legacy permission rows, preserving unrelated JSON settings. Future authorized approval retains pending-to-active behavior and actor/time fields.

**Applying either file executes DDL/catalog ACL changes only: no account or business row writes, no data deletion, no backfill.** The second file contains DML inside function bodies; that DML runs only when a later authorized caller invokes the RPC. Existing accounts whose effective settings already deny access may lose erroneously retained access immediately. No grants are added to such accounts automatically.

## Verification and rollback preparation

Before execution, an authorized operator should record exact target project/environment and current migration history; verify required schemas, enum, tables, columns and dependency functions exist; inspect only the named functions' definitions, owners, ACLs, search paths and referencing policies. Capture those exact deployed definitions/ACLs for rollback rather than relying on old repository migrations. Do not expose account secrets or credentials. Compare deployment drift with the local fixtures before proceeding. An anonymized count of conflicting explicit/durable/legacy settings can estimate affected accounts without exporting profiles or private reviews.

The isolated regression loads real PostgreSQL functions/roles and proves the old permission-RPC bypass before repair. It has 132 assertions, including public/workspace self/other denials with all profile/status/permission rows unchanged, legal administrator operations, malformed payload atomicity, active/inactive admins, anonymous/missing-auth denial and legacy compatibility. Sixty-one latest performance submission checks additionally exercise actual RLS/submission guards. These are local fixtures, not production acceptance.

After separately approved execution, read migration/function/ACL metadata and predicate results in authorized representative sessions: employee, assigned chief/director, revoked flag, unrelated supervisor, explicit Data-center none/view/edit, account detail revoked, legitimate account admin, active/inactive global admin. Use disposable isolated staging accounts for mutation/RPC denial and successful-operation checks; do not self-grant or edit production users as an incidental test. Confirm ordinary self access, drafts, valid admin paths, group locks and existing business-row counts. Confirm schema reload and inspect actual denied error codes. Real authenticated role validation is still outstanding.

Each file's transaction rolls back its DDL on an error before commit. For a committed rollback, stop the rollout and use the preflight-captured exact definitions/ACLs with `CREATE OR REPLACE` in reverse order (second-file entrypoints, then first-file predicates), preserving function OIDs used by policies. Restore owners/ACLs/search paths and reload PostgREST; verify role behavior again. Drop the newly introduced internal helper only after confirming no restored function depends on it. Do not delete business data or blindly remove migration-history records. Definition rollback does not undo legitimate account changes made after deployment; durable settings must be preserved. Restoring old predicates can reopen the demonstrated permission bypass, so a committed rollback requires explicit operator review rather than automatic fallback.

## Available execution tools

The current tool inventory has **no authorized connector or established safe connection for this repository's production Supabase/PostgreSQL database**. Generic Sites database tools are for Sites and do not establish access to this application's database. Local PGlite is an isolated test database. No credentials were searched, read or created. Production application therefore remains blocked on a separately authorized secure operator/connection and action-time approval; do not substitute frontend deployment for server-policy installation.
