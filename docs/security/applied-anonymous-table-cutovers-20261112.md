# Applied anonymous table containment and six-ledger baseline

## Exact applied scope

Two additional narrow migrations are already applied. Each removes only the anon
table ACL on its named table. Neither changes stored rows, retained authenticated
or service-role grants, RLS policies, function bodies, triggers, foreign keys or
publication configuration. These are history reconciliation copies, not new
instructions to execute the migrations.

- `20261112073038_restrict_anonymous_test_progress_audit_access.sql`:
  12,157 UTF-8 bytes; SHA-256
  `5ba847e461c80f9f73f55868f4e0fb56464e87d4a3a00bc1d52c2d4f842d3d49`;
  statement MD5 `d6874d1241faf8c1b9f0cbf7eed21fab`.
- `20261112073518_restrict_anonymous_tasks_access.sql`:
  6,089 UTF-8 bytes; SHA-256
  `144d4ae5ba3667adcb3ddcbf10a408a360c0055114aecb7e37c8bc4b00351c64`;
  statement MD5 `013553eadb40f0acbf3676dd2908717e`.

The exact server statements retain their original PENDING comments, outer
BEGIN/COMMIT and terminal LF. Those historical bytes must not be stripped,
retimestamped, replayed or used as a template for a new managed migration.
Embedded COMMIT can break a migration runner's transaction wrapper. Future
promotion must use a separately reviewed runner-owned payload and atomic ledger
write, with prompt rollback/connection close on failure. The new stage01 v2
payload already omits transaction-control statements; the historical candidates
that retain them still need reviewed transport preparation.

## Current verification and recovery entry points

Use [verify-applied-six-ledger-baseline.sql](../security-proposals/verify-applied-six-ledger-baseline.sql)
as the current standalone read-only check, not a migration. It verifies all six
version/name/single-statement byte-length/MD5 records, the exact two protected-read
APIs, and effective retained authorization boundaries:

- Four internal RPCs deny anonymous/authenticated execution and retain maintenance
  access; both delete aliases deny anonymous execution and retain their callers.
- Login-audit anonymous table/column access remains denied, retained readers and
  maintenance access remain available, and both login aliases remain callable.
- Tasks and progress-audit anonymous table/column access remains denied;
  authenticated CRUD/MAINTAIN and owner/service maintenance remain available.

Ledger presence alone is not accepted as proof that permissions remain closed.
The verifier reads catalog/ledger metadata, not account, PCB or audit row content.
Its narrower four-ledger predecessor remains unchanged as historical regression
material, not the current runbook entry point. The original four applied ledger
copies and three frozen PCB/legacy candidates remain unchanged.

The recovery baseline now contains all six applied entries. The
[rollback entry point](../security-proposals/anonymous-table-rollback-RETIRED.sql)
is an unconditional failure before mutation. Historical private scripts that
restore anonymous grants are not included and must not run automatically. Repair
compatibility while retaining the applied boundaries; never restore old data over
newer edits, reset sessions or clear drafts as a recovery shortcut.

## Remaining promotion sequence

Reconcile and skip the six applied records, verify compatible-client readiness,
then follow **twelve-RPC PCB candidate → separately reviewed raw-column enforcement
→ 01-close-anonymous-access-after-six-ledgers.sql → station-only 02 → 03**.
The published raw-enforcement file still refuses unchanged. All prior frontend,
Realtime, private/dynamic read-path, backup/restore and Storage gates remain.

The [stage01 successor](../security-proposals/01-close-anonymous-access-after-six-ledgers.sql)
is an explicit new proposal. The original stage01 remains unchanged for historical
tests and must not be promoted for this new baseline. V2 uses the original body
except for excluding all three already-closed audit/tasks tables from anonymous
sweeps. It adds exact applied prerequisites and independent postconditions.

V2 preserves the original reviewed authenticated narrowing: TRUNCATE, REFERENCES
and TRIGGER are removed; normal row CRUD and MAINTAIN remain on tasks/progress
audit. Legacy PUBLIC policies become authenticated-only without predicate changes,
with the existing active-account guard. Login-audit's separately reviewed signed-in
write restrictions remain unchanged. Writer/cleanup bodies, retained ACL entries,
column grants, FK/trigger definitions and publication metadata are compared, not
reconstructed from an old data snapshot. An anonymous grant reopened between
preflight and postflight fails rather than being silently revoked again.

## Synthetic regression and limits

The reconstructed portable fixtures contain only reviewed schema/function
metadata and fabricated accounts, tasks, progress and audit rows. The six captured
function definitions were recovered from existing repository DDL and deparsed in
isolated PostgreSQL; their original immutable MD5s match without changing expected
hashes or replaying historical business DML.

- Applied table SQL suite: 37/37 on PostgreSQL 17.5 and 18.3, including normal
  auth/service CRUD, login aliases, automatic progress auditing, delete cleanup,
  tasks FK behavior, publication/subscription preconditions, drift, late failure,
  duplicate application and fail-closed rollback.
- Combined source and all six immutable-ledger contracts: 37/37.
- Complete legacy/PCB sequence: 157/157 on each of PostgreSQL 17.5 and 18.3.
  It starts from all six exact applied records,
  runs the new v2 stage in a runner-owned transaction and rechecks every applied
  boundary after each stage. It preserves all five synthetic PCB snapshots,
  ordinary machine operations, normal setters, authenticated/service table CRUD,
  the real captured progress trigger and unchanged publication metadata.

A synthetic realtime.subscription relation and unchanged publication/SELECT
metadata are **not** hosted websocket delivery tests. Tasks' existing
`columns(id) ON DELETE SET NULL` behavior remains, including the indirect mutation
possible through a separately permitted parent-column deletion. Core
progress/projects anonymous grants are outside these two narrow cutovers. These
limits, unobserved old clients and the remaining release gates are not resolved by
this repository reconciliation. Do not use an already-closed audit table as an
expected-success anonymous HTTP control, or scalar RPC HEAD status as evidence of
RPC execution or access.
