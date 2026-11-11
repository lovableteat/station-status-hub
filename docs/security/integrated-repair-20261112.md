# Isolated security repair integration

Prepared on 2026-11-12 Taipei time (2026-11-11 UTC). This is **isolated preparation, not a production release**. No merge to remote main, deployment, production database/Storage change, credential change, or history purge was performed. Dedicated-branch publication and draft-PR CI do not authorize deployment. Production exposure must not be described as resolved by this preparation.

## Base and integration

Remote `main` was checked read-only before and after integration and remained `e862d7d989bb09e00698d1b7291f3d586aff4c87`. The isolated branch is `fix/security-integrated-20261112`.

Before draft-PR publication, a later check found `main` advanced to `a30615e6a0dbecbd76119b821e58960924257491` (maintenance interaction/operation feedback). That commit was merged locally without dropping its changes. One `MaintenanceDetail` conflict was resolved by preserving the new loading/success feedback and using the private HTML renderer for legacy content. Its workflows did not change. Final CI must cover this refreshed combined tree, not only the original baseline.

Integrated source changes:

- Backend proposals: `9253fa4c58fe19d4eb88db9d1ed62ca8148fb5cc`.
- Private attachment compatibility: `35a99daa657e36c9e862a185424c3ab3c7e6e3a8` and `fbf530e636fb172e5a9133f6fe46aaca91b10aa6`.
- Release quality/dependency repair: `f7f29b542edf29aa09a9b59cfc0a2f16be4fb9b8`.
- BOM removal patch prepared against the same base, with the seed file removed separately after identity verification.

The original repair sources had no merge conflicts (the later main refresh had the `MaintenanceDetail` conflict noted above). The rich-text editor merged automatically; both the private-image NodeView and `trailingNode: false` were retained and exercised by tests. The backend PostgreSQL proposal test was added to the same-commit release quality workflow.

## Data preservation boundaries

- Only the isolated checkout's `src/data/materialRequestSeed.json` was removed. Its blob was `69034c641b915fbb787a9730596c772a2463945b`; SHA-256 was `9ad6a151fdf2df28bcdb38aa116256da1507abae3dfdee3ca08cd1aa5e5d56fe`. Bytes matched the still-recoverable local baseline Git object before removal. This is **not a verified backup of remote history, the operational database, or Storage files**.
- No cloud BOM, tracking history, record ID, attachment path, original attachment byte, localStorage, or IndexedDB item was deleted or rewritten.
- Empty BOM directories now produce an in-memory placeholder rather than loading the business-data seed or automatically saving a replacement. Existing remote read/merge/persistence paths remain intact. Legacy local additions/updates remain recoverable in the placeholder without background upload.
- The legacy default BOM identifier is intentionally retained for compatibility. Removing the dataset does not mean every historical identifier, old Git object, cached asset, fork, or downloaded copy has disappeared.
- SQL remains under `docs/security-proposals`, outside automatic migrations. Only local synthetic databases executed those proposals. Each test verifies that applying all three proposals leaves synthetic business rows and Storage object records byte-for-byte unchanged; this is not a production restore test.

## Cross-review corrections

Independent cross-review found two additional display problems and the integrated change fixes both:

1. The editor lightbox previously copied the temporary signed DOM URL, so it did not refresh or clear with sign-out. It now keeps the durable image reference and resolves it through the shared signing hook. Display-only metadata never enters saved HTML, JSON, or undo history.
2. Timers and source/node updates previously could re-sign after sign-out during the frontend-first transition. All three display paths now remain suspended after sign-out or a null-session Auth event, until an Auth event supplies a session. Regression tests cover timer ticks, source/HTML/node changes, sessionless events, and re-login.

The initial renderer can still attempt signing before the first Auth event. Server-side private bucket/RLS rules, not frontend state, are the authorization boundary. A copied signed URL may remain usable from CDN cache even after token expiry; [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) treats cache TTL separately. Downloaded files cannot be recalled. Do not promise a five-minute access cutoff or delete original objects as a cache-clearing shortcut.

## Local verification

Node 24.22.1 and npm 11.9.0. The combined branch uses the source release branch's already clean-installed dependencies, with the identical committed npm package manifest and lockfile. Tests used synthetic fixtures and dummy/local service settings, never production credentials.

- Full unit/source suite: **2,238 total, 2,230 passed, 8 existing skipped, 0 failed**.
- Render/request/dependency integration suite: **105/105 passed**.
- Existing anonymous-exposure integration: **138/138 passed**.
- Added staged-security PostgreSQL suite: **6/6 passed on PostgreSQL 17.5 and 6/6 on 18.3** through PGlite.
- Typecheck: passed for application and Node configuration.
- ESLint: **0 errors, 71 existing warnings**.
- Fresh npm audit: **0 critical, 0 high, 17 moderate** affected packages. The earlier source-branch report recorded 12 moderate; the current audit reports additional transitive toolchain propagation. The remaining advisory families are glob/minimatch and React Router. No forced major-version upgrades or advisory suppression were used.
- Production build with isolated Supabase values: passed in **37.85 seconds**. Existing large-chunk/WASM warnings remain.
- Output scan: 155 generated JavaScript assets, no seed name/chunk or synthetic fixture, and no matches for 30 distributed original record-ID samples. This is a bundle check, not a history/CDN purge.
- Workflow YAML parsing, browser-script syntax, and `git diff --check`: passed.
- The updated rich-text browser fixture bundles successfully with a synthetic Supabase client and no real service access.

## Remaining verification boundaries

- Local browser execution is unavailable. Authorized GitHub CI now runs real Chromium against synthetic local fixtures; its results and screenshots are described below. These are browser emulation results, not checks on the user's operating machine, physical mobile devices, or live service.
- Hosted Storage signing/CDN behavior, current users' open tabs, full database/object backup and restore, and production health were not tested by this integration.
- Docker and Deno are unavailable locally; the dedicated-branch CI now runs their isolated permission-concurrency and endpoint tests. Native Android/iOS builds were not run. Bun lockfiles remain unverified.
- The initial local integration had no remote CI result. Subsequent dedicated-branch draft-PR runs must be checked against their exact commit; local checks do not substitute for those results or repository required checks.
- All public/history cleanup is still pending. The integrated branch deliberately retains ordinary Git ancestry, including recoverable old objects. Do not publish it as a history-sanitized repository.

## Safe future cutover order

The current no-production-change restriction remains in force. The following is a plan, not authorization to execute it:

1. Confirm the production change scope/window, current branch drift, remote CI, and an isolated database restore plus separate Storage-object restore. Capture fresh configuration recovery material privately. Do not confuse metadata snapshots or the preserved source blob with complete backups.
2. Verify current cloud BOMs and any legacy local-only work have known recoverable sources. Do not empty browser storage or overwrite operational data to reconcile a snapshot.
3. Verify actual active Auth sessions, including already-open clients. Arrange draft saving and safe reload without forced loss of unsaved work.
4. Release and exercise the compatible frontend first: existing BOMs, old public attachment references, inline images, lightboxes, histories, tools, upload/download, and cross-account collaboration. Confirm the new build no longer ships the business-data seed.
5. Separately apply the reviewed backend stages in order: anonymous ACL/RLS closure, RPC identity binding, then the two private attachment buckets after client readiness. Verify each stage with authorized read-only checks. The proposals use short transactions/timeouts; policy creation is not blindly repeatable. Inspect an uncertain outcome before retrying.
6. Deploy the service-credential-gated daily-stats function only after verifying its callers. The observed database cron calls the SQL function directly; do not invoke cleanup or recomputation as a live probe.
7. Verify anonymous rejection, ordinary authorized workflows, and Storage/CDN/cache behavior without deleting objects. Do not automatically reopen public access on a compatibility issue; use a targeted fix.
8. Handle Git history, old build artifacts, caches, forks, and external copies as a separately scoped operation after exact targets and recoverability are established. Never delete operating database/audit/history rows to clean repository history, and never restore an old database over current user work.

Related details: [backend proposals](../security-proposals/README.md), [private attachment rollout](private-attachment-rollout.md), and [source release-quality report](../quality/release-quality-20261112.md).

Deeper SQL review and promotion restrictions are recorded in [migration promotion and safe cutover](../security-proposals/migration-promotion.md). That follow-up adds drift preconditions, explicit replacement RPC revocation, scoped creator defaults, preserved unrelated-bucket policies, and executable rollback/replay tests.

After refreshing from `a30615e`, the full local unit suite passed **2,231/2,239 with 8 existing skips and no failures**. Typecheck passed; lint reported **0 errors and 72 warnings** (the added Fast Refresh warning is in upstream `MaintenanceFeedback.tsx`). The refreshed production build passed in **34.67 seconds**. The expanded PostgreSQL security/cutover suites passed **15/15 on both PostgreSQL 17.5 and 18.3**. These refreshed results supersede the earlier local counts where they differ.

Final independent local work added daily-stats failure-path coverage: missing service configuration, RPC errors, client exceptions, default/configured schema, no-store responses, and absence of credentials/private error text in responses or logs. The Edge handler suite passed **9/9** using the actual handler with synthetic dependencies; this is not a Deno runtime result. The final full unit suite passed **2,238/2,246 with 8 existing skips and no failures**, and the refreshed integration suite passed **105/105**.

## Dedicated-branch CI

The authorized public dedicated branch was published as commit `ed7cb6d61dce51c32756e262eba3aa3f789a9ac6`, with parent `a30615e6a0dbecbd76119b821e58960924257491`. Its tree `0bd7bea3fa465d1528545c2201392b3120e30eeb` exactly matches the locally tested tree. Publication used a single new commit rather than uploading intermediate local repair history. This does not remove existing public ancestry.

[Draft PR #48](https://github.com/lovableteat/station-status-hub/pull/48) targets main but is not merged. The initial [release quality run](https://github.com/lovableteat/station-status-hub/actions/runs/43080835346) passed. The initial [isolated regression run](https://github.com/lovableteat/station-status-hub/actions/runs/43080835343) passed real PostgreSQL 17.4 permission/revocation tests, Deno 2.1.4 account-admin contracts, and PostgreSQL workflow/RLS suites, then failed before browser tests: `ubuntu-latest` resolved to 26.04, unsupported by pinned Playwright 1.58.2. The browser runner is now pinned to supported `ubuntu-24.04`, with a source regression test; the new commit still requires its own complete CI result. No production deployment or database/Storage change occurred.

The runner correction (`51bb9cf`) passed the release quality gate again and successfully ran real Chromium history/cancellation checks. The next browser check exposed a real compatibility problem: the Lightbox portal makes sibling application content inert, including the custom close control formerly rendered outside the portal. The same styled/named control now lives in `render.buttonClose`, inside the modal. The browser assertion still clicks it by accessible name and checks desktop/mobile viewports; it does not force-click an inert element or skip the failure. Existing attachment references and editor content remain unchanged.

The PR also adds a loopback-only Deno 2.1.4 daily-stats endpoint fixture using the existing frozen dependency lock. It tests exact service-key authorization, zero backend calls on rejection, schema/RPC behavior, missing configuration, sanitized failures and no-store responses. Local syntax/lint and the nine existing handler tests passed; runtime results must come from the new CI run. Only synthetic browser screenshots/results are retained as a three-day CI artifact for visual review.

Subsequent exact-commit runs confirmed the daily-stats Deno fixture, preview sign-out/in and close, document cancellation/edit/undo/redo, permission-dialog layouts, and phone/tablet command/dock/toast assertions. They also exposed a second editor compatibility issue: the newer Tiptap hook no longer rerenders by default for selection-only transactions, so the table toolbar did not appear when clicking into a cell. `shouldRerenderOnTransaction: true` restores the existing toolbar contract without writing document content on selection.

The regression harness now owns its Vite process directly instead of leaving an `npx` grandchild after successful phone checks. Independent browser commands continue after a prior failure and have bounded runtimes; failures still fail the job. BOM fixtures explicitly use matching synthetic V2/V3 fields (11 tracking matches, one changed group), open phone detail drawers for hidden fields, and locate the selected workspace control rather than expecting its label to exclude the version badge. These corrections retain all no-write, preserved-local-storage, and seed-absence assertions. Full green CI on the final commit is still required; partial earlier successes are not a completed release.

Later checks also retain the current UI's expanded-location control and phone tools drawer rather than assuming all merged BOM references or version controls are always visible. The short-landscape fixture now supplies the current maintenance RPC payload and tests the current four navigation entries, all four screen sizes, real touch scrolling, report dismissal and unchanged synthetic database contents. Controlled report dialogs explicitly return focus to their actual opener on dismissal, preserving keyboard continuity and the existing dialog-exit cleanup without scrolling or changing saved data.

At commit `c6b4376`, the release quality gate passed, with 2,244/2,252 unit/source checks passing and eight existing skips in the regression job. All 105 integration checks, PostgreSQL/Deno suites, private-rich-text interactions, phone shell checks and build passed. Remaining browser failures identified stale BOM selectors and an actual narrow-container scroll-chain problem: the more specific list-panel rule restored `overflow: hidden` while retaining `overscroll-behavior: contain`, preventing page swipes begun on its filters or rows. The narrow-container override now restores visible overflow and page scroll chaining while retaining desktop inner scrolling. Browser tests retain real touch gestures, actionability, no-write and original-data assertions; the next exact-commit run must validate the correction before full CI can be called successful.

Commit `375757f` passed both BOM browser suites and all maintenance interactions at 568×320, 844×390 and 1440×900. The remaining 320×568 check exposed the same scroll-chain issue at the body level: the existing maintenance-only `overflow-x: clip` rule applied only to short landscape screens. That rule now covers every mobile/tablet maintenance viewport below 1024px, preserving the existing short-landscape navigation rules and leaving other workspaces unchanged. The browser fixture verifies computed body overflow before and after dialog dismissal and keeps the original real-swipe assertions. Its release-quality run passed 2,245/2,253 unit/source checks with eight existing skips, zero lint errors (72 warnings), and zero high/critical advisories; the fresh CI registry reported 12 moderate affected packages, rather than the earlier local audit's 17. Glob/minimatch toolchain advisories and the React Router major-version upgrade remain separate follow-up work; neither count means all advisories are resolved.
