# Current-client document draft recovery: isolated PR CI

This harness builds the **current checkout's complete Vite application**, with only a synthetic backend and identity. It does not download or serve historical artifacts, change the frozen exact96/exact80 studies, publish assets, or use a production service. The historical exact80 → f6 protected-denial cases remain negative characterization, not positive evidence for the new client.

Complete compilation does **not** mean every route is supplied by the fixture server. The unrelated lazy `ApiManagementPage` contains an existing hardcoded production endpoint, so the harness explicitly excludes it from both the serve inventory and HTTP server. The existing BOM exclusion remains. Compiled excluded paths are recorded with byte length, SHA-256, and reason in `excludedInventory`, without source bytes or endpoint contents. All servable JavaScript must still contain no production Supabase project endpoint; an unexpected endpoint elsewhere fails the build guard. This suite exercises maintenance and PCB only, and does not fix or validate the API-management route.

## Required integration and evidence

Run only after the maintenance document-memory recovery and PCB settings recovery changes are integrated into the tested commit. Local validation is explicitly build-only; the 12 real-browser cases are not proved until the authorized PR CI run succeeds.

The report records HEAD, HEAD's source tree, lockfile SHA-256, checkout dirty state, and a deterministic servable path/length/SHA-256 inventory. Browser mode rejects a dirty checkout, then verifies stable identity after both build and browser execution. Normal ignored build outputs do not count as dirty. A local dirty build is labelled checkout/build-only evidence, never exact committed-browser evidence.

The actual app's UserContext establishes identity and gates. The harness does not call the draft registry or replace the editor with a test component. It observes the original native File object through a delegating `URL.createObjectURL` wrapper, then compares object identity, metadata, preview bytes, and exact note text after the gate remount.

## Cases

Each case runs at desktop 1280 × 800 and mobile-emulated 390 × 844, for 12 cases total:

1. Maintenance note and native PNG survive protected-profile 403 → editor unmount → same-actor 200 → reopen. Emptying the note and explicitly removing the file clears the draft; a second gate cycle stays empty. There is no invented maintenance Cancel button.
2. The same recovery, followed by one exact synthetic note RPC, PNG upload, and attachment metadata receipt. A second gate cycle stays empty.
3–5. PCB settings retain all seven raw fields and the validation error across the same gate cycle. Real keyboard width values `1e`, `-`, and `12.` must stay uncoerced. Cancel then reopens the original settings and clears the settings-only warning.
6. PCB raw width `19` and its error recover. Changing to `120` successfully applies the existing local reducer operation; reopening must not restore the invalid draft/error. All PCB remote save RPCs remain denied. A local settings apply can leave the CAD workspace dirty, so this case does not assert that the whole document warning clears or that a cloud save occurred.

All cases check the same actual Document, no reload, the outside-gate beforeunload cancellation, zero raw-permissions reads despite the legacy fixture remaining available, and zero unexpected network/business writes. Beforeunload is a cancelable event dispatched in real Chromium, not proof of native browser/OS prompt presentation. Viewport emulation is not a physical-device test. Document RAM is not reload, crash, sign-out, new-tab, or browser-restart persistence.

## Suggested existing regression-job insertion

Do not change the historical research jobs. After the existing `npm run build`, once `AUDIT_QA_DIR` and Playwright Chromium are already installed, add a separate PR-only step:

```yaml
- name: Current full-client draft recovery (synthetic services only)
  if: github.event_name == 'pull_request'
  env:
    CURRENT_DRAFT_RECOVERY_WORKDIR: ${{ runner.temp }}/current-client-draft-recovery
    CURRENT_DRAFT_RECOVERY_EVIDENCE_DIR: ${{ runner.temp }}/current-client-draft-recovery-evidence
  run: |
    node --test tests/currentClientDraftRecoveryHarness.test.cjs
    timeout --signal=TERM --kill-after=10s 300s node tests/currentClientDraftRecovery.browser.cjs
```

The `.test.cjs` safety tests **must be invoked explicitly**; the ordinary `npm test` collector does not discover them. Do not set the build-only flag on the browser step. The script requires `GITHUB_ACTIONS=true` and the `pull_request` event before entering browser mode. These runtime guards supplement the authorized workflow; spoofing them locally is not permitted.

The harness itself fixes `VITE_SUPABASE_URL=https://draft-recovery.invalid`, a clearly synthetic anon key, `VITE_SUPABASE_SCHEMA=workspace`, and `VITE_REALTIME_COLLABORATION_V2=true`. It builds outside the checkout and never consumes production endpoint/key configuration. Browser requests use fully synthetic HTTP/WebSocket peers. Service workers are blocked; an explicit loopback deny proxy, DNS deny rules, and non-proxied WebRTC restrictions provide a second transport barrier. Unmatched requests fail instead of being forwarded.

Add only these paths to the existing regression evidence upload:

```yaml
${{ runner.temp }}/current-client-draft-recovery-evidence/*.json
${{ runner.temp }}/current-client-draft-recovery-evidence/*.png
```

Never upload the build/work directory, source, `dist`, historical bytes, HAR, trace, storage state, or browser profile. JSON contains synthetic observations and hash metadata only. Keep the existing short retention policy.

## Authorized local validation (no browser)

```sh
node --test tests/currentClientDraftRecoveryHarness.test.cjs
CURRENT_DRAFT_RECOVERY_BUILD_ONLY=1 \
CURRENT_DRAFT_RECOVERY_WORKDIR=/tmp/current-client-draft-recovery-build \
CURRENT_DRAFT_RECOVERY_EVIDENCE_DIR=/tmp/current-client-draft-recovery-evidence \
node tests/currentClientDraftRecovery.browser.cjs
```

The build-only branch returns before loading Playwright, creating the transport sink, or launching Chromium. It proves only source/synthetic-build and fixture contracts, not UI recovery.
