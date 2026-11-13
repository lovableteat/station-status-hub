> 集中副本；原始路徑：`docs/security/applied-legacy-pcb-read-apis-20261112.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Applied additive profile and legacy PCB read APIs

## Applied scope, not raw-column enforcement

The separately authorized additive operation recorded migration
`20261112064452_add_protected_profile_and_legacy_pcb_read_apis` on 2026-11-12.
It added only `workspace.list_system_user_profiles()` and
`workspace.load_pcb_designer_legacy_workspace()`, their reviewed authenticated-only
EXECUTE ACLs, and a PostgREST schema reload notification. Both zero-argument
SECURITY DEFINER functions retain the verified active-actor checks. It did not
apply the twelve-RPC candidate, raw-column enforcement, broad stages 01/02/03,
Storage changes, or any account/snapshot update, deletion or move.

The post-apply catalog comparison reported all 350 existing routines and 169
relations, their ACLs, policies, triggers, publications and prior migration ledger
unchanged. Both new APIs deny anonymous SQL calls and authenticated calls without
an Auth subject with SQLSTATE `42501`. Anonymous HTTP **POST** calls to both RPCs
returned `401`. These are negative-access checks, not a real user's successful
board load, hosted Realtime proof or a full backup/restore test.

A scalar RPC HEAD returned `200`; that is **not evidence of readable data or of
function execution**. PostgREST/planning can omit an unused scalar result for HEAD.
Do not use scalar HEAD status to determine RPC authorization. Check actual GET/POST
execution, effective SQL ACLs and guards, using synthetic identities when positive
execution is needed. No actual PCB content was used as a production probe.

Raw `system_users.permissions` SELECT remains at its original grants. All five
historical snapshots remain in place. The compatible client cutover and the
separately gated raw-read closure must not be inferred from this additive result.

## Immutable server-ledger copy

[Repository migration](https://github.com/lovableteat/station-status-hub/blob/2c5dd8829effc42acd60f64089701abb57e481c2/supabase/migrations/20261112064452_add_protected_profile_and_legacy_pcb_read_apis.sql):

- Version: `20261112064452`
- Name: `add_protected_profile_and_legacy_pcb_read_apis`
- Exactly one statement, UTF-8 bytes: `42759`, ending in one LF
- SHA-256: `ffa4e0437d54bbe6b894c93b32b48a63f58d9da70267ed5a842f5214c7623449`
- Statement MD5: `ad9bd1f1d425fed402deee5074f08d8d`

The server statement was independently retrieved from the applied ledger. The
repository copy preserves those exact bytes, including the historical PENDING
comment. That comment is not current deployment status. The original
[preparation candidate](https://github.com/lovableteat/station-status-hub/blob/2c5dd8829effc42acd60f64089701abb57e481c2/docs/security-proposals/legacy-pcb/01-add-read-apis-PENDING.sql)
remains byte-for-byte unchanged for audit and synthetic regression.

Only the candidate's outer `BEGIN;` and final `COMMIT;` were removed for the
migration service's transaction wrapper. No SET ROLE was added; both function
bodies, ACL statements, catalog guards and 1-second lock / 10-second statement
timeouts are otherwise byte-identical. The [official Supabase guidance](https://supabase.com/kb/troubleshooting/partial-migrations-and-schema-inconsistencies-from-embedded-transactions-13ae82)
says embedded transaction control breaks the runner wrapper and recommends letting
the runner handle atomicity. Do not wrap this transport in another embedded COMMIT
or submit the historical candidate to the migration tool.

## Reconciliation and later promotion

Use the [read-only applied-state verifier](https://github.com/lovableteat/station-status-hub/blob/2c5dd8829effc42acd60f64089701abb57e481c2/docs/security-proposals/legacy-pcb/verify-applied-read-apis.sql)
to check all four recorded ledger statements and the two exact zero-argument API
identities, owner, body hashes and complete ACLs. It reads only metadata and ledger
text; it neither calls the APIs nor reads account/PCB content. The standalone
verifier was subsequently run read-only against the target and returned
`applied_legacy_pcb_apis_verified`. Run it as a standalone
read-only check, **not** through `apply_migration`. It is not a substitute for later
stages' original schema, helper, read-surface, Realtime or client-readiness gates.

Match the target version/name/statement, then **skip the existing entry**. Both the
applied SQL and old candidate intentionally reject an already-present API. Never
reapply them as a health check, create a replacement timestamp, repair a ledger to
hide drift, or bulk-push the historical migration directory. A new isolated fixture
may apply the exact transport inside one runner-owned transaction with its ledger
write; that does not approve replay of the complete historical migration chain.

Recovery now preserves these two APIs as well as the three prior narrow containment
cutovers. If the compatible client fails, repair it or use a reviewed compatible
client rollback; do not automatically drop APIs, reopen permissions, reset sessions,
clear browser drafts, or overwrite current documents with old JSON. After an uncertain
tool response, inspect the committed metadata and ledger before any retry. On an
aborted transaction, immediately ROLLBACK or close the connection. Timeouts are per
lock/statement, not a whole-stage deadline; schema reload may briefly delay requests.

## Repository regression evidence

The legacy PostgreSQL suite now executes the exact applied transport and synthetic
ledger in its full six-stage rehearsal. It compares the transport against the
original candidate's complete function definitions and ACLs, checks a late runner
ledger failure and outer rollback, rejects duplicate application, and tests the
read-only verifier against absent/mismatched ledger and API definition/ACL drift.
All original 113 checks remain covered; the expanded suite passed **120/120** on
each of PostgreSQL 17.5 and 18.3. The combined source/immutable-ledger contracts
passed **27/27**. These tests use fabricated data only.

The historical twelve-RPC candidate, three prior applied statements, and all other
historical migration files retain their original bytes. The new exact-byte tests
also pin LF checkout behavior and the single terminal newline. Commit-specific CI
and actual PostgREST HTTP/SDK results must be recorded separately; SQL passes do
not establish hosted Auth, Realtime, Storage or multi-session compatibility.
