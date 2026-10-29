> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-12-comparison-workspace.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Comparison Workspace Implementation Plan

> **For agentic workers:** Use focused parallel agents for the Python runtime and website integration; parent implements the React interface and validates the combined workflow.

**Goal:** Add the user's complete AutoCheck workflow as a styled and working website workspace.

**Architecture:** Preserve the Python engine in a browser Web Worker and adapt only its file/report boundary. React uses the site's shared components. Local account-scoped IndexedDB stores results, replies and artifacts.

**Tech Stack:** React, TypeScript, existing shadcn components, Python AutoCheck, Pyodide 0.29.3, IndexedDB, existing JSZip.

## Global Constraints

- Keep source ZIP and existing user changes intact; no real review DB or schematic source in public assets.
- No original engineering inputs uploaded to external services.
- Shared site tokens and AGENTS filter rules apply.
- Reuse `ai-chat` access for comparison UI and preserve its revocation behavior.

### Task 1: Python engine boundary

Files: `public/comparison/engine/`, `public/comparison/autocheck.worker.js`, `public/comparison/browser_bridge.py`, `tests/comparison/`.

- [x] Selectively import Python/config source; record origin and exclude private artifacts.
- [x] Validate Pyodide packages with actual imports before integration.
- [x] Expose run, tracker-with-replies, library-read/write and datasheet-suggestion commands; preserve actual original pipeline/report APIs.
- [x] Return structured results and transferable binary artifacts; report individual output failures without reporting complete success.
- [x] Run original synthetic tests and end-to-end report generation in the runtime.

### Task 2: Website navigation

Files: `src/pages/Index.tsx`, layout header/dock/entrance previews as required, permissions/collaboration labels, docs/filter-ui-audit.md.

- [x] Add `comparison` URL workspace route, catalog/home/dock entry and lazy page guarded by existing `ai-chat` permissions.
- [x] Verify direct route, navigation, permission denial and mobile overflow behavior with existing tests.

### Task 3: React workflow and local persistence

Files: `src/components/comparison/{ComparisonWorkspace.tsx,comparison.css,types.ts,files.ts,runtime.ts,storage.ts}`, meaningful behavior tests.

- [x] Implement validated A/B directory/multifile input and optional files; block missing netlists and show source inventory.
- [x] Implement worker progress, cancellation, errors and completed result UI.
- [x] Implement fixed filters and visible reversible chips, tracker detail/replies/history, original charts, device library and report downloads.
- [x] Implement validated account-isolated IndexedDB backup/restore; keep replies across reruns using original stable tracking keys.

### Task 4: Delivery

- [x] Focused tests, scoped lint, typecheck and production build.
- [x] Real browser synthetic-input full flow and desktop/narrow-desktop/mobile visual verification.
- [x] Review source privacy boundaries and prepare the scoped release; no database migration or production-data write.
- [x] Commit/push and confirm Pages deployment; `b5404fc1` build/deploy succeeded in run `38277313317`; 40 engine hashes, the worker/bridge and four artwork assets match the live site.

## Verification snapshot

- Original engine synthetic suite: 136 passed, 15 company-data tests skipped.
- Actual Pyodide protocol suite: 4 passed, including reports, reply export, library signing, datasheet extraction, corrupted PDF fallback and formula-neutralization boundaries.
- Comparison/navigation/PCB integration and chart keyboard boundaries: 40 passed. Scoped lint, typecheck and production build passed.
- Full website suite before the two added keyboard checks: 1142 passed, 7 failures reproduced in the untouched 78a702bf baseline, 1 opt-in runtime test skipped (executed separately above).
- Browser: 3 actual findings, 13 reports, persisted reply/history, ZIP export/import without overwrite, empty-result headers/chips, keyboard entrance, mobile dialog and four real IndexedDB account-isolation checks.
- New homepage artwork: all eight WebP assets loaded; 4 added transparent assets total about 227 KiB. Desktop/narrow-desktop and 390px phone layout have no document overflow. No physical-device or company-board validation claimed.
- Rollback trigger: the deployed homepage/guard/navigation fails or the worker/assets fail to load. Roll back only this feature commit; no persistent cloud data changes need reversal.
- Keyboard follow-up: a real browser fixture reproduced the old SVG node's missing keyboard link; the updated component retains link semantics through SVG sanitization and both Enter/Space open the exact local PDF page. The shared diagram navigation also rejects non-integer/out-of-range pages. The live site currently requires a new login, so no authenticated production workflow is claimed.
