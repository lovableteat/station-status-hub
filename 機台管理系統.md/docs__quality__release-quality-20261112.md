> 集中副本；原始路徑：`docs/quality/release-quality-20261112.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Release quality repair, 2026-11-12

## Scope and operating-data safety

Prepared on `fix/release-quality-20261112`, based on `e862d7d989bb09e00698d1b7291f3d586aff4c87`. This is a local repair only. No branch was pushed, no deployment was run, and no production configuration, database, Storage object, user attachment, or operating history was changed. All executed integration tests used synthetic in-memory data or a local PGlite database.

This report records the release-quality source branch before integration. The SQL/Edge security proposal, private-attachment compatibility, and public seed-data removal were separate changes at that point. The combined isolated branch and its final checks are documented in [the integration report](./docs__security__integrated-repair-20261112.md). Do not describe the release-quality change alone as closing all data exposure.

## Changes

- Align the BOM project-label, legacy L10 navigation, and flow-height contract tests with the existing main implementation. The flow height is now provided by `maintenanceShell.css`, rather than an inline Tailwind class. Keep the underlying content and navigation assertions.
- Repair the existing 121 ESLint errors with explicit types, generics, scoped switch declarations, equivalent Unicode spelling, and `const`. Keep the rules active. Retain the exact XML control-character rejection regex, with one narrowly documented lint exception.
- Update compatible dependency ranges and the npm lockfile, including Capacitor 7.6.10, DOMPurify 3.4.17, Vite 6.4.6, React Router 6.30.6, and Tiptap 3.33.1. Remove the unused root Zod dependency. ESLint and typescript-eslint stay on their existing major versions.
- Disable the new Tiptap `trailingNode` default so opening and saving existing content does not silently append an empty paragraph.
- Add real-library regression coverage for rich-text HTML/JSON round trips, prototype-pollution prevention, sanitization, Excel formulas/styles/conditional formatting, and PPTX embedded image bytes.
- Make Pages wait for the same-commit reusable quality workflow. Run lint, type checking, all unit contracts, high/critical advisory checks, anonymous-access tests, and integration tests before build/deploy. Use Node 24 and `npm ci --legacy-peer-deps`. Install isolated QA dependencies before tests that use the render harness. Production build settings and deployment retry semantics are unchanged.

## Narrow dependency overrides

- `brace-expansion@<2`: 1.1.22, patched within its existing major.
- `postcss-selector-parser@6.0.10`: 6.1.6, patched within its existing major.
- `exceljs > uuid`: 11.1.1. ExcelJS uses the CommonJS `v4` API; the test exercises that API plus workbook round trips and conditional formatting.
- `pptxgenjs > image-size`: 2.0.4. This prevents retaining the vulnerable transitive package. PptxGenJS's shipped browser bundle excludes this helper; actual PPTX text/image generation and original embedded bytes are tested.
- Existing Rollup 4.59.0 override is retained.

Do not replace these with an unreviewed `npm audit fix --force`.

## Verified locally

Node 24.22.1, npm 11.9.0, clean `npm ci --legacy-peer-deps --ignore-scripts --no-audit`.

- `AUDIT_QA_DIR=/tmp/station-release-qa npm test`: 2,209 tests, 2,201 passed, 8 existing skips, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: 0 errors, 71 existing warnings. The warning backlog is not claimed fixed.
- `AUDIT_QA_DIR=/tmp/station-release-qa node --test tests/audit*.integration.cjs`: 105/105 passed, including the three new real-library cases.
- `node tests/anonymousExposure.integration.mjs "$AUDIT_QA_DIR/node_modules/@electric-sql/pglite"`: 138/138 passed.
- `NODE_OPTIONS=--max-old-space-size=4096 VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=isolated-test-key npm run build`: passed in 35.46 seconds. A prior concurrent build was killed with exit 137; the isolated rerun passed. Existing large-chunk and WASM browser-externalization warnings remain.
- `git diff --check`: passed.

The optional `tests/auditRichText.browser.cjs` uses the real application component with only synthetic content, blocks non-local requests, and covers opening content, repeated modal cancellation, editing, undo/redo, and table rows. Its syntax checks passed, but the local Chromium process was blocked before opening a page because the environment denied its Unix socket. No browser result is claimed. On an authorized browser-capable runner, install Playwright 1.58.2 and Chromium in the isolated QA directory, then run `AUDIT_QA_DIR=... node tests/auditRichText.browser.cjs`. `AUDIT_CHROMIUM_PATH` can select an existing authorized Chromium installation.

## Remaining advisories and limitations

The npm advisory snapshot changed from 35 affected packages (3 critical, 20 high, 9 moderate, 3 low) to 12 affected packages (0 critical, 0 high, 12 moderate, 0 low). These counts include transitive propagation, not 12 independent root flaws.

- `glob`: [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), post-timeout traversal; and `minimatch`: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), glob amplification. These propagate through build/lint tools. Patches require further major-version compatibility work.
- React Router 6.30.6 still reports [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), backslash open redirect, and [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg), SSR hydration constructor injection. Upgrading to Router 7 requires a separately verified routing/history migration. This app currently uses a client-side HashRouter, not SSR hydration, but the package advisories remain and are not suppressed.
- Existing `bun.lock` and `bun.lockb` were not regenerated. This repair is verified only with the documented npm installation and npm-based CI. Do not use the old Bun lockfiles as an equivalent security-verified install.
- No remote CI run exists for these local changes while publishing is paused. Existing Docker PostgreSQL/Deno and browser suites were not all rerun here. Native Android/iOS builds were not run.
- Main branch protection/rulesets are not changed. A reusable workflow dependency protects the normal Pages path, but is not a substitute for a repository-level required check.

## Integration and rollback

Review and combine this commit with the separately prepared data-exposure fixes in an isolated branch. Add the backend proposal's PGlite regression command only when that test file is included. Rerun applicable tests and build on the final combined commit. Keep production operations paused until the deployment scope is safe and authorized.

This patch contains no database migrations, data deletes, or history rewriting. Before publication it can simply remain unapplied. If a code rollback later becomes necessary, revert this commit as an ordinary reviewed Git revert and reinstall from the resulting npm lockfile; do not reset or delete database/Storage data. Reverting also restores the old vulnerable packages and weak deployment gate, so prefer a targeted compatibility fix over reverting security patches wholesale.
