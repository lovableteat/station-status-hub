# Mobile-first workspaces completion report

## Delivered scope

- Rebuilt the shared handset shell around a 52px safe-area-aware header and a 56px bottom dock.
- Replaced the floating four-item navigation with Home, Maintenance, Material, Query, and a permission-filtered More sheet.
- Changed the message launcher to one compact rectangular control above the shared dock.
- Reworked PCB Designer into a canvas-first layout with a single project row, horizontal tool strip, drawer actions, and compact status line through the 1023px compact breakpoint.
- Removed the redundant Data Center mobile dock and exposed scene, details, model, and 2D controls as a compact scene overlay.
- Reworked administration cards so identity, status, username, and last login are immediately visible while verbose metadata is hidden on phones.
- Reworked project controls, module navigation, page headings, and maintenance KPIs into compact rows and horizontal snap strips.
- Reworked Material/BOM lookup so search and quick filters stay visible, while sort/import/export/page tools live in a closed disclosure and cards show summary-first content.
- Reworked AI query controls, empty state, maintenance source selector, and composer to preserve conversation space and keyboard access.

## Mobile platform contract

- Supported portrait widths: 320, 360, 390, 412, and 430 CSS px.
- Compact/landscape behavior extends through 1023px, including 844 × 390 phone landscape.
- Uses `100svh` followed by `100dvh`, `viewport-fit=cover`, and `interactive-widget=resizes-content`.
- Uses both `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Text inputs are 16px on handsets and coarse-pointer controls have a 44px minimum target.
- Every workspace reserves the same dock clearance; PCB, Data Center, and AI no longer bypass it.

## Verification evidence

- `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs tests/pcb-designer/*.test.ts`: 195 passed, 0 failed.
- Related administration, Data Center, collaboration, and header regressions: 25 passed, 0 failed.
- ESLint over every modified TypeScript/TSX file: exit 0.
- Production Vite build: exit 0; only the repository's existing Browserslist, browser-externalization, and large-chunk warnings remain.
- `git diff --check`: exit 0 (Git only reports the repository's existing LF-to-CRLF checkout warning).
- Local production preview returned HTTP 200 at `http://127.0.0.1:4174/station-status-hub/?demo=admin`.

The complete repository test invocation currently reports 673 passed and 3 failed. The remaining failures are in untouched areas and were not introduced by this change:

- `tests/bootRecoveryPolicy.test.mjs` — recovery lock expiration contract.
- `tests/dynamicSystemMetadataMigration.test.mjs` — generated database metadata types.
- `tests/supabaseOutageResilience.test.mjs` — login quota-restriction copy.

## Browser and deployment evidence

The local in-app browser runtime reported no available browser instances, so interactive screenshots at each viewport could not be captured in this session. The source contracts, compact breakpoints, focused regressions, lint, build, and HTTP preview checks were used as the available verification path.

Remote `main` and GitHub Pages deployment verification are recorded in the delivery response after push.
