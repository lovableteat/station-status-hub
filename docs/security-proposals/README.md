# Prepared security changes: not deployed

The owner is using the live system. **Do not run these SQL files, deploy the Edge Function, reset sessions, change credentials, or delete any history while the current no-production-change restriction remains in force.**

These SQL proposals are deliberately outside `supabase/migrations` so ordinary migration deployment cannot apply them accidentally. Do not move them into that directory until the release prerequisites and concrete authorization below are satisfied. No production mutation was performed while preparing them.

## Scope and data invariants

1. **01-close-anonymous-access.sql**
   - Removes anonymous and inherited PUBLIC table, sequence, column and RPC privileges in both exposed application schemas.
   - Keeps credential-verifying login, pending registration and the constant-only health-check RPC publicly callable.
   - Preserves existing signed-in row grants and policy predicates, but requires an active application account mapped to the real Auth identity. Auth sign-in by itself is not application authorization.
   - Prevents browser TRUNCATE, legacy credential-table reads, forged login audit writes, and non-manager role editing.
   - Does not change any password, account, operational row, history row, object path or file.
   - Stops on missing identity helpers, disabled workspace RLS, or an authenticated RPC relying only on PUBLIC EXECUTE. Removes the reviewed postgres schema-specific anon defaults for future tables/sequences/functions; global PUBLIC function defaults are a separate boundary described in the promotion guide.
2. **02-bind-rpc-identities.sql**
   - Guards both public/workspace machine-delete entry points with existing station edit authorization before looking up a target.
   - Binds PCB permission helpers to the caller's real Auth identity and closes the otherwise unguarded lock-release and locked-save paths.
   - Restricts notification cleanup and daily statistics RPCs to existing server-role/owner execution.
   - Only replaces function definitions and privileges. It does not call those data-changing functions.
   - Requires every reviewed replacement signature to exist and explicitly revokes PUBLIC/anon EXECUTE from all replacements without widening owner-only helper grants.
3. **03-private-attachments.sql**
   - Switches only issue-attachments and task-attachments to private and adds scoped restrictive guards around legacy policies.
   - Keeps cross-account collaboration within the maintenance workspace. Viewers can read, editors can upload/replace/delete, other accounts cannot.
   - Restrictive policies protect the two buckets even if another permissive policy is too broad. Other buckets retain their policy behavior.
   - Does not delete, move, rename or rewrite object contents, object paths, rich text, attachment rows or tools URLs.
   - Preserves legacy policies even when they use generic names, because those policies may also serve unrelated buckets. Requires Storage RLS and both target buckets to exist before any change.
4. **daily-stats Edge code**
   - Requires POST and the exact existing server service credential before constructing a privileged database client.
   - Does not trust an unverified decoded role claim. An anon JWT or regular user JWT is insufficient.
   - Uses the current credential; no credential is generated, rotated or disclosed.

This closes the specific anonymous paths and identity-spoofing defects. It is not a claim that every legacy signed-in table policy has complete per-page RBAC. Existing signed-in cooperation is deliberately preserved. Any further policy narrowing must first be reconciled against the live UI permissions and tested separately.

## Verified read-only facts

- All 116 application tables had RLS enabled, but legacy permissive policies and anonymous ACLs still exposed many of them.
- All 23 active application accounts were linked to Auth identities.
- Existing account-login establishes a real Auth session. UserContext still contains a separate legacy mode that has no such session.
- The active daily-production-stats cron job is owned by postgres, runs at 23:00 UTC, and directly executes `workspace.calculate_daily_production_stats()`. It does not need the public Edge endpoint.
- The two attachment buckets are currently public. Historical issue rich text and tools metadata contain public URLs; switching the bucket before the compatible frontend is deployed will break those assets.

## Release prerequisites: all are mandatory

1. Obtain permission for the exact production metadata/Edge changes and a suitable release window. The current restriction forbids deployment now.
2. Confirm a recent hosted database backup and its restore procedure. Verify a restore to an isolated destination before claiming recoverability. The current MCP tool set did not expose hosted backup/PITR status, so a successful full backup/restore has **not** been established.
3. Confirm Storage object backups separately. A database backup preserves Storage metadata, not necessarily object bytes. Do not mistake the metadata snapshot for a file backup.
4. Capture fresh schema/policies/ACL/column grants, function definitions, bucket settings and Edge source/version. Keep these private and checksum them. Compare against the reviewed versions and investigate drift.
5. Verify the exact deployed frontend uses real Auth sessions (`realtime v2` path), including already-open browser sessions. A linked account count alone does not prove session readiness.
6. Ship and test the signed-URL frontend compatibility separately before private-bucket cutover. Test existing stored public URLs, old rich text images, previews, original downloads, tools attachments, upload/replace/delete and concurrent editors without rewriting stored values.
7. Run the PostgreSQL tests, Edge tests, repository checks and the existing permission-boundary CI on the final integrated commit. Focused source-branch checks are recorded below; the combined local results and outstanding hosted/browser/CI gates are in [the integration report](../security/integrated-repair-20261112.md).
8. Ensure changes cannot be unexpectedly pushed by another deploy job during the cutover.

## Staging and verification

- Apply each proposal in a short transaction. A 1-second lock timeout and 20-second statement timeout are per lock acquisition/statement, not a total transaction deadline. Previously acquired locks remain until transaction termination. On any error, issue ROLLBACK or close the failed connection; never leave an aborted transaction open. These are safeguards, not a promise of zero downtime.
- Recheck anonymous REST/Storage access, public and workspace RPC aliases, ordinary signed-in viewing/editing and existing user sessions after each stage. Do not use live delete/reset APIs as probes.
- Do not run notification cleanup, recompute statistics, replace passwords or purge any operational/audit/history data as part of this patch.
- Compare row counts and content checksums in an isolated restore. During a live release, legitimate concurrent user writes can change counts, so do not overwrite current data to force a snapshot match.
- Re-run security advisors. Distinguish intentionally public login/registration from unsafe anonymous definer functions; raw warning counts are not a pass/fail test.
- Validate Storage/CDN behavior separately after the private-bucket switch. Existing browser caches and previously downloaded copies are not recalled by an RLS change. Supabase documents a separate CDN cache purge API (Pro and above), but it has not been executed or authorized here. Do not delete stored objects to invalidate caches. See [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) and [cache purge](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache).

## Recovery

Metadata-only snapshots of policies/buckets, functions, ACLs/column grants/default ACLs and the currently deployed daily-stats v12 source were saved privately with SHA-256 hashes. They are configuration recovery material, **not a complete database or object backup**.

An explicit original-configuration rollback script was prepared privately but has not been run. Reverting to those ACLs reopens the known exposure, so it must not be automatic. Prefer a targeted compatibility correction that preserves the anonymous boundary. If a transaction times out or fails, it rolls back without partially applying that stage.

Never restore an old database over current user work as a shortcut. Restore into an isolated database first, compare, and recover only specifically approved missing data if any. No historical-data deletion is authorized by this security proposal.

## Focused tests

Local synthetic execution passed on PostgreSQL 17.5 (PGlite 0.3.14) and PostgreSQL 18.3 (PGlite 0.5.8, the CI dependency):

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/remainingSecurity.postgres.mjs
node --test tests/dailyStatsAuthorization.test.ts
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/securityProposalCutover.postgres.mjs
```

The PGlite test uses only synthetic accounts, rows and objects. It executes all three SQL proposals and verifies every synthetic business row and Storage object is byte-for-byte unchanged. It covers anonymous access across 116 tables and column grants, inactive/unlinked accounts, browser TRUNCATE, audit/role restrictions, both delete RPC aliases, PCB identity spoofing, service-only maintenance, and attachment read/write separation including a deliberately broad competing policy.

The Edge tests verify exact service-credential matching and that unauthorized requests never construct a privileged client or invoke the statistics RPC.

Limits: this is PostgreSQL engine and handler logic testing. It is not a hosted Supabase Storage/CDN test, a Deno deployment check, a real-user browser regression, a full database restore rehearsal or proof that production is already fixed.

See [migration promotion and safe cutover](migration-promotion.md) before moving any proposal into an automatic migration directory.
