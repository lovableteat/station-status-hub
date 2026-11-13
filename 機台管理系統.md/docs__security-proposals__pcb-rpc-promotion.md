> 集中副本；原始路徑：`docs/security-proposals/pcb-rpc-promotion.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Pending PCB RPC cutover and safe successors

## Status and scope

The **twelve-RPC candidate remains pending**. The separately authorized
[additive protected-read APIs](./docs__security__applied-legacy-pcb-read-apis-20261112.md)
are now applied as version `20261112064452`; that did not install this candidate
or close raw permissions reads. No production board/model content is inspected by
these synthetic tests. All six current applied ledger entries remain immutable and must not be replayed;
use the main guide's six-ledger verifier before later promotion.

`pcb-rpc-cutover-PENDING.sql` retains the reviewed 39,502 bytes, SHA-256
`eb164dac09eba533cf2006c42c12d259608c64f9b42a668f16ed09881800a77a`.
Do not normalize its mixed line endings: its exact definition hashes are part of
the pre/postflight checks. It stays outside `supabase/migrations`.

Each of the twelve existing PCB entry points first requires a non-null supplied
system account ID equal to `workspace.current_system_user_id()`. That helper maps
the verified Auth subject to an active application account. System account IDs
and Auth user IDs are different domains and must not be compared directly.
Failure raises SQLSTATE `42501` before any board/model/lock access. Only
PUBLIC/anon EXECUTE is revoked. Existing authenticated access, service-role
denial, owner-only helper access, function bodies after the new guard, table
grants, RLS, policies, and every stored value remain unchanged.

Pre/postflight compare exact definitions, owners and complete ACL sets for all
twelve entry points and the mapping helper. Unexpected API role membership
fails closed. The transaction uses a 1-second lock timeout and 5-second
per-statement timeout, not a total execution deadline.

## One supported promotion order

1. Complete the main guide's recoverability, concrete authorization and compatible
   frontend gates. Verify actual Auth sessions, session restoration, permission
   denial handling, retained local drafts, and already-open clients. Denied
   remote load must not become an empty successful workspace. Compatibility
   fallback is allowed only for a missing RPC, not authentication failure.
2. First reconcile/skip the already-applied additive read APIs and verify the
   compatible client cutover, following the [combined sequence](./docs__security-proposals__migration-promotion.md).
   Recheck current metadata and release state without reading real PCB payloads.
   Apply only the exact narrow PCB candidate after its original baseline checks
   pass. Do not replace a failed preflight hash with the newly observed hash just
   to make deployment succeed. An uncertain result requires read-only metadata
   reconciliation before any retry. A duplicate candidate rejects intentionally.
3. In the combined legacy route, complete the separately gated raw-column
   enforcement **before** broad stage 01; its published pending file still refuses
   execution. Then promote `01-close-anonymous-access-after-six-ledgers.sql` under its own gates.
   The original stage01 is retained for historical tests, not this baseline.
   It preserves all twelve hardened PCB definitions/ACLs, but removes PUBLIC/anon
   from the mapping helper ACL. Running it before the narrow candidate invalidates
   the candidate's reviewed baseline and is rejected. Do not restore anonymous
   access to make the candidate run.
4. Promote `02-bind-station-delete-identities-after-pcb.sql`. It copies the exact
   existing two station-edit delete-body replacements and checks the applied
   internal/delete ACL baselines. It changes no grant, makes no PCB replacement,
   and calls no data-changing RPC. Before and after replacement it checks the
   twelve exact hardened PCB definitions/owners/ACLs and the unchanged mapping
   function with stage 01's narrowed ACL. Stage 01 account/audit guards must exist.
5. Promote `03-private-attachments.sql` only after its independent compatible
   signing/download UI and hosted Storage checks. Preserve every original object
   and URL. The synthetic sequence does not validate hosted Storage/CDN behavior.

The old `02-bind-rpc-identities.sql` remains for historical regression tests only.
Its four PCB replacements include two permission helpers and the callable release
and locked-save bodies. It must not follow the narrow candidate: it would remove
two explicit guards and replace the retained save semantics. Its new early
sequence check rejects a PCB function using the verified-system-account mapping.
The narrow candidate also rejects the old stage 02's changed definitions if that
old stage is applied first. Never promote both variants or bypass those failures.

This ordering is tested with the complete repository SQL files, not abbreviated
substitutes. It is still a proposed sequence, not authorization to deploy it.

## Recovery and retained data

`pcb-rpc-rollback-RETIRED.sql` raises unconditionally before mutation. No executable
rollback restoring the vulnerable definitions or anonymous grants is distributed
with these proposals. The original preimage is test metadata, not a recovery plan.
On a failure within a transaction, issue ROLLBACK or close the connection promptly.
After a successful cutover, preserve all twelve guards and fix client/session
compatibility forward. Do not reset sessions, rotate credentials, clear browser
storage, restore an old database over active work, or delete data as recovery.

Five historical PCB snapshots remain in `system_users.permissions`. They are not
removed, moved, rewritten, or read by this preparation. This candidate does not
protect all paths that can return those snapshots. A separate compatible sanitized
profile/permission read contract or explicitly reviewed reversible private archive
and PCB retrieval path is still needed. Revoking the entire permissions column
without reconciling its other consumers could break the rest of the application.
The new fixture uses five different fabricated snapshots and verifies every
complete account row and permissions JSON is preserved after each stage.

## Verification and limits

Local verification on 2026-11-12 passed 75 PCB checks plus 38 unchanged broad
security checks (113/113 total) on PostgreSQL 17.5 and 18.3. The five PCB source
contracts also passed, alongside the applied-migration byte checks. These are
local results, not a claim that hosted CI or production validation has run.

- `tests/pcbRpcSecurityProposal.test.mjs` pins candidate bytes and all twelve
  guard-only body changes, verifies exact successor replacements/checks, and
  rejects fixture identifiers/URLs and executable unsafe rollback content.
- `tests/pcbRpcSecurity.postgres.mjs` runs exclusively in new in-memory PGlite
  databases with repository metadata fixtures and synthetic rows. It covers the
  pre-fix anonymous reproduction; every entry-point denial; view/edit/admin,
  inactive and unlinked accounts; all five PCB table values; own-client lease
  renewal; competing editor denial; save/release; private templates and shared
  data; model bytes; deletion tombstones; and an unrelated machine sentinel.
- It also tests original/changed ACL and definition baselines, duplicate replay,
  late-failure atomic rollback, fail-closed retired rollback, incompatible stage
  ordering, the complete supported sequence, and station-only late failure/drift.
  Original positive/negative cases from the prior 52-check private fixture are
  retained. Its unsafe configuration-restoration case is intentionally replaced
  by retired-rollback rejection plus transactional rollback equality checks.
- Existing broad-proposal tests remain unchanged and must continue to pass. Those
  old fixtures are historical regression coverage, not an alternate promotion
  order. No history or applied migration entry is rewritten by these tests.

Use the pinned local PGlite dependency from CI; see the fixture README for commands.
Run both supported PostgreSQL engine versions when changing these proposals.
Engine tests do not verify hosted JWT issuance/PostgREST, real-user PCB access,
multi-tab recovery, production writers, Storage/CDN caches or full backup restore.
Post-cutover production checks should start with metadata and rejection-only
requests that cannot read a real owner board; positive-path tests need a separately
approved isolated/synthetic environment, never a real PCB as a probe.

References: [Supabase function permissions](https://supabase.com/docs/guides/database/functions),
[Auth and RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Data API security](https://supabase.com/docs/guides/api/securing-your-api),
and [current CLI targeting](https://supabase.com/changelog/supabase-cli-v3).
