> 集中副本；原始路徑：`tests/fixtures/pcb-rpc-security/README.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Synthetic PCB security fixture

These files contain only the reviewed SQL definitions and schema metadata needed
to exercise the narrow pending candidate. They contain no database rows, account
identifiers, credentials, request logs, board content or model payloads.

- `functions.json`: the twelve workspace PCB entry points, four owner-only
  helpers/triggers, and the Auth-to-system-account mapping function. Definitions
  preserve their original line endings inside JSON strings because the pending
  candidate compares `pg_get_functiondef()` hashes. Unrelated functions are omitted.
- `schema.json`: the five PCB relations, their columns, RLS flags and ACL metadata.
- `constraints.json`: required constraints and triggers, without role/member IDs.

`tests/pcbRpcSecurity.postgres.mjs` creates a new in-memory PGlite instance, loads
this metadata, and inserts seven explicitly synthetic accounts and small fake
board/model values. Its local `auth.uid()` reads a test claim, not a real JWT.
Five accounts also receive distinct fabricated `pcbDesignerWorkspace` permission
snapshots; their full account rows and permission JSON must remain unchanged.
The tests do not open a connection to Supabase or read actual PCB data. They read
the candidate from `docs/security-proposals` at runtime, not a generated copy.

Run from repository root with a locally installed PGlite module:

```sh
PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite/dist/index.js \
  node --test tests/pcbRpcSecurity.postgres.mjs
node --test tests/pcbRpcSecurityProposal.test.mjs
```

Use the same pinned PGlite installation as the repository security CI. A separate
PostgreSQL 17/18 run is useful, but neither emulates hosted PostgREST, Auth token
verification, real browser sessions, or simultaneous transactions from many tabs.
Never use an existing database path or production credentials for this fixture.
The pre-fix metadata is test input only, not a deployable recovery script.
