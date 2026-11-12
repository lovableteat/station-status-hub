# Isolated PCB session recovery browser regression

This regression mounts the actual `PcbDesignerWorkspace`, 2D canvas, toolbar,
dialogs, account remote adapter, access guard, workspace/persistence/lock hooks,
repository and history guard. The hook wrapper only injects a synthetic storage
boundary and observes the returned API. It does not reimplement application logic.

Auth and RPC transport, permissions/user context, and presence transport are
synthetic. CAD import, STEP preview and WebGL are excluded. Seeded board geometry,
component, keepout, measurement, description, IDs, tokens and all responses are
synthetic. No real account, real PCB data, credentials, service URL or server is used.

## Safety boundary

- The fixture server binds to an ephemeral `127.0.0.1` port.
- Browser interception permits only the three fixture GET paths on that origin.
- CSP denies connections and submissions. Fetch, XHR, WebSocket, EventSource,
  sendBeacon, IndexedDB and browser storage writes/removals are blocked and audited.
- The production repository receives an in-memory synthetic store. Destructive
  writes, empty recovery clears and unrelated-key writes fail and are asserted absent.
- Supabase client/SDK imports and runtime imports are rejected by bundle checks.
- Auth recovery may read sessions and receive synthetic events; sign-out and
  setSession are forbidden. Permissions-table fallback throws and is audited.
- Browser launch requires `GITHUB_ACTIONS=true` and `GITHUB_EVENT_NAME=pull_request`.
  Do not emulate those CI flags locally; use the build-only validation below.

## Coverage

Each of 14 scenarios runs in Chromium at 1280×800 and emulated mobile 390×844
(28 browser cases total):

1. Missing session, dirty recovery, blocked save and repeated retry.
2. Expired session with the same protection.
3. RPC 401 with no legacy permission fallback or false empty-cloud success.
4. SQLSTATE 42501 with the same protection.
5. Legitimately empty cloud response retains existing dirty content.
6. Denied locked save retains recovery without unlocked fallback.
7. Authorization-denied lock renewal cannot silently enable local editing.
8. Stale load success after a new session cannot overwrite the draft.
9. Stale load denial cannot re-block a newer recovered session.
10. Pending old-session save cannot mark a subsequently edited draft clean.
11. Own-client lease acquire, real heartbeat timer renewal, release and recovery remount.
12. Actual settings edit cancellation/Escape and dirty Back/Forward guards.
13. Normal same-actor `TOKEN_REFRESHED` preserves ready state and the existing lease,
    with no release, re-acquire, workspace reload or transient read-only render.
14. Mounted application-account/Auth-actor switch retains the original owner's
    recovery bytes and dirty draft. Retry, heartbeat, save and model requests cannot
    send the old workspace to the new account or write a new-owner recovery key.

Denied-state cases also verify that routine token refresh does not clear server
denial without explicit retry. Stale-response cases use an actual synthetic
`SIGNED_OUT` then same-actor `SIGNED_IN` boundary, not normal token renewal.
The actor-switch case uses a reactive synthetic user provider boundary so the
actual mounted workspace receives the different application account and Auth actor.

The assertions compare the full draft and recovery project content, not just
visible text. Explicit-save attribution metadata may be added by production code.
Saved revision, UTF-8 description, geometry and unrelated sentinel data are checked.
Every scenario asserts no browser page errors, no forbidden request, no destructive
storage writes, no auth mutation, no document reload and no document-width overflow.

## Local permitted validation

```sh
PCB_RECOVERY_BUILD_ONLY=1 node tests/pcbSessionRecovery.browser.cjs
node --test tests/pcb-designer/browser-recovery-fixture.test.mjs
```

This compiles the actual app/CSS with safe aliases and validates source contracts.
It does not launch Chromium and is not evidence that browser interactions passed.

## Authorized PR CI command

Use the workflow's existing pinned Playwright 1.58.2 and Chromium installation:

```sh
PCB_RECOVERY_EVIDENCE_DIR="$RUNNER_TEMP/pcb-session-recovery" \
  timeout --signal=TERM --kill-after=10s 240s \
  node tests/pcbSessionRecovery.browser.cjs
```

`AUDIT_QA_DIR` must point to the workflow's isolated QA installation. Run only after
its Chromium installation succeeds, and only for the authorized pull request event.
Always upload `$RUNNER_TEMP/pcb-session-recovery/`, including `report.json` and all
denied/passed/failure PNGs. Reports are written incrementally so an unsuccessful
scenario remains visible. Screenshot filenames include width, scenario and status.

## Interpretation limits

Only successful PR CI output proves these browser contracts executed. Build-only
success is not browser success. Review the resulting desktop/mobile screenshots.
This is browser viewport emulation, not a physical phone or software-keyboard test.
Synthetic RPCs prove adapter arguments and frontend behavior, not hosted Auth,
PostgREST, actual server lease ownership, production RLS or real-user data safety.
The separate PostgreSQL suite covers the server functions. The fixture tests SPA
remount recovery, not disk persistence across a browser restart. It does not cover
the global `UserContext`, full application routing, CAD, 3D or production deployment.
