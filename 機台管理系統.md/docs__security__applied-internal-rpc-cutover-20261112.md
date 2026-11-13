> 集中副本；原始路徑：`docs/security/applied-internal-rpc-cutover-20261112.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Applied internal RPC and daily-stats baseline

## Completed narrow scope

On 2026-11-12 UTC, a separately authorized production cutover applied migration `20261112001122_restrict_internal_stats_cleanup_execution`. It revoked EXECUTE from PUBLIC, anon and authenticated on exactly these zero-argument functions:

- `public.calculate_daily_production_stats()`
- `workspace.calculate_daily_production_stats()`
- `public.cleanup_old_notifications()`
- `workspace.cleanup_old_notifications()`

Existing postgres ownership/EXECUTE and service_role EXECUTE were retained. Function bodies, cron, operational rows, app policies, buckets, objects, credentials and sessions were not changed. Postflight at 00:11:40.185379 UTC confirmed the four browser-denied/service-allowed ACLs and unchanged definition hashes, owners and SECURITY DEFINER settings. The SQL uses a transaction, a 2-second lock timeout and a 10-second statement timeout; these safeguards are not a guarantee of zero interruption.

The daily-stats Edge Function became ACTIVE v13 at 00:12:10.013 UTC, using the two exact source files from commit `21d1e5a211306c8f93999e47d0273151841889a8`. Readback was byte-identical. Its existing verify_jwt=false setting is unchanged; the handler itself requires POST and the exact existing service credential before creating a database client. The original success message, `Daily production stats calculated successfully`, is preserved. POST-only deliberately changes the older unrestricted method contract, so this is not a claim of complete legacy GET compatibility.

Only unauthenticated OPTIONS was live-smoke-tested (200 `ok`). No production GET/POST, RPC call, manual cron run, cleanup, recomputation or business write was used as a probe. A final read-only check at 00:13:14.620447 UTC found the daily cron active, owned by postgres, with its unchanged `0 23 * * *` schedule and `SELECT workspace.calculate_daily_production_stats();` command. Its next natural run is 2026-11-12 23:00 UTC (2026-11-13 07:00 Asia/Taipei); that future outcome is not established by this report.

## Exact migration-history synchronization

The repository file [20261112001122_restrict_internal_stats_cleanup_execution.sql](https://github.com/lovableteat/station-status-hub/blob/2c5dd8829effc42acd60f64089701abb57e481c2/supabase/migrations/20261112001122_restrict_internal_stats_cleanup_execution.sql) was copied from the existing server `supabase_migrations.schema_migrations` record, not reconstructed or given a new timestamp. Its single statement matches the retained cutover evidence byte-for-byte:

- Version: `20261112001122`
- Name: `restrict_internal_stats_cleanup_execution`
- UTF-8 bytes: `3793`
- SHA-256: `2921e3d36f18df8a970214dc519b9b7a4fbf8edc8eca4a492ab4096dd639cbcf`

The SQL's original `PREPARED ONLY` comment is preserved as immutable historical source text. It describes preparation before execution, not its current applied status. Do not edit that comment, source hashes or guard merely to make a re-execution succeed. A path-specific `text eol=lf` attribute preserves the bytes on Windows; the `core.autocrlf=true` checkout filter was verified against the same SHA-256.

Before a later migration deployment, compare this exact version, name and statement with the target ledger. A matching existing entry is already applied and must be skipped. The SQL intentionally expects the original pre-cutover ACLs and will reject a blind second execution. If the ledger is absent or differs, stop and investigate the target and its metadata instead of inserting a new timestamp, changing the applied file, running a bulk push, or using migration repair to bypass the discrepancy. No ledger mutation or migration command was used during synchronization. This narrow reconciliation does not certify the entire historical migration chain or prove a fresh database reset works.

## Interaction with pending proposals

The three scripts in `docs/security-proposals` remain outside automatic migrations and are not applied. Stages 01/02 now read and validate the four-function baseline before any mutation: no PUBLIC/anon/authenticated EXECUTE, and working service_role/postgres EXECUTE plus schema USAGE. A missing signature or access drift aborts rather than silently granting/revoking. Stage 01 excludes these exact signatures from its generic revoke sweep; stage 02 no longer repeats their revoke/grant. All three stages preserve the four function definitions and ACLs in isolated tests.

The frontend, broader table/RPC restrictions, private attachment buckets and history/cache cleanup remain pending. Do not merge/deploy the frontend while active old tabs can lose unsaved work. Do not retain an entire old dist containing the business BOM seed. Do not clear client storage, overwrite live rows, delete original objects or reopen known exposure as a workaround.

## Evidence limits and recovery

Private configuration preimages, SQL and readbacks are checksum-verified recovery material, not a complete database/PITR or Storage-object backup. A full isolated restore remains unverified. Existing cron permissions were retained, but no claim is made here about its next execution or unknown endpoint clients. A narrowly scoped correction is preferable to automatic rollback into the former anonymous access.

Tests pin the migration file's exact bytes and identity, replay the unchanged narrow SQL only against captured function definitions with synthetic local rows, and exercise later proposal preservation and rollback on drift. No production function invocation or production write is required for these checks. Exact-head PR CI must still pass after synchronization; it does not deploy this frontend or execute hosted migrations.


## Later separately applied containment

Migration `20261112013540` subsequently removed anonymous EXECUTE from the two machine-delete aliases without changing their bodies or existing authenticated/service access. See [the separate applied-delete record](./docs__security__applied-delete-rpc-cutover-20261112.md). That synchronization does not reapply this four-RPC migration or redeploy daily-stats v13.
