> 集中副本；原始路徑：`docs/security/sanitized-profile-consumers.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Sanitized account profile consumers

This isolated frontend uses `workspace.list_system_user_profiles()` for account permissions. The RPC has no actor parameter. The database must derive the authenticated actor, preserve the existing roster audience and remove only the top-level legacy PCB snapshot from each response. The frontend does not modify stored permission documents.

## Read contract

`src/lib/systemUserProfiles.ts` uses the explicit workspace schema. A current/target account read applies `eq("id", userId).maybeSingle()`; the roster applies descending `created_at` ordering. The response contains exactly the established 16 columns, with existing strings/nullability and unchanged non-PCB JSON values. Missing fields, extra fields, wrong types, duplicate roster IDs, wrong selected identity or a returned legacy PCB key fail closed. This validation detects response drift; it is not database authorization.

Missing RPC, expired session, permission denial and network errors never fall back to a raw table read. No credentials, sessions or Auth settings are changed. The new RPC must be available before deploying these consumers.

## Preserved behavior

- `usePermissions` retains request/account fencing, authoritative stored-page permissions, legacy page-row precedence where applicable, all existing refresh signals and fail-closed authorization. Background revalidation does not enter initial loading state. An error does not restore cached grants.
- `AdminPanel` retains roster ordering, fields, filtering and controlled mutations. A same-account refresh failure keeps the last successful list and shows the existing failure notice; those rows do not authorize mutations. Account changes clear the roster and invalidate pending results. Focus, online, visibility, 30-second checks, permission-update events and Realtime reconnection trigger a fresh RPC read.
- `UserPermissionsDialog` retains page/workspace precedence and the existing key-preserving permission setter. Configuration stays disabled until the requested account is successfully read for the current actor. Target/actor changes and closure invalidate pending loads. A late save response cannot close or reset a replacement target's form. This does not undo an already accepted save for the previous target.

The dialog sends only the existing setter arguments. It never writes the sanitized JSON back as a complete permission document, which would remove retained legacy data.

## Verification and unresolved cutover gates

Reader tests cover the exact shape, null/scalar/array/object JSON, missing/unsafe fields, denial/no-fallback, identity checks and malformed roster rejection. Actual provider/dialog tests cover deferred responses, actor/target switches, stale save receipts, refresh, page-permission precedence and disabled controls. React DOM testing verifies that the provider itself preserves a mounted memory-only draft while fresh reads are pending or rejected, while access-dependent actions become unavailable.

That last assertion does not cover every surrounding module gate. Existing gates can unmount an editor after access is revoked, and already-open old pages still use their old raw permission queries. Deploying this bundle cannot retrofit those pages. Preserve active drafts and verify an explicit compatible transition before revoking the raw column.

The roster's additional refresh paths improve recovery from missed notifications; they do not prove Realtime's OLD/NEW payload filtering is safe. Publication, replica identity, queued events and hosted service behavior require separate verification. Do not remove the production raw-column grant or claim the legacy exposure closed merely because these isolated frontend tests pass.
