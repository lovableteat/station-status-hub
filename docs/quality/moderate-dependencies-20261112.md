# Remaining dependency advisory repair candidate

## Safety and base

This candidate was prepared in an independent clone of PR #48 head `21d1e5a211306c8f93999e47d0273151841889a8`, branch `fix/moderate-dependencies-20261112`. At candidate handoff, it had not modified that PR's branch. No push, merge, deployment, production access, credential change, database change, or user-data operation was performed. Test files and temporary filesystem fixtures contain synthetic data only.

This document supersedes only the pending-dependency recommendations in the earlier release-quality report. It does not close the separate deployment, backup, RLS, Storage, history-cleanup, or active-user draft-protection gates.

## Four root advisories, not twelve separate flaws

A fresh full `npm audit --json` on the base lockfile reported 12 moderate affected package entries. Entries such as `typescript-eslint` are propagation from a vulnerable dependency; no advisory was excluded or suppressed.

### Glob cancellation, GHSA-3g3m-2fjr-6pw4

The [official advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) affects glob 9.0.0 through 14.0.1. An async traversal may reject cancellation yet continue background directory reads. Meaningful exploitation requires attacker-influenced glob patterns or directory trees and a caller relying on AbortSignal as a traversal budget; repeated work can exhaust availability. This is not a demonstrated user-data disclosure.

The affected graph was Sucrase's build-time glob and Capacitor CLI's Rimraf glob, not a direct application glob endpoint. Updating Sucrase 3.35.0 to 3.35.1 removes its glob dependency in favor of tinyglobby. Updating Rimraf 6.0.1 to 6.1.4 selects its maintainer-declared `glob ^14.0.3`, resolving to 14.0.5. Both parent updates stay in their original major versions. Glob 7.2.3 remains under legacy archive packages but is outside this advisory's affected range; the package's deprecation is not claimed fixed.

Bounded reproduction using two synthetic directory branches: old glob 11.1.0 performed two directory reads after rejection (five total), while 14.0.5 performed zero after rejection (one total). Ordinary `**/*.ts` discovery also passes.

### Minimatch amplification, GHSA-g3hv-75wg-m249

The [official advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects minimatch 7.x through 11.0.0. A supplied pattern with globstar/parent sequences can amplify intermediate patterns when `optimizationLevel >= 2`, then incur expensive processing. An attacker needs influence over the pattern, not merely the filename being matched.

The only remaining vulnerable consumer after the parent updates was `@typescript-eslint/typescript-estree`. Its `dist/useProgramFromProjectService.js` calls `minimatch(filePath, pattern, { dot: true })` for `allowDefaultProject` patterns, without optimization level 2. The current ESLint configuration does not expose project-service patterns to application users. This reduces the reachable risk but does not remove the vulnerable dependency.

A scoped override selects minimatch 11.0.8 only for that parser package. Its public matching API and dotfile/extension/path behavior are tested. Older major consumers are unchanged. A safe four-segment test with an eight-pattern limit demonstrates the fix: 10.2.6 produces 16 rows despite the limit, whereas 11.0.8 throws RangeError before exceeding it. No large resource-exhaustion payload was executed.

### React Router open redirect, GHSA-wrjc-x8rr-h8h6

The [official advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6) affects versions below 7.18.0, including the existing 6.30.6. Attacker-controlled navigation paths reaching Link/useNavigate/redirect can exploit backslash and mixed-separator URL handling. The [upstream fix](https://github.com/remix-run/react-router/pull/15176) normalizes these cases.

The current app uses HashRouter, not server redirects. Existing navigate calls restore a known displayed Location or prepend fixed `/issues?openIssue=`, `/tools?openSnippet=`, or `/cabinet/` paths. No React Router Link/NavLink/redirect use was found. These facts reduce identified exposure, but neither HashRouter nor the login gate alone proves arbitrary navigation is safe. Cabinet identifiers are not encoded at the sink, so adversarial separator/dot-segment cases belong in regression coverage.

### React Router SSR hydration, GHSA-337j-9hxr-rhxg

The [official advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg) requires attacker-influenced serialized error information reaching SSR client hydration. It applies to Framework Mode or manual SSR in Data Mode, not Declarative Mode. This application starts with `createRoot` (`src/main.tsx`) and uses declarative HashRouter; no RouterProvider, hydrateRoot, or server-hydration entry was found. The current application therefore does not meet this advisory's SSR precondition. The package is nevertheless updated rather than leaving the alert suppressed.

## Narrow Router 7 migration

Pin `react-router-dom` to 7.18.5 and retain the existing imports, HashRouter, routes, guards, and workspace-history architecture. React 18.3.1 and Node 24 satisfy the package's React >=18 and Node >=20 requirements.

Router 7 changes its default route-update scheduling to React transitions. The candidate explicitly sets `useTransitions={false}` on the actual HashRouter, an [upstream-supported option](https://github.com/remix-run/react-router/blob/react-router%407.18.5/packages/react-router/lib/dom/lib.tsx#L861-L943), to retain the previous direct state-update path. This does not force global synchronous rendering, call flushSync, or disable every React transition. It avoids adopting that timing change along with the security patch.

The high-risk compatibility surfaces are the existing earliest popstate interception, PreparedRoutes' displayed-location restoration, late lazy-import results, latest dirty-state approval, and native hash/history traversal. A successful type check or audit alone does not validate them.

## Validation and remaining release gate

The candidate resolves the audit to **0 vulnerabilities** across the complete npm graph, with no omit flag or severity suppression. This is a point-in-time advisory result, not proof of absence of all security defects.

- Dedicated dependency tests: 5/5, including the two bounded security reproductions, matching semantics, installed-version checks, retained HashRouter timing, bounded Rimraf deletion with a retained neighbor, and Sucrase transpilation.
- Full unit/source suite: 2,309 total, 2,301 passed, 8 existing skips, 0 failures.
- Typecheck: passed. Lint: 0 errors and 72 existing warnings.
- Production build with synthetic local Supabase settings: passed in 36.10 seconds; existing chunk-size/WASM warnings remain.
- Existing deployment-recovery browser fixture bundles against the new Router successfully. This build-only check is not a browser run.

- Actual-Router jsdom compatibility tests: 11/11, repeated successfully. They retain the actual PreparedRoutes, Router, workspaceHistory, lazy recovery and guards. Coverage includes query/hash deep links, replace/Back/Forward, slow/failed/stale navigation, retry/cancel, the latest dirty state, native hash, early popstate interception, and 24 adversarial navigation inputs. Fixtures assert no network calls or Storage writes and retain pre-existing synthetic bytes.
- Full audit integration suite: 128/128 passed, including the new 11 cases.
- `npm ls --all` still reports four invalid peer relationships: jspdf-autotable 5.0.2 expects jsPDF 2/3 but the project uses 4.2.1; react-day-picker 8.10.1 expects date-fns 2/3 but the project uses 4.1.0; react-gantt-chart 0.3.0-rc.11 expects React/ReactDOM 17 but the project uses 18.3.1. For all four, the consumer version, peer range, and installed version are identical in the base commit's lockfile. No new peer conflict was introduced by Router 7. This is why the existing legacy-peer-deps install mode remains; the peer backlog is not claimed fixed.

Real-browser history/dirty-draft coverage and remote CI must run against the final combined commit before promotion. The prior PR #48 browser/CI success is evidence for its old dependency graph, not evidence for this migration. This report alone does not authorize publication or deployment. The subsequent parent-authorized integration uses the existing dedicated PR branch only; production remains unchanged.

## Integration and rollback

Only package.json, package-lock.json, a HashRouter option/comment, dedicated tests, and this report are changed. No existing business-data persistence code or schema is modified. Keep the candidate isolated until review and the remaining checks are satisfied. If rejected, leave it unapplied. If reverting after a later authorized merge, revert the code commit and reinstall the resulting npm lockfile without touching database, Storage, or local drafts. Such a revert restores the older advisories and must be disclosed.


## Integration cross-review

The candidate was cherry-picked without conflict onto the already-green applied-migration synchronization baseline `d16842cada9b74cfc9f86e3697c0e30b29f7529f`. That baseline passed [release quality](https://github.com/lovableteat/station-status-hub/actions/runs/43127330906) and [isolated regression](https://github.com/lovableteat/station-status-hub/actions/runs/43127330864); those old-graph results do not validate Router 7. The published production four-RPC migration and daily-stats v13 remain unchanged. No frontend deployment, hosted migration, object change or history rewrite is part of integration.

Independent checks on the combined local tree confirmed the full npm graph has zero reported vulnerabilities, the five dependency and eleven actual-Router jsdom checks pass, and all four known peer mismatches match the original lockfile exactly. The combined unit/source suite passed 2,306/2,314 with eight existing skips, integration passed 128/128, typecheck passed, lint reported zero errors and 72 existing warnings, and the synthetic-settings build passed in 34.41 seconds. Its 155 JavaScript assets contain no materialRequestSeed name/reference. These final local counts include the new browser-fixture build contract. The existing bounded cross-release browser step now includes 20 additional actual AuthenticatedApplication/PreparedRoutes scenarios across real-CSS 1280px and 390px viewports, with genuine delayed/404 dynamic imports, latest-state dirty approval, stale completion, cancel, Back/Forward/native hash, original UTF-8 draft and DOM-node preservation, and zero persisted writes or service access. All original browser assertions remain. The new browser source builds successfully and its five focused jsdom smoke checks pass, but actual Chromium outcomes still require the new exact-head CI run. Publication remains a dedicated draft-PR operation for isolated CI, with the old-tab/draft and remaining production gates intact.

The first combined remote head `20dbd1b` passed release quality, including zero audit vulnerabilities, 2,306/2,314 unit checks (eight existing skips), 128 integrations and 17 SQL checks. Its Chromium run completed the ten new 1280px routing scenarios and every existing browser suite, then the first new phone scenario correctly failed its hard viewport assertion: 406px instead of 390px. The fixture's own 16px body margin conflicted with the real stylesheet's full-width body/root. Only that synthetic fixture now uses zero margin plus border-box inner padding; production CSS, all 20 scenarios and the 390px assertion remain unchanged. A source contract prevents both margin regression and overflow clipping as a workaround. The corrected commit still needs its own complete CI result.

Head `9cf6313` then passed both CI workflows and all 20 actual-Router scenarios. Artifact review found a narrower evidence gap after the scenarios: the three phone deep-link screenshots had widened to 474px after rendering a long synthetic encoded URL, while the other 17 screenshots had the intended dimensions. The viewport stayed at 390px and passed assertions both before and after the interaction; viewport width alone could not catch the larger document scroll width. The fixture is therefore being hardened with natural wrapping for its diagnostic output, preserving both viewport checks and adding final document/body scroll-width assertions and measured-width reports for every case. This is test-only layout and evidence work, not a production CSS or routing change; no browser assertions are removed or relaxed. The next exact-head run and its screenshots must validate the full phone width before final sign-off.
