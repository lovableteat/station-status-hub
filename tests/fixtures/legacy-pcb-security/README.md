# Synthetic legacy PCB read-boundary fixtures

- `system-users-schema.json` contains current column types/nullability, RLS/ACL,
  trigger and publication metadata only. It has no account rows or payloads.
- `authorization-functions.json` contains six reviewed authorization/permission
  setter definitions. Their hashes match the current catalog metadata.
- `read-surface-manifest.json` contains names, signatures, hashes and ACL metadata
  for 79 system_users-referencing routines, not their source or query results.
  Private-body review remains incomplete and is explicitly release-blocking.
- `release-gate.json` pins the exact unconditional pending-stage gate. Tests check
  its text, digest and unique occurrence before isolated enforcement-body rehearsal.
- `database.mjs` creates only a fresh in-memory PGlite database. It reads the
  repository's frozen migration files as synthetic ledger values, never runs those
  applied migrations against a server, and imports the existing PCB metadata
  fixtures. All accounts and snapshot content are fabricated in the test.
- The optional `fixture(database)` adapter is solely for the separate throwaway
  PostgreSQL/PostgREST CI environment. With no adapter, PGlite loads lazily from
  `PGLITE_MODULE`. Never point the adapter at an existing or hosted database.
- `sequence-database.mjs` adds only synthetic broad-stage/Storage surroundings to
  the same database for the full six-stage regression. Login routines are inert
  test doubles; no login/credential workflow is exercised. Its authorization
  helper comes from `sequence-authorization-function.json`, whose exact source
  hash and ACL match the existing read-surface manifest before installation.
  The helper/source schema, exact original preflights and all candidate bodies
  remain unmodified by this fixture. This is not a full production schema restore.
- `release-gate.mjs` shares the fixed-text/digest gate check with those isolated
  tests; application and deployment code must not import it.

No external URL, database endpoint, real user UUID, credentials or real PCB content
is stored here. SQL source/hash assertions are not hosted Auth, PostgREST or
Realtime integration results. Keep the release gate in the repository candidate.
