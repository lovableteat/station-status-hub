# Remaining security proposals and applied baseline

The owner is using the live system. **Remaining pending SQL proposals below are not applied. Repository reconciliation alone does not authorize their execution, frontend deployment, bucket changes, session resets, credential changes or history deletion.** The earlier session/draft frontend was released at `96a6f05`; later compatible-client deployment and live-tab readiness are separate release facts, not inferred from SQL preparation.

A separately authorized narrow cutover is complete: migration `20261112001122_restrict_internal_stats_cleanup_execution` closes browser EXECUTE on four internal RPCs, and daily-stats v13 has the service-credential gate. See the [applied baseline and exact history synchronization](../security/applied-internal-rpc-cutover-20261112.md). A later narrow migration, `20261112013540_restrict_anonymous_delete_test_system_execution`, also removed PUBLIC/anon EXECUTE from both machine-delete aliases while retaining authenticated/service access and their bodies; see [anonymous-delete containment](../security/applied-delete-rpc-cutover-20261112.md). Signed-in station-edit authorization remains pending. A third narrow migration, `20261112022029_restrict_anonymous_login_audit_access`, also closed anon table access to login_audit without changing retained callers or login functions; see [the applied login-audit baseline](../security/applied-login-audit-cutover-20261112.md). The additive protected profile/legacy PCB APIs were subsequently applied as `20261112064452_add_protected_profile_and_legacy_pcb_read_apis`; see [the exact applied record](../security/applied-legacy-pcb-read-apis-20261112.md). That adds two guarded read APIs without changing stored snapshots or raw-column grants. These cutovers do not close the remaining table, browser-RPC, attachment or historical exposure.

All pending SQL proposals are deliberately outside `supabase/migrations` so ordinary migration deployment cannot apply them accidentally. Do not move them into that directory until the release prerequisites and concrete authorization below are satisfied. The four synchronized applied migration files are exact copies of already-applied server ledger entries, not new pending cutovers. Do not rerun them or use a bulk push to reconcile history.

## Scope and data invariants

1. **01-close-anonymous-access.sql**
   - Removes anonymous and inherited PUBLIC table, sequence, column and RPC privileges in both exposed application schemas.
   - Treats login_audit anonymous table/column denial as an applied precondition, excluding it from repeated anonymous revokes and rejecting effective PUBLIC/inherited/column reopening before commit. Retains both login definitions and non-browser grants. Its separate authenticated audit write restrictions still apply; authenticated SELECT/MAINTAIN retain their original ACL entries and grant options because MAINTAIN is outside the reviewed revoke scope.
   - Keeps credential-verifying login, pending registration and the constant-only health-check RPC publicly callable.
   - Preserves existing signed-in row grants and policy predicates, but requires an active application account mapped to the real Auth identity. Auth sign-in by itself is not application authorization.
   - Prevents browser TRUNCATE, legacy credential-table reads, forged login audit writes, and non-manager role editing.
   - Does not change any password, account, operational row, history row, object path or file.
   - Stops on missing identity helpers, disabled workspace RLS, or an authenticated RPC relying only on PUBLIC EXECUTE. Removes the reviewed postgres schema-specific anon defaults for future tables/sequences/functions; global PUBLIC function defaults are a separate boundary described in the promotion guide.
2. **pcb-rpc-cutover-PENDING.sql, followed by 02-bind-station-delete-identities-after-pcb.sql**
   - The narrow PCB candidate guards all twelve existing entry points with `p_user_id = workspace.current_system_user_id()`, rejects null/mismatched actors with SQLSTATE `42501`, and revokes only PUBLIC/anon EXECUTE. It preserves all existing view/edit, private-template, shared-project/library, model, revision and lock semantics. No grants are added.
   - **Only supported new promotion sequence:** already-applied additive APIs → compatible frontend and recovery gates → narrow PCB candidate → separately gated raw-column enforcement → stage 01 → station-only stage 02 → stage 03. The candidate's exact original ACL/hash preflight makes stage 01 first invalid. See [PCB sequence and recovery](pcb-rpc-promotion.md).
   - The station-only successor replaces just the two machine-delete bodies with their reviewed station-edit guard. It checks all twelve hardened PCB definitions, owners and complete ACL sets before and after, and never redefines or grants access to any PCB function. Applied internal/delete ACL checks remain intact.
   - **02-bind-rpc-identities.sql is retained for historical tests, not promotion.** Its four older PCB replacements conflict with the narrow candidate. Its sequence preflight fails before replacement when any PCB function depends on the verified-system-account mapping. Do not bypass it or promote both stage 02 variants.
   - Neither proposal calls its data-changing RPCs. Five existing legacy snapshots in `system_users.permissions` remain unchanged. The protected-read APIs are installed, but the separate raw-column enforcement remains pending; the additive stage alone does not close that residual exposure.
3. **03-private-attachments.sql**
   - Switches only issue-attachments and task-attachments to private and adds scoped restrictive guards around legacy policies.
   - Keeps cross-account collaboration within the maintenance workspace. Viewers can read, editors can upload/replace/delete, other accounts cannot.
   - Restrictive policies protect the two buckets even if another permissive policy is too broad. Other buckets retain their policy behavior.
   - Does not delete, move, rename or rewrite object contents, object paths, rich text, attachment rows or tools URLs.
   - Preserves legacy policies even when they use generic names, because those policies may also serve unrelated buckets. Requires Storage RLS and both target buckets to exist before any change.
4. **daily-stats Edge code: v13 already deployed separately**
   - Requires POST and the exact existing server service credential before constructing a privileged database client.
   - Does not trust an unverified decoded role claim. An anon JWT or regular user JWT is insufficient.
   - Uses the current credential; no credential is generated, rotated or disclosed.

Once separately released and verified, the remaining proposals address the specific anonymous paths and identity-spoofing defects. It is not a claim that every legacy signed-in table policy has complete per-page RBAC. Existing signed-in cooperation is deliberately preserved. Any further policy narrowing must first be reconciled against the live UI permissions and tested separately.

## Verified read-only facts

- All 116 application tables had RLS enabled, but legacy permissive policies and anonymous ACLs still exposed many of them.
- All 23 active application accounts were linked to Auth identities.
- Existing account-login establishes a real Auth session. UserContext still contains a separate legacy mode that has no such session.
- The active daily-production-stats cron job is owned by postgres, runs at 23:00 UTC, and directly executes `workspace.calculate_daily_production_stats()`. It does not need the public Edge endpoint.
- The two attachment buckets are currently public. Historical issue rich text and tools metadata contain public URLs; switching the bucket before the compatible frontend is deployed will break those assets.

## Release prerequisites: all are mandatory

1. Reconfirm the exact remaining scope and safe release window against current authorization and active work. The completed internal-RPC/Edge, anonymous-delete and login-audit cutovers do not authorize executing these broader proposals or merging/deploying the frontend.
2. Confirm a recent hosted database backup and its restore procedure. Verify a restore to an isolated destination before claiming recoverability. The current MCP tool set did not expose hosted backup/PITR status, so a successful full backup/restore has **not** been established.
3. Confirm Storage object backups separately. A database backup preserves Storage metadata, not necessarily object bytes. Do not mistake the metadata snapshot for a file backup.
4. Capture fresh schema/policies/ACL/column grants, function definitions, bucket settings and Edge source/version. Keep these private and checksum them. Compare against the reviewed versions and investigate drift.
5. Verify the exact deployed frontend uses real Auth sessions (`realtime v2` path), including already-open browser sessions. A linked account count alone does not prove session readiness.
6. Ship and test the signed-URL frontend compatibility separately before private-bucket cutover. Test existing stored public URLs, old rich text images, previews, original downloads, tools attachments, upload/replace/delete and concurrent editors without rewriting stored values.
7. Run the PostgreSQL tests, Edge tests, repository checks and the existing permission-boundary CI on the final integrated commit. Focused source-branch checks are recorded below; the combined local results and outstanding hosted/browser/CI gates are in [the integration report](../security/integrated-repair-20261112.md).
8. Ensure changes cannot be unexpectedly pushed by another deploy job during the cutover.

## Staging and verification

- Apply each proposal in a short transaction. A 1-second lock timeout and 20-second statement timeout (5 seconds for the narrow PCB candidate) are per lock acquisition/statement, not a total transaction deadline. Previously acquired locks remain until transaction termination. On any error, issue ROLLBACK or close the failed connection; never leave an aborted transaction open. These are safeguards, not a promise of zero downtime.
- Recheck anonymous REST/Storage access, public and workspace RPC aliases, ordinary signed-in viewing/editing and existing user sessions after each stage. Do not use live delete/reset APIs as probes.
- Do not run notification cleanup, recompute statistics, replace passwords or purge any operational/audit/history data as part of this patch.
- Compare row counts and content checksums in an isolated restore. During a live release, legitimate concurrent user writes can change counts, so do not overwrite current data to force a snapshot match.
- Re-run security advisors. Distinguish intentionally public login/registration from unsafe anonymous definer functions; raw warning counts are not a pass/fail test.
- Validate Storage/CDN behavior separately after the private-bucket switch. Existing browser caches and previously downloaded copies are not recalled by an RLS change. Supabase documents a separate CDN cache purge API (Pro and above), but it has not been executed or authorized here. Do not delete stored objects to invalidate caches. See [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) and [cache purge](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache).

## Recovery

Metadata-only snapshots of policies/buckets, functions, ACLs/column grants/default ACLs and the previous daily-stats v12 source were saved privately with SHA-256 hashes. The narrow cutover also retained its exact preimage, applied SQL, postflight metadata and byte-matched v13 source readback. They are configuration recovery material, **not a complete database or object backup**.

The private original-configuration rollback predates all three narrow cutovers and would reopen their boundaries. Its old entry point is now retired with an unconditional failure before mutation; original bytes remain historical evidence. It is not a current executable recovery plan. Future recovery must preserve the applied internal-RPC, anonymous-delete, login-audit and protected-read API baselines, plus the twelve verified-actor PCB guards and anonymous denial if the pending candidate is later applied. `pcb-rpc-rollback-RETIRED.sql` is an unconditional failure, not an executable restoration plan. Never automatically restore the old anonymous grants or bucket settings. Prefer a fresh targeted compatibility correction. A failed stage transaction must roll back to the current applied baseline without partially applying that stage.

Never restore an old database over current user work as a shortcut. Restore into an isolated database first, compare, and recover only specifically approved missing data if any. No historical-data deletion is authorized by this security proposal.

## Focused tests

Local synthetic execution passed on PostgreSQL 17.5 (PGlite 0.3.14) and PostgreSQL 18.3 (PGlite 0.5.8, the CI dependency):

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/remainingSecurity.postgres.mjs
node --test tests/dailyStatsAuthorization.test.ts
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/securityProposalCutover.postgres.mjs
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/pcbRpcSecurity.postgres.mjs
node --test tests/pcbRpcSecurityProposal.test.mjs
```

The pre-existing broad-proposal PGlite tests remain regression evidence for the historical three-stage route, not instructions to promote the old stage 02. They start with the already-applied internal-RPC, anonymous-delete and login-audit ACL baselines and use only synthetic accounts, rows and objects. Each later stage preserves the four internal RPC ACLs and definitions exactly; reopening their PUBLIC/anon/authenticated EXECUTE, missing maintenance access, or a missing signature makes stages 01/02 stop without silently repairing the baseline. Both delete aliases retain their applied ACLs and owner/definer metadata, while stage 02 intentionally adds their station-edit body guards. Their checks reject anonymous access or loss of authenticated/service/owner EXECUTE or schema USAGE, including drift before replacement metadata capture. That historical fixture executes its three original SQL proposals and verifies every synthetic business row and Storage object is byte-for-byte unchanged. It covers anonymous access across 116 tables and column grants, inactive/unlinked accounts, browser TRUNCATE, audit/role restrictions, both delete RPC aliases, PCB identity spoofing, service-only maintenance, and attachment read/write separation including a deliberately broad competing policy.

The PCB suite additionally executes the exact repository candidate and the complete new candidate → 01 → station-only 02 → 03 sequence. It loads metadata-only portable fixtures, not real account or board content, verifies all twelve guards and unchanged function ACLs, preserves five different synthetic legacy permission snapshots and all their complete account rows, tests valid shared/model/lock operations, and rejects wrong ordering, metadata drift, duplicate candidate replay and unsafe rollback. Late failures roll back configuration changes.

The Edge tests verify exact service-credential matching and that unauthorized requests never construct a privileged client or invoke the statistics RPC.

Limits: this is PostgreSQL engine and handler logic testing. It is not a hosted Supabase Storage/CDN test, a live Deno positive-path invocation, a real-user browser regression, a full database restore rehearsal or proof that all production exposure is fixed.

See [migration promotion and safe cutover](migration-promotion.md) before moving any proposal into an automatic migration directory.

The later legacy suite executes the **exact applied additive transport + ledger →
narrow PCB → isolated raw enforcement → 01 → station-only 02 → 03** sequence,
revalidating the four immutable ledger statements and both new APIs after each
stage. It passes 120/120 on PostgreSQL 17.5 and 18.3, with all original 113 cases
retained. Combined source and four applied-ledger contracts pass 27/27. The
published raw-enforcement file still refuses unchanged; its isolated gate removal
is not release approval. See [the legacy runbook](legacy-pcb/README.md).
