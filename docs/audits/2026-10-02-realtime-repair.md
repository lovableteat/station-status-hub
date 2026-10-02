# 2026-10-02 UI audit repair

Base: `933c1753f60bddb2ca6a50d2bdea611ae92d561d`. Fresh isolated Windows checkout; no pre-existing user changes were overwritten. No production database writes, migration execution, permission changes, audit-data deletion, merge or deployment were performed.

## Evidence and changes

| Audit observation | Code evidence and repair | Verification |
| --- | --- | --- |
| B01 project switches back; dashboard takes over 90 seconds | Project directory refresh depended on selected project and could restore its captured selection. Directory loading also gated the station data effect, recreating subscriptions and initiating full reads. Selection now updates its ref immediately; directory reads use account/sequence/selection guards; background reads do not gate the screen. Summary fallback is detached from readiness. Bursts coalesce into serialized directory refreshes. | Deferred directory missing the newly selected project cannot undo selection; 20 event bursts produce one refresh. 20 rendered clients retain scoped incremental subscriptions. Production latency attribution remains unmeasured. |
| B02 late machine metadata overwrites typed fields | Dialog initialization replaced the whole form after several metadata reads. Track edited fields, merge late hydration into untouched fields, capture opening defaults, and reject cancelled-machine reads. | Deferred hook test and actual Chrome: typed model survives delayed metadata. |
| B03 chat launcher covers create-project submit at 1180×757 | Detached chat dock used z-index 84 while Sheet/Dialog uses 50. Dock now uses 40. Chat remains available when the modal closes. | Actual app, actual launcher and project Sheet in local Chrome, mock identity/backend; inspect geometry and click target at the overlap. |
| B04 negative flow minutes | Save handlers had no finite/nonnegative check. Station duration accepts zero; individual item minimum remains one minute. | Negative, infinity and minimum-boundary regression cases. |
| B05 selected issue priority differs between detail/list | Creation omitted `priority_manual`, so list aging logic superseded the chosen priority; editing already set it. Creation now marks the explicit choice as manual. | Real create handler for all four priorities, resolved through existing list priority function. |
| B06 BOM Qty -2 | This field describes per-product BOM usage, not stock adjustment; numeric negatives/nonfinite values were accepted. Reject these at form and save-handler boundaries while retaining fractional positive values and text placeholders such as AR and `-`. | Boundary cases; historical records/imports are not rewritten. No server constraint added. |
| B07 Data-center crashes and loses navigation | `RackInspector` referenced undeclared `scrollMode`. Declare and default the prop. Project manager also assumed arbitrary JSON was a valid document; load/selection previously overwrote any invalid document with defaults. Validate required scene structure, preserve malformed/unsupported documents, initialize only explicit `{}` with version CAS, show recovery error/retry, and isolate workspace/3D rendering errors. | Real inspector desktop/mobile render; actual Chrome desktop/mobile; damaged-document zero-write tests; empty-placeholder edit/view tests. |
| B08 PCB moved U1 loses unsaved position through Home | Existing browser unload guard did not cover SPA workspace navigation; dirty state was lost on unmount and remote hydration could replace a draft after await. Add cancellable SPA navigation, owner-scoped recovery separate from explicit saved data, preserve dirty revision on recovery, and recheck dirty state after remote read. | Hook tests plus actual Chrome U1 drag (30,40 → 42,46), cancel leave, confirm leave, Home return; position preserved and still unsaved. |

Additional safeguards within the synchronization scope: idempotent UPDATE-before-INSERT handling, duplicate suppression, per-row event clocks including DELETE tombstones, replay events received during snapshot reads, late account/project/flow response rejection, channel/timer cleanup, subscribe-gap/focus/online recovery, and bounded abortable reads. Live synchronization stays enabled. Dashboard completed-item progress calculations and unresolved-issue completion protection are unchanged.

Data-center autosaves are serialized, send trailing edits, and compare the existing `updated_at` on writes. Remote document changes preserve dirty drafts and stop conflicting writes; clean views also accept events from another session of the same user. Metadata-only changes advance the save version without discarding drafts. Reload requires confirmation before replacing a dirty draft and retains a local backup. Permission refresh is account scoped and rejects late responses from another account; an open-page downgrade cancels pending saves. Existing RLS and role intersections remain authoritative.

## Actual checks

- New audit regression: **16/16 passed** across three `audit*.integration.cjs` files. These render real hooks/components with controlled Supabase responses, deferred requests and event order. Twenty clients are simulated, not real production users.
- Existing full suite: **1,021 total, 1,009 passed, 12 failed**. The exact same 171-file manifest against the pristine base also gives **1,021 / 1,009 / 12**. No original tests were deleted. The manifest is adjacent to this report.
- Preliminary counts used different selections: 995 / 982 / 13 was an intermediate manual selection during repair; one failure was the source-pattern test still expecting `!user` after the implementation adopted `!userId`. Its assertions now enforce the same signed-out guard, plus a rendered 20-client sign-out test asserts zero backend reads and removed channels. The 984 / 972 / 12 run covered tests-directory files and omitted 37 cases in `src`. The final manifest includes all matching test files in both directories; compare final with final baseline, not unlike selections.
- Isolated PostgreSQL/PGlite: **101 organization/RLS checks + 53 submission checks passed**. Existing migrations executed locally with real PostgreSQL roles, RLS and pgcrypto; includes employee/chief/director/admin access, locked scopes, inactive admin, stale versions, return feedback and resubmission. These scripts were not modified.
- Production bundle: passed. Existing large-chunk/browser-externalization warnings remain.
- App typecheck: **35 diagnostics remain**, down from 770 at the base after correcting the Supabase schema generic (`__InternalSupabase` is metadata, not a schema). Full typecheck is **not green**. Node config typecheck passed. Residual diagnostics are recorded in the evidence bundle; the previously reported 36 included the Data-center timer handle type, now corrected.
- Full lint: **99 errors, 38 warnings**, exactly matching the pristine base; no new rule/message pair. Lint is **not green**.
- `git diff --check`: passed.

The 12 unchanged failing tests are: admin control-room responsive dialog contract; environment-ignore contract; PCB editor filtered-color contract; performance persistent-filter contract; three performance workflow-completion UI contracts; header semantic-color contract; Test_Plan project scoping contract; two progress/issue completion UI contracts; personal-avatar UI contract. Full comparable logs contain their exact assertion names and source locations.

## Reproduction and CI

Use Node 24. Install application dependencies with `npm ci --legacy-peer-deps` (the existing jsPDF/autotable peer conflict requires this). In an external QA directory install `react@18.3.1`, `react-test-renderer@18.3.1`, and `@electric-sql/pglite@0.5.8`; set `AUDIT_QA_DIR` to its absolute path, then run:

```sh
node --test tests/audit*.integration.cjs
node tests/performanceOrganization.integration.mjs "$AUDIT_QA_DIR/node_modules/@electric-sql/pglite"
node tests/performanceSubmission.integration.mjs "$AUDIT_QA_DIR/node_modules/@electric-sql/pglite"
npm run build
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run lint
```

`audit-regression.yml` runs the focused regressions, local PostgreSQL checks and build on PRs with read-only repository permission and mock environment values; it does not deploy. The existing GitHub Pages deployment listens only to `main` pushes. Draft PR publication on the repair branch does not merge to main.

CI correction: the initial PR-only query missed push run `37016532187` at head `3ab3a95`. GitHub's annotation confirms a pre-job workflow validation failure: job-level `env` cannot resolve `runner.temp` (line 12), so no test or build ran. Set the QA path in a step via `RUNNER_TEMP` and `GITHUB_ENV` instead. Subsequent CI evidence must query all event types for the exact head, including failed runs with zero jobs/check-runs; an empty PR-only result is not evidence of no CI failure.

The isolated audit job also listens to pushes on the exact repair branch so corrected workflows can be verified without a merge, deployment, permission change, or production environment. This trigger is limited to `repair/audit-20261002-realtime-drafts`; the production workflow remains unchanged.

## Remaining verification limits

No real 20-user end-to-end/concurrency load, production latency measurement, production realtime transport interruption, or authenticated cross-role browser session was performed. Browser QA used localhost with mocked backend; the chat fixture also supplied a mock identity provider outside application source. Real realtime socket connections were intentionally unavailable there; console connection-refused messages are recorded, not treated as transport success. PostgreSQL access checks are isolated and do not establish the deployed database/schema state. Data-center asset import and damaged binary models were not comprehensively exercised. Draft recovery depends on available local storage. Numeric validation is in the client, not a new database constraint. Keep all `AUDIT_TEST_20261002` production audit rows for later authorized regression.
