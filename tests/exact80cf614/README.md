# Separate exact80 → fixed cf614 research

This is a new, private-runner experiment, **not an asset-publication allowlist or deployment approval**. It leaves `tests/exact80/` and its original f6 negative protected-denial study unchanged.

## Pinned inputs and static findings

- Published original: `80f2c4c071c3c88a85d247b7c3d48b303ccdd57c`, Pages artifact `13932556496`, run `43194005864`, ZIP SHA-256 `0ea50b92cad632805040cf4e4c8acba49097eed58a086cbcd41c5c466851bdd6`.
- Candidate source: `cf6142474a7974d6a71ef0679dc549685171c40e`, tree `0932c4057c1d8cc42c92c24b3fcdafd7c677ea95`. Its build is source-derived, not a claimed published Pages artifact.
- Public-config build: 334 files, 61,718,358 bytes. Sorted path/hash inventory SHA-256: `7cedfebc7eadb23696d2518b87f7d377c1e0118c5e5770f14d432e2d5878bcf1`.
- The original public build configuration is recovered only from the hash-pinned old entry. Only an `anon` JWT matching that endpoint is accepted. Values are never logged or committed. The schema is `workspace`, realtime-v2 is enabled, and the public-configuration hash matches old80.
- Original boot inputs were re-derived from the 334/334 byte-matching old80 Vite provenance: six explicit roots, static imports/CSS/assets/references, plus index/favicon/QR. The resulting 53 paths/hashes match the original selected inputs. Unselected dynamic routes and workers are not implicitly included.
- Candidate full inventory is re-hashed before browser setup; known revoked executable hashes and seed markers fail closed. BOM assets are never served in either phase. All old Auth/Admin/PCB/HTML/BOM identities remain denied after cutover, including byte-identical aliases. A marker/hash check is not a complete content security audit.
- Warm Dashboard still needs exactly three experimental old files (10,777 bytes), six already evaluated old JS modules, and four CSS files that remain exact candidate matches. The three files are conditional experiment inputs only. The production retention planner must still reject the missing unsafe Auth dependency. Resident vulnerable code is not repaired by leaving it in the module map.

## Planned browser observations, not completed results

Eight scenarios run at desktop 1280 × 800 and mobile-emulated 390 × 844, for **16 cases**:

1. Old80 mounted maintenance note and real native PNG retain exact text, File identity/metadata and preview bytes after cutover, missing first PCB navigation, retry/stay actions and a completed maintenance read.
2. First Dashboard navigation from a warm old maintenance Document, with only the three hash-pinned experimental extras. Dashboard/server must genuinely not have loaded before cutover; resident module namespace identity is checked without another network import.
3. Old80 mounted PCB settings preserve all seven raw native values and the invalid-width `19` error after missing maintenance navigation. No board/CAD save is performed.
4. Old80 raw-permission denial remains **negative characterization**: the composer unmounts and the unsent note is lost after permissions return. A passing observation is not permission to revoke raw grants safely.
5–6. Candidate cf614 cold maintenance/PCB boot and a completed protected-profile read preserve the draft while the raw fixture remains available, with zero raw-permissions reads.
7–8. Candidate cf614 protected-profile 403 unmounts the editor, but the document-level beforeunload handler still cancels. Same-actor 200 and reopen must restore exact note/native File identity/bytes or all seven raw PCB settings plus the original `1e` validation error. These are strict positive assertions for cf614 only, not rewrites of the f6 negative baseline.

All service calls are synthetic interceptions, including Auth/PostgREST/Storage/Realtime identities embedded in the original build. The harness never forwards them. HTTP and WebSocket allowlists, loopback deny proxy, DNS denial, disabled non-proxied WebRTC, and service-worker blocking remain in force. Every business write and file upload is denied; only the existing synthetic read/lease/presence fixtures are modeled. An unexpected request is a failure, not a reason to widen the fixture.

PCB status uses the scoped unique `label[data-pcb-field-tone] > select`, requires a native `HTMLSelectElement`, and verifies the label's direct text nodes trim to exactly `狀態`. Option text is intentionally excluded from this check; the other six fields keep exact label matching. A JSDOM test uses a real nested label/select/options DOM, not a locator stub. This fixes the initial selector timeout seen in the separate current-client CI; it does not claim those PCB recovery cases have passed.

Current-client 12-case CI is a different test. Its result does not prove this exact80/cf614 pair. No local browser was run while preparing this research. A beforeunload event check is not proof of an OS/native browser dialog. Document RAM is not persistence across reload, sign-out, crash, new tabs or restart; viewport emulation is not a physical mobile-device test. A new index cannot retroactively change an already-open old Document's handlers.

## Suggested separate PR-only job

Add only through a reviewed follow-up PR commit. Do not modify either frozen research job and do not wire this to Pages/deployment. Candidate remains fixed at cf614 even if the harness is committed on a later head; any application change needs a newly reviewed inventory/study rather than silently updating this pin.

```yaml
  exact80_cf614:
    name: Exact80 to fixed cf614 (isolated draft research)
    permissions:
      contents: read
      actions: read
    if: github.event_name == 'pull_request' && github.event.pull_request.number == 49 && github.event.pull_request.head.ref == 'fix/legacy-pcb-protected-reads-20261112' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - name: Allocate private runner paths
        run: |
          echo "EXACT80_CF614_DIST=$RUNNER_TEMP/exact80-cf614-selected" >> "$GITHUB_ENV"
          echo "EXACT80_CF614_EVIDENCE_DIR=$RUNNER_TEMP/exact80-cf614-evidence" >> "$GITHUB_ENV"
          echo "AUDIT_QA_DIR=$RUNNER_TEMP/exact80-cf614-qa" >> "$GITHUB_ENV"
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm install --prefix "$AUDIT_QA_DIR" --no-package-lock jsdom@29.1.1 playwright@1.58.2
      - run: node --test tests/exact80cf614/research.test.cjs tests/exact80/exact80-server.test.cjs tests/exact80/exact80-fixtures.test.cjs
      - name: Obtain only the existing pinned private source input
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          curl --fail --silent --show-error --location --max-time 90 \
            -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/lovableteat/station-status-hub/actions/artifacts/13932556496/zip \
            --output "$RUNNER_TEMP/exact80-cf614-source.zip"
          python tests/exact80/extract-exact80.py "$RUNNER_TEMP/exact80-cf614-source.zip" "$EXACT80_CF614_DIST" tests/exact80cf614/manifest.json
      - uses: actions/checkout@v4
        with:
          ref: cf6142474a7974d6a71ef0679dc549685171c40e
          path: .exact80-cf614-candidate
          persist-credentials: false
      - name: Reuse only identical locked dependencies
        run: |
          cmp package-lock.json .exact80-cf614-candidate/package-lock.json
          ln -s "$GITHUB_WORKSPACE/node_modules" "$GITHUB_WORKSPACE/.exact80-cf614-candidate/node_modules"
      - name: Verify clean pinned source and every output byte
        working-directory: .exact80-cf614-candidate
        run: node "$GITHUB_WORKSPACE/tests/exact80cf614/build-candidate.mjs"
      - name: Verify inputs without launching
        env:
          EXACT80_CF614_BUILD_ONLY: '1'
          EXACT80_CF614_CANDIDATE_DIST: ${{ github.workspace }}/.exact80-cf614-candidate/dist
        run: node tests/exact80cf614/crossrelease.browser.cjs
      - run: "$AUDIT_QA_DIR/node_modules/.bin/playwright install --with-deps chromium"
      - name: Synthetic exact-pair browser observations
        env:
          EXACT80_CF614_CANDIDATE_DIST: ${{ github.workspace }}/.exact80-cf614-candidate/dist
        run: timeout --signal=TERM --kill-after=10s 300s node tests/exact80cf614/crossrelease.browser.cjs
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: exact80-cf614-synthetic-evidence
          retention-days: 3
          if-no-files-found: error
          path: |
            ${{ runner.temp }}/exact80-cf614-evidence/report.json
            ${{ runner.temp }}/exact80-cf614-evidence/*.png
```

The `.test.cjs` safety tests require the explicit `node --test` command. Never upload ZIP/TAR, selected80, candidate source/build output, HAR, traces, storage state or browser cache. Never add this job's private old bytes to a deployment artifact. Do not spoof CI environment variables to launch locally.

Authorized local validation is limited to `node --test tests/exact80cf614/research.test.cjs` with `AUDIT_QA_DIR` pointing to the existing QA tools (JSDOM 29.1.1), build-only compilation, and input verification with `EXACT80_CF614_BUILD_ONLY=1`. The browser branch remains unexecuted until authorized PR CI.
