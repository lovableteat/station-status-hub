# Applied anonymous machine-delete containment

## Confirmed scope and limits

A separately authorized production cutover recorded migration `20261112013540_restrict_anonymous_delete_test_system_execution` on 2026-11-12 UTC. Independent read-only postflight at 01:35:58 UTC confirmed:

- PUBLIC and anon have no EXECUTE on `public.delete_test_system(uuid)` or `workspace.delete_test_system(uuid)`.
- authenticated, service_role and postgres retain EXECUTE. Both ACLs are `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
- Owner remains postgres and SECURITY DEFINER remains true. Definition MD5 remains `7f04cca4183be291d0917083a0369337` for public and `923d91902c8261ee54e85278006e03c1` for workspace.
- The cutover issued no delete RPC call, business-row write, object update, session reset, credential change, frontend deployment or forced reload.

This is **anonymous containment only**. The unchanged production function bodies still lack the reviewed per-user station-edit authorization. Preserved authenticated EXECUTE is a compatibility boundary, not proof that signed-in callers are correctly authorized. Stage 02's body guards remain pending and must not be removed from the proposal.

Fresh preflight at 01:35:28 UTC matched exact definitions, owner and ACLs and found no active delete query. The transaction repeats metadata and in-flight-delete checks, uses a 1-second lock timeout and a 10-second statement timeout, and asserts the resulting privilege matrix. These checks are safeguards, not a zero-interruption guarantee. No production destructive positive or negative test was used. The immediate post-cutover log window had no fresh machine/progress request, so it is not a live user-workflow regression result.

## Exact history reconciliation

The [repository SQL](../../supabase/migrations/20261112013540_restrict_anonymous_delete_test_system_execution.sql) was copied from the existing server `supabase_migrations.schema_migrations` record. An independent read matched the retained cutover SQL byte-for-byte:

- Version: `20261112013540`
- Name: `restrict_anonymous_delete_test_system_execution`
- UTF-8 bytes: `3036`
- SHA-256: `adacc5680f243956c685c29b6f7c99f2932947431141d09ab15080b4371443a8`

The original `PREPARED ONLY` header is preserved as immutable historical source, not current deployment status. A path-specific LF attribute preserves the exact statement on Windows. Do not edit the applied SQL, invent a new version, re-execute its pre-cutover ACL guard, or change the server ledger to bypass a discrepancy. Compare version, name and statement with the target ledger before a later release; the matching applied entry must be skipped. A missing or different entry requires investigation, not a bulk push or automatic migration repair.

Repository synchronization performs no production mutation. It does not certify the full historical migration chain, a fresh database reset, or complete database/PITR and Storage-object recoverability.

## Pending-stage compatibility

Stages 01/02 first verify both applied delete aliases still deny PUBLIC/anon while retaining the existing authenticated/service/owner execution and schema access. Missing signatures or drift fail closed instead of silently repairing grants. Stage 01 excludes both exact uuid signatures from its generic revoke sweep.

Stage 02 still replaces both function bodies with the reviewed station-edit checks. It no longer repeats the already-applied anonymous revoke for these aliases. The existing ACLs must survive CREATE OR REPLACE, including when creator defaults would grant PUBLIC/anon to a newly created function. A separate semantic postflight repeats the known anonymous-denied and retained-caller/owner/schema checks before commit, so drift between early preflight and metadata capture cannot become an accepted baseline. It rejects and rolls back rather than repairing grants. The other PCB RPC replacements still receive their explicit anonymous revocation. Stage 03 does not change these RPCs.

Isolated tests cover grant/owner/SECURITY DEFINER preservation through all three stages, unchanged definitions in stages 01/03, intentional authorization changes in stage 02, drift rejection, atomic rollback, and repeat stage-02 execution. The exact copied SQL was additionally replayed only against captured function definitions with synthetic local rows: anonymous calls fail, authenticated/service-role synthetic deletion remains functional, late failure rolls back, and cutover/manual metadata recovery preserve all synthetic baseline rows, object records and definitions. These are not production destructive tests or a full restore rehearsal.

The previous [four internal RPC / daily-stats v13 cutover](applied-internal-rpc-cutover-20261112.md) remains unchanged. Broader table/RPC proposals, frontend, private buckets and history/cache cleanup remain pending. Preserve active operations and drafts; do not clear browser storage, overwrite current records, delete original objects or automatically reopen anonymous access as recovery.

## Isolated verification of repository reconciliation

- Combined proposal/cutover SQL suites: 26/26 passed, including pre-capture metadata drift and rollback.
- Unit tests: 2,312 passed, 8 existing skips, 0 failed (2,320 total). Typecheck passed; lint has 0 errors and 72 existing warnings.
- The exact copied migration also passed a private synthetic replay against captured function definitions. This checks code and ACL behavior, not a complete historical restore or live destructive workflow.
- Final commit-specific remote CI results are recorded in the draft PR; no production SQL is run by that CI.
