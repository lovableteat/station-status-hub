# Protected legacy PCB and sanitized-profile browser contracts

These extend, not replace, the original 32 PCB session/draft cases. All browser execution is restricted to the authorized GitHub **pull_request** CI. Do not launch Chromium locally or claim a build-only check is a browser pass.

## CI commands and artifacts

Keep these as separate PR-only steps, each with its own 240-second timeout:

```sh
PCB_LEGACY_EVIDENCE_DIR="$RUNNER_TEMP/pcb-legacy-recovery" timeout --signal=TERM --kill-after=10s 240s node tests/pcbLegacyRecovery.browser.cjs
SANITIZED_PROFILES_EVIDENCE_DIR="$RUNNER_TEMP/sanitized-profiles" timeout --signal=TERM --kill-after=10s 240s node tests/sanitizedProfiles.browser.cjs
```

Use the existing pinned Playwright installation through `AUDIT_QA_DIR`; do not add a new install or browser dependency. Preserve both evidence directories with `if: always()`: `report.json`, all `*-passed.png`, intermediate `*-denied.png` / `*-pending.png` / `*-read-only.png`, and `*-failure.png`. Failures record synthetic UI state, RPC calls and blocked requests. Screenshot dimensions are exactly 1280×800 or 390×844. Original PCB artifacts remain under `pcb-session-recovery`.

Local permitted checks only:

```sh
PCB_RECOVERY_BUILD_ONLY=1 node tests/pcbSessionRecovery.browser.cjs
PCB_LEGACY_BUILD_ONLY=1 node tests/pcbLegacyRecovery.browser.cjs
SANITIZED_PROFILES_BUILD_ONLY=1 node tests/sanitizedProfiles.browser.cjs
AUDIT_QA_DIR=/tmp/station-release-qa AUDIT_PERMISSIONS_BUILD_ONLY=1 node tests/auditPermissionsDialog.browser.cjs
node --test tests/protectedReadBrowserFixtures.test.mjs tests/pcb-designer/browser-recovery-fixture.test.mjs
```

## Coverage

- **46 additional PCB cases**: 23 scenarios at both widths. Actual workspace, 2D canvas, toolbar, dialogs, persistence/lock/access hooks, protected loader/parser. Genuine missing-modern-function fallback to zero-argument protected retrieval; own-private versus shared-only projection, newest revision and tombstone behavior; read-only legacy mode; unchanged dirty draft/recovery; explicit absence versus null, malformed, future or private-field-injected envelope; 401/42501/P0001 denial and transport/missing-protected RPC failure; modern empty/valid/malformed/error and missing-internal-helper results never enter fallback; old-session/owner completions; missing locked save never becomes an unlocked/raw write.
- **42 profile/guard cases**: 21 scenarios at both widths. Actual `PermissionsProvider`, `AdminPanel`, `UserPermissionsDialog`, typed profile reader, and for two scenarios actual `PermissionGuard` + PCB subtree. Stored-page precedence, error reset, background refresh without initial-loading state, refresh triggers, old-actor outcomes; ordered roster/filter/open/cancel, failure retaining roster, stale-response fences and fresh authorization disabling actions; target/actor switches and delayed reads, disabled controls/retry, failed-save draft retention, cancel/reopen, controlled RPC save, old-save receipt isolation. A true guard unmount with failed storage writes/reads must recover the exact newest PCB draft from the same document/owner/client memory checkpoint; another account must never inherit it or read the ownerless global workspace.
- The earlier responsive permission-dialog browser suite now reads the same strict sanitized-profile RPC fixture. Existing layout, focus, scrolling, save/error and no-write-on-cancel assertions remain intact.

## Isolation and evidence

The service boundary returns only synthetic profiles/envelopes. No real account, token, PCB payload, endpoint, upload or destructive storage operation is used. Both fixture bundles explicitly include actual production modules and reject the production Supabase config/SDK and runtime imports. The generic harness allows only loopback GETs for its own document/JS/CSS, blocks fetch/XHR/WebSocket/EventSource/beacon/IndexedDB and browser-storage mutations, and enforces a no-connect CSP. Raw system_users reads/writes and old PCB fallback RPCs fail the tests. Controlled permission saves affect only synthetic in-memory rows and preserve unknown permission keys and a separate private-snapshot sentinel.

No-reload evidence uses the original **Document object**, per-document identity, one domcontentloaded event and one document request. Playwright clock-mocked Performance navigation entries are not used. Every case checks viewport/document width, boundary violations, console exceptions and module-specific data assertions. A screenshot alone is not proof of unchanged hidden draft fields.

## Explicit limits

This tests a **newly loaded compatible frontend**, not an already-running older bundle. Deploying new code cannot retroactively repair an old tab. Such tabs can still fail closed after raw-column revocation and need a user-managed save/export/recovery and refresh path. No forced reload, logout or storage clear is introduced by this fixture.

Memory-only recovery is confined to the same document and storage-object/owner/client key. It is **not durable across a real reload**, browser close or process loss. This suite does not certify every non-PCB editor's recovery behavior.

Synthetic RPC responses prove consumer/parser behavior, not server actor verification, raw-column ACL enforcement or shared projection correctness on a hosted database. Simulated Realtime callbacks prove refresh-trigger wiring only, not publication delivery or OLD/NEW payload confidentiality. Local Postgres/PostgREST tests and the separately authorized real-service Realtime review remain distinct evidence. Mobile is Chromium viewport emulation, not a physical device. CAD/STEP/3D, account editing/deletion, API and collaboration panels are out of scope.
