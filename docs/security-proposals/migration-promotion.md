# Migration promotion and safe cutover

These proposals remain outside automatic migrations. A draft PR and isolated CI are allowed preparation; they do not authorize production execution, merging main, bucket changes, or history deletion. Sleeping users and an idle-looking UI do not establish a safe change window.

## Why promotion must be staged

Do not copy all three SQL files into `supabase/migrations` and run a bulk push. That would remove the verification pause between authorization changes and private-bucket cutover. Promote only the next separately approved stage after its prerequisites pass. Keep later stages outside the migration directory until their own gate is satisfied.

Before assigning each migration timestamp, fetch current main and the actual target migration ledger. The next filename must follow the real latest migration, not the date this proposal was written. Compare source hashes, function definitions, owners/ACLs, policies, bucket settings and default privileges against a fresh target inventory. The old snapshot is evidence of prior state, not evidence that production is unchanged now.

The exact migration runner and final SQL wrapper must be rehearsed in an isolated restore. Preserve transaction boundaries and SET LOCAL timeouts. Do not assume a runner's implicit transaction and the proposal's explicit BEGIN/COMMIT compose safely without testing. Record the migration only after a successful committed stage; never mark a failed or uncertain stage applied merely to unblock the next one.

## Required gates and sequence

1. **Recoverability and work in progress:** verify an isolated database restore and separate Storage-object restore. Metadata dumps and preserved Git objects are not full backups. Confirm needed cloud BOMs and legacy local-only changes are recoverable. Users must save drafts before any agreed reload; never clear their localStorage/IndexedDB or restore an old database over current work.
2. **Compatible frontend:** verify real active Auth sessions, including already-open clients, then release the frontend that no longer bundles business BOM data and resolves existing attachment references through authorized signing/downloads. Exercise existing records and both viewer/editor accounts. Do not switch buckets first.
3. **Stage 01, anonymous ACL/RLS closure:** validate required identity helpers and explicit/effective authenticated RPC grants without relying on PUBLIC. The script fails rather than silently granting broader access when that dependency drifts. After committing, verify non-destructive authenticated reads and ordinary permitted workflows, plus anonymous denial.
4. **Stage 02, identity-bound RPCs:** all six replaced signatures must already exist. The script removes PUBLIC/anon EXECUTE explicitly and preserves the remaining ACLs, including owner-only PCB permission helpers. Verify valid owner loading and identity rejection without calling live delete/reset/cleanup APIs. A real locked-save regression with the target's complete shared-save dependency remains an isolated-restore gate.
5. **Stage 03, private attachments:** confirm old tabs have safely updated and that both target buckets and Storage RLS are present. Preserve all legacy policies, including generic-name policies that may authorize unrelated buckets; targeted restrictive guards prevent them reopening the two attachment buckets. Verify original-file download, image/HTML previews, signing, collaborator reads, editor uploads and denied anonymous access against hosted Storage. Verify unrelated buckets are unchanged.
6. **Daily-stats Edge endpoint:** inventory actual callers first, then separately authorize and deploy its service-credential check. This is independent of bucket cutover and need not wait for Storage once callers are verified. Until deployed, the old privileged endpoint remains a separate exposure. Do not execute a live calculation merely as a smoke test.
7. **History/CDN work:** handle repository history, old build artifacts and cached/downloaded copies as a separate authorized cleanup. An RLS change cannot recall downloaded files. Do not delete Storage objects or operating history as a cache-clearing shortcut.

## Failure, replay and active writers

- Each stage is transactional. The synthetic test injects a late failure and checks rows, objects, function definitions, policies, grants and default ACLs after ROLLBACK. This does not prove hosted Storage cache atomicity or live multi-session writer safety.
- A failed PostgreSQL transaction stays aborted until ROLLBACK or connection close. The runner must perform one of those immediately, otherwise locks can remain held.
- lock_timeout is per acquisition, and statement_timeout is per statement. A loop touching many tables can hold earlier locks through later work. There is no verified whole-stage duration bound and no claim of zero interruption.
- Stages 01 and 03 create named policies and reject duplicate replay. Stage 02 is repeatable with the same approved dependencies, but still requires drift review. After a lost response or timeout, inspect the committed policy/ACL state and migration ledger before deciding to retry. Never blindly rerun a stage or automatically reopen anonymous access.
- For a compatibility failure, prefer a narrowly reviewed correction that retains the anonymous boundary. Do not revert all grants or public bucket settings automatically, and do not overwrite current rows to match an earlier snapshot.

## Future default privileges

The saved inventory showed postgres-owned schema defaults granting anon access in public/workspace. Stage 01 removes those specific anon defaults for future tables, sequences and functions, and PUBLIC table/sequence defaults in those two schemas. Other creators and schemas must be inventoried; this change does not claim to rewrite every managed owner's defaults.

PostgreSQL independently grants PUBLIC EXECUTE globally on new functions. A schema-specific REVOKE cannot cancel that global default. This proposal intentionally does not make a wider global default change, which could break future functions in unrelated schemas. Every future exposed function migration must revoke PUBLIC/anon and assign its reviewed caller roles in the same transaction before commit. Gate deployment on post-migration anonymous-ACL checks and reject any newly exposed non-allowlisted function. A global-default strategy requires separately reviewed scope and compatibility tests; do not claim the schema-specific change alone prevents all future RPC exposure.

## Evidence added during deeper review

- Nine additional synthetic cutover cases cover late rollback, duplicate replay, missing RPCs, PUBLIC-only and owner-only helper access, disabled RLS/missing buckets, unrelated-bucket policy drift, explicit replacement ACLs, and future default-privilege boundaries.
- PostgreSQL performance organization, submission and AI usage suites add 101, 61 and 13 passing checks respectively.
- Dedicated-branch/PR workflows use local synthetic service settings and read-only repository permissions. Pages is restricted to main/manual execution; the keep-alive workflow is schedule/manual only. No production migration command is part of the PR workflows.
- Actual browser, Docker and Deno results must come from their CI run, not be inferred from local source tests. The PR regression workflow now includes the private rich-text preview and desktop/mobile seed-removal fixtures.
