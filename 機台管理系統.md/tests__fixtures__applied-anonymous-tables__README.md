> 集中副本；原始路徑：`tests/fixtures/applied-anonymous-tables/README.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Applied anonymous-table ACL synthetic fixtures

These fixtures contain schema/definition metadata only. All rows, IDs, names and
credential-check inputs are generated synthetic values. They never connect to a
hosted service or read production account, task, audit or PCB content.

- `functions.json`: six reviewed trigger, delete and login definitions with exact
  ACLs and source MD5s. The four audit dependencies use the final pre-cutover
  capture. There are no live account identifiers, function-result rows, credentials
  or network destinations in this file.
- `tasks-schema.json`: the sixteen task columns, defaults, policy, constraint and
  publication metadata. The source table's database-local OID was omitted.
- `database.mjs`: `fixture()` creates a new in-memory PGlite database. Its password
  verifier is an explicit synthetic equality stub, not a real credential system.
  `installAppliedTableContext(db)` adds only task/progress/audit surroundings and
  four captured trigger/delete routines to another **throwaway** fixture. It does
  not create roles, change `system_users`/`login_audit`, or replace Auth/PCB helpers.
  It explicitly replaces delete-function test stubs with the reviewed definitions
  and ACLs so the immutable migration guards run without hash substitution.

`installAppliedTableContext` seeds one fabricated task linked to a fabricated
column, one audit row, one project sentinel and one unrelated sentinel; progress
and delete-dependency tables start empty. Every added workspace table has RLS.
The task and audit policies retain the exact names/predicates used by the applied
statement hashes. Other surrounding policies are synthetic permissive fixtures.

The PostgreSQL test reads both immutable applied migration files from the repository
and executes their original statement bytes, including BEGIN/COMMIT, only against
these fresh isolated databases. This is not advice to replay those statements on a
server or nest them in another runner transaction. It tests late errors *before*
the historical COMMIT and requires explicit ROLLBACK after failure.

The prior standalone rollback proposals would reopen anonymous access. They are
not included or executed. Tests instead verify duplicate-apply rejection and the
new retired rollback sentinel, retaining the already-closed boundaries and data.

Coverage retains original auth/service CRUD, captured login audit writes, captured
progress-trigger INSERT/UPDATE/DELETE events and captured delete-alias cleanup;
real authentication, passwords and business operations are never invoked. The
existing task FK may still change task.column_id when an authorized parent-column
delete occurs, including an anonymous parent caller in the unchanged baseline.
That indirect path is preserved and is **not claimed closed** by this narrow ACL.

`realtime.subscription` is a minimal synthetic preflight table, not the Realtime
service. Unchanged publication/filter metadata, retained authenticated SELECT and
an authenticated subscription fixture prove SQL/configuration compatibility only;
they do not prove hosted websocket OLD/NEW delivery or old-client behavior.

## Recovery provenance

After the ephemeral workspace reset, the six definition bodies were recovered
from already-reviewed repository history, not by querying production. Login bodies
come from `20260902120000_case_insensitive_usernames.sql` with their captured CRLF
body endings; delete and progress-trigger bodies come from the August 2025 source
files with the documented workspace remapping/search-path state. Only extracted
function DDL was evaluated in an empty synthetic database, never the historical
migration files' operational statements. Every deparsed definition matches its
pre-existing immutable migration guard MD5, including both login aliases. No
expected hash was changed to accept a different definition.
