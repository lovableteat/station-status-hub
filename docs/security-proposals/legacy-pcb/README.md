# Legacy PCB snapshots: protected reads without moving data

## Status

These are new **pending database proposals**, outside automatic migrations.
The prior session/draft-recovery frontend was merged separately at `96a6f05`.
That release neither installed these APIs nor revoked raw permissions access.
Do not describe every frontend change as undeployed, or these new database changes
as deployed. The compatible profile/legacy-API client is a separate pending release.

No actual account row, PCB snapshot, model payload, password or session was read,
rewritten, moved or deleted by this implementation. All five historical snapshots
remain in their original `system_users.permissions` documents. No equality between
those snapshots and modern PCB tables is assumed, and no reimport is performed.

## Two distinct stages

### 01-add-read-apis-PENDING.sql

Adds only two zero-argument, authenticated RPCs. It rejects name/overload collisions
rather than replacing an existing API. Default PUBLIC/anon/service grants on these
new functions are removed; only authenticated EXECUTE is added. An active mapped
actor remains mandatory inside each SECURITY DEFINER body. The original table,
column and function grants are not broadened.

- `workspace.list_system_user_profiles()` preserves the established roster audience
  and exact sixteen-column order. It returns id, username, display_name, role,
  status, permissions, created_by, created_at, updated_at,
  registration_requested_at, approved_at, approved_by, auth_user_id,
  auth_migrated_at, last_seen_at and avatar_path. Types come from current catalog
  metadata, including varchar widths, UUID and timestamptz fields, not guessed
  TypeScript string types. PostgreSQL function result metadata does not expose
  table NOT NULL constraints or varchar typmods as table constraints; returned
  values retain their original types/values and nulls. No password column is returned.
- Only an object-valued permissions response loses its top-level
  `pcbDesignerWorkspace` key. Every other key and nested value, SQL NULL, JSON null,
  array, scalar, false, zero and Unicode value is preserved. The stored JSON is
  never sanitized or normalized. A nested unrelated key with the same name stays.
- `workspace.load_pcb_designer_legacy_workspace()` maps verified Auth identity with
  `current_system_user_id()`, then requires the existing PCB view/admin permission
  before selecting any snapshot. Both APIs also reject an ambiguous active Auth
  mapping instead of selecting an arbitrary account. Neither takes a caller-chosen
  owner or actor ID.

**This additive stage does not close raw-column exposure.** Old clients retain
their previous read contract until the separate enforcement cutover.

### 02-close-raw-permissions-PENDING.sql

The file is deliberately **not executable as a release**. Its fixed opening gate
raises before metadata capture or mutation. The gate remains until old-client
readiness, Realtime filtering, private/dynamic read paths, hosted API behavior and
the exact release authorization have been verified. Removing it requires a newly
reviewed release artifact, not an environment flag or a production test bypass.

The proposed body removes exactly authenticated SELECT on
`workspace.system_users.permissions`. It does not revoke or regrant the other
fifteen columns, change RLS, change table grants, modify publication settings,
reset identities, or alter any account/PCB content. Its postflight compares table
and every unrelated column ACL against their original metadata and proves effective
anonymous/authenticated raw-column denial. There is no automatic reopen rollback.

## Exact legacy envelope, version 1

```json
{
  "schemaVersion": 1,
  "ownSnapshotPresent": false,
  "ownSnapshot": null,
  "sharedCatalog": [
    {
      "projects": [],
      "library": [],
      "updatedAt": "2026-01-01T00:00:00Z",
      "remoteDeletions": { "projects": [], "library": [] }
    }
  ]
}
```

`ownSnapshot` is the actor's exact JSON value if the key is present. A present JSON
null, scalar, array or malformed object remains present and exact. Absence is the
separate false/null pair. The client rejects invalid own recovery data while
retaining its local draft; the server does not invent an empty saved board.

Shared rows are ordered by owner UUID ascending without returning owner IDs. Each
row has only the four displayed keys, and its deletion object has only projects
and library. Library entries are limited to custom/BOM sources. Other owners'
templates, active selection, pending placements, modelAssets maps, private template
tombstones and unknown top-level fields never enter this projection. Project and
component payloads are the already-shared catalog data, not a wholesale owner
snapshot or a model-payload retrieval route.

SQL qualifies object snapshots with project/library arrays, a nonempty string
updatedAt, and a missing or valid deletion object whose project/library members,
when present, are arrays of nonempty strings. It preserves qualifying project and
custom/BOM component entries for the client's full existing validators. SQL does
not claim to validate every PCB geometry, template or component field. Malformed
outer snapshots are excluded from the shared projection without changing storage;
the actor's exact own value remains separately available. A malformed inner entry
causes the strict client parser to report a recoverable error, not empty success.

The actual frontend parser retains newest project revisions; project ties keep the
first ordered row, while library ties keep the last. Shared project/library
tombstones take precedence. A missing own snapshot has neutral private defaults
and no arbitrary active selection. Modern RPC success, including null, remains
authoritative. Legacy retrieval is only for a genuinely missing modern entry
point, never an authentication, network, malformed-success or permission error.
No legacy permissions-write fallback is permitted.

## Baseline and promotion sequence

1. Recheck current catalog metadata and all release prerequisites. The proposals
   pin the three immutable applied ledger names and single-statement MD5s, their
   effective internal/delete/audit boundaries, the exact seventeen-column source
   schema, table/column ACLs, six authorization/setter definitions and ACLs, and
   the absence of unexpected API role inheritance/bypass.
2. Separately review and install the additive APIs against that original baseline.
   Check positive/negative behavior with isolated or explicitly approved synthetic
   accounts, not real PCB content. Do not deploy API-dependent clients first.
3. Release the compatible three profile consumers and protected PCB client. Verify
   session restoration, roster/filter/order behavior, permission saves and draft
   preservation. The owner's willingness to save and refresh does not prove that
   every stale tab has actually updated. Do not force reload or clear dirty storage.
4. Apply the separately reviewed frozen twelve-RPC candidate after the additive
   stage. Its original bytes remain unchanged. If it has already been applied,
   stop for a separately reviewed baseline rebase; do not skip the additive
   preflight or treat this order as interchangeable. It is a prerequisite of the
   proposed raw-column enforcement, which checks all twelve hardened definitions,
   owners and complete ACLs before and after its single-column revoke.
5. Resolve every enforcement gate, produce/review a release-specific artifact, and
   only then consider the one-column cutover. The published pending file must still
   fail as-is. The compatible API functions become part of the recovery baseline.
6. Only after enforcement, the unchanged later proposals follow in this order:
   broad `01-close-anonymous-access.sql` →
   `02-bind-station-delete-identities-after-pcb.sql` → `03-private-attachments.sql`.
   Each retains its own release gates. Stage 01 changes the mapping helper's ACL
   and therefore must not precede these exact original-baseline legacy proposals.
   The protected APIs and normal permission setter continue through that ACL
   narrowing. Do not widen a preflight to accept an unreviewed alternate order.

Read-surface preflight rejects new or changed functions that directly reference
system_users and are not in the reviewed metadata allowlist, including functions
in non-exposed schemas. Only the two exact workspace zero-argument API OIDs are
exempted from this direct-reference scan, with their bodies, owner and full ACL
independently pinned. Same-name overloads and public aliases are rejected even
when their source does not mention system_users. It also rejects every new
direct/recursive dependent view
or materialized view. The current two application views have no such dependency.
The metadata list includes 79 directly referencing functions. Its hashes detect
drift; they do not prove that all private bodies or generic dynamic query paths
were reviewed. Missing noncritical allowlisted functions are not treated as a new
read grant. Critical helpers/setters and applied boundaries are separately required.

## Outstanding release blockers

- **Realtime:** current system_users replica identity is FULL. Its publication
  includes all seventeen columns, including permissions and password_hash, without
  a row filter. This is publication metadata, not proof that a client receives
  those fields. Verify the actual service's OLD/NEW column filtering, reconnect
  behavior and permission/name/avatar/status refresh with synthetic accounts.
  SQL SELECT denial alone cannot establish Realtime safety or compatibility.
- **Indirect source review:** 240 exposed function definitions matched their
  earlier reviewed hashes. Eight additional private system_users-referencing
  definitions were not available for complete source review. Hash allowlisting
  is not a substitute. Do not claim generic/dynamic return paths fully closed.
- **Hosted transport:** SQL filter/order checks are not a PostgREST or hosted Auth
  proof. Verify exact RPC schema-cache behavior, filtering, ordering and actual
  end-user identity in an approved isolated environment.
- **Old tabs and deployment:** establish the exact compatible client commit and
  real old-tab transition without losing drafts. No production test, session
  reset, publication change or forced reload is authorized by these files.

These blockers are why the enforcement gate is unconditional.

## Recovery and data integrity

Keep both protected APIs and the twelve actor guards after enforcement. A bad
client release must be repaired forward or reverted only to another compatible
client. Regranting raw permissions SELECT would reopen the same exposure and is
not an automatic rollback. A failed transaction requires immediate ROLLBACK or
connection close. Never restore an old permissions document over newer edits.

The existing permission setter is not changed. Synthetic tests invoke its captured
real definition and prove it changes requested permission fields while preserving
the complete legacy snapshot and unrelated keys. Candidate execution changes no
source row and triggers no account timestamp update. Repeated application and
metadata drift fail instead of silently granting access or overwriting functions.

## Local verification

On 2026-11-12, the SQL/real-parser suite passed **113/113** on each of PostgreSQL
17.5 and 18.3. New source contracts passed **6/6**; combined with frozen PCB
contracts and the three applied-migration byte suites, **23/23** passed.
These are local results. The separate actual PostgREST HTTP/SDK CI run must report
its own outcome, and is not implied by these SQL passes.

Run:

```sh
node --test tests/legacyPcbSecurityProposal.test.mjs
PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite/dist/index.js \
  node --test tests/legacyPcbSecurity.postgres.mjs
```

Tests use new in-memory databases, catalog-only fixtures and fabricated accounts,
snapshots, model markers and machine rows. They execute the additive SQL unchanged.
They prove the original enforcement file rejects unchanged, then validate exactly
one fixed gate and its SHA-256 before removing only that gate for an isolated body
rehearsal. That rehearsal is not successful application of the published pending
file and cannot mark it apply-ready. All other preflights and postflights execute.

Coverage includes five distinct retained snapshots, every original account field,
SQL/JSON null and malformed shapes, all fifteen other column reads, the normal
permission setter, raw/subpath/filter/order/whole-row/join denial, indirect-reader
drift, same-name/defaulted overloads and aliases, duplicate replay, late rollback,
and real SQL envelopes consumed by the
actual frontend parser for revision/tie/tombstone/absence behavior. Existing modern
PCB and deployment recovery suites remain separate required regressions.

The new sequence regression executes **additive APIs → frozen twelve-RPC candidate
→ isolated enforcement body → unchanged broad 01 → station-only 02 → 03** in one
fresh database. After every stage it checks protected profile/legacy reads, every
other profile field, ordinary machine access, authorized/denied permission setters,
and all five original synthetic snapshots. Each SQL stage leaves all account and
application rows unchanged; deliberate normal setter edits are committed between
stages and retained, never replaced by an earlier document. From enforcement
onward, raw/whole-row/filter denial is rechecked after every later stage. All twelve
PCB and both new API definitions, owners and ACLs stay fixed after the narrow
cutover, including after the mapping helper's broad-01 ACL reduction. Only stage
03 changes the two synthetic bucket visibility settings; object rows remain exact.
This is a compatibility rehearsal, not a release approval or hosted Realtime proof.
