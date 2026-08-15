# Mobile-first Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared shell and six core workspaces into compact, safe-area-aware phone interfaces that work across iOS and Android widths without regressing desktop behavior.

**Architecture:** Keep one React component tree and introduce shared mobile shell tokens plus focused responsive variants inside each existing workspace. Reuse all current state and action handlers; responsive markup changes only information hierarchy and control placement. Fixed navigation and chat consume shared CSS offsets so canvases and scroll regions always end above them.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, existing shadcn/Radix components, Vite, Node test runner, Capacitor-compatible web viewport, in-app browser QA.

## Global Constraints

- Handsets are 320–767px; compact layouts are 768–1023px; desktop begins at 1024px.
- Validate 320, 360, 390, 412, 430, and 844 × 390 CSS-pixel viewports.
- Preserve `viewport-fit=cover`; add keyboard viewport resizing and iOS/Android theme metadata.
- Reserve a 56px dock plus `env(safe-area-inset-bottom)` on every mobile workspace.
- Coarse-pointer controls are at least 44 × 44px and handset text inputs are at least 16px.
- Preserve all existing desktop actions and data behavior.
- Do not add a second mobile codebase or a new UI dependency.

---

### Task 1: Lock the mobile shell contract with tests

**Files:**
- Create: `tests/mobileFirstAdaptiveShell.test.mjs`
- Modify: `tests/mobileCoreWorkspaces.test.mjs`

**Interfaces:**
- Consumes: existing source-contract test pattern using `node:test` and `readFile`.
- Produces: assertions for `data-mobile-app-header`, `data-mobile-workspace-main`, `data-mobile-more-sheet`, shared `--mobile-*` CSS variables, compact workspace markers, safe areas, and handset input sizing.

- [ ] **Step 1: Write failing shell and workspace contract tests**

```js
test("mobile shell reserves fixed chrome on every workspace", async () => {
  assert.match(index, /data-mobile-workspace-main="true"/);
  assert.match(css, /--mobile-dock-height:\s*56px/);
  assert.match(dock, /data-mobile-more-sheet="true"/);
});
```

- [ ] **Step 2: Run the new tests and confirm failure**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs`

Expected: FAIL because the new shell markers, More sheet, and compact workspace contracts do not exist yet.

- [ ] **Step 3: Keep the tests focused on user-visible contracts**

Assert semantic markers and stable CSS variables; do not assert exact decorative gradients or implementation-only class ordering.

### Task 2: Build the shared iOS/Android shell

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/layout/MainWorkspaceHeader.tsx`
- Modify: `src/components/layout/MobileWorkspaceDock.tsx`
- Modify: `src/components/collaboration/CollaborationCenter.tsx`

**Interfaces:**
- Consumes: `WorkspaceNavItem[]`, `activeWorkspace`, and `handleWorkspaceChange` from `Index.tsx`.
- Produces: shared `--mobile-header-height`, `--mobile-dock-height`, `--mobile-shell-bottom`, `data-mobile-app-header`, a five-item dock, and a permission-aware More bottom sheet.

- [ ] **Step 1: Add mobile viewport and shell CSS tokens**

Add theme metadata and `interactive-widget=resizes-content` to the viewport. Define a 52px header, 56px dock, safe-area-aware bottom clearance, 8px handset gutter, 44px coarse-pointer targets, and 16px handset form controls.

- [ ] **Step 2: Compact the global header**

Keep a single mobile row, hide QR/online/secondary text below `md`, and retain desktop navigation unchanged from `lg` upward.

- [ ] **Step 3: Replace the floating four-item dock**

Render Home, Maintenance, Material, Query, and More. More opens a bottom sheet containing only available secondary workspaces and calls the existing `onSelect(id)` handler.

- [ ] **Step 4: Reserve the dock in every workspace**

Mark the main element with `data-mobile-workspace-main="true"`; remove workspace exceptions so Data Center, PCB, and AI canvases also stop above the dock.

- [ ] **Step 5: Resize and reposition chat**

Use a 44px rectangular launcher above `--mobile-shell-bottom`; retain unread count and full-screen phone chat. Desktop keeps the current detached panel.

- [ ] **Step 6: Run shell tests**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs`

Expected: shell assertions PASS; workspace assertions that have not yet been implemented remain FAIL.

### Task 3: Rebuild PCB and Data Center phone canvases

**Files:**
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/PcbToolbar.tsx`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`

**Interfaces:**
- Consumes: existing project, drawer, DRC, view-mode, scene, rack, and mobile dialog handlers.
- Produces: `data-mobile-pcb-command-bar`, `data-mobile-data-center-controls`, compact one-row controls, and full-height canvas regions above the global dock.

- [ ] **Step 1: Collapse the PCB project header**

Keep project selector/save state in the first row; move templates/settings/DRC behind compact actions while preserving every current handler.

- [ ] **Step 2: Make the PCB tool row phone-native**

Use one 44px horizontal toolbar, sticky primary file controls, compact labels, and touch scrolling. Remove the permanent desktop recommendation advisory.

- [ ] **Step 3: Give the PCB canvas remaining height**

Ensure editor, drawers, and status line use the shell’s bounded height and cannot run behind navigation.

- [ ] **Step 4: Compact Data Center chrome**

Reduce the local title to 48px and expose scene/menu/details as compact overlays. Remove the redundant internal mobile dock and keep its actions reachable through the existing mobile sheets.

- [ ] **Step 5: Verify canvas contracts**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/pcb-designer/*.test.ts`

Expected: PASS.

### Task 4: Compact administration and maintenance

**Files:**
- Modify: `src/components/admin/AdminPanel.tsx`
- Modify: `src/components/admin/admin-panel.css`
- Modify: `src/components/test-projects/ProjectScopeBar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/maintenance/MaintenanceMetricStrip.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: existing user action handlers, `lastLoginLabel`, project actions, module navigation, and dashboard metric data.
- Produces: `data-mobile-user-summary`, visible last-login text, compact project/module rows, and a horizontal mobile KPI strip.

- [ ] **Step 1: Reduce admin preamble and filters**

Hide verbose hero copy on handsets, render metrics as a horizontal strip, and keep search plus filters in a compact disclosure.

- [ ] **Step 2: Recompose user cards**

Make avatar/name/role/status/username/last-login the always-visible summary. Keep status, permissions, and edit controls in one horizontal action row; hide verbose metadata and permission badges on handsets while retaining them on desktop.

- [ ] **Step 3: Make project and module controls one row each**

Keep project select plus primary actions in one row, hide redundant mobile edit labeling, and retain the horizontal module navigator.

- [ ] **Step 4: Convert maintenance KPIs to a snap strip**

Use one horizontally scrollable row at handset widths and reduce dashboard card padding/typography while leaving the desktop four-column layout unchanged.

- [ ] **Step 5: Run adaptive tests**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs`

Expected: administration and maintenance assertions PASS.

### Task 5: Rebuild material and AI phone workflows

**Files:**
- Modify: `src/components/material-requests/MaterialRequestPage.tsx`
- Modify: `src/components/api-management/ApiChatWorkspacePage.tsx`
- Modify: `src/components/api-management/ApiChatConsole.tsx`

**Interfaces:**
- Consumes: existing BOM search/filter/sort/create/import/export handlers and AI model/history/upload/send handlers.
- Produces: `data-mobile-material-primary-controls`, compact material cards, `data-mobile-ai-command-bar`, and a keyboard-safe compact composer.

- [ ] **Step 1: Reduce material commands above the list**

Keep BOM identity, create, search, and quick filters visible. Move sort and secondary BOM tools into the existing closed disclosure.

- [ ] **Step 2: Compact material cards**

Show the essential identity/state/REF summary and one primary action; disclose alternatives and secondary actions without duplicating data logic.

- [ ] **Step 3: Compact AI model controls and empty state**

Keep history/model/new in one row, reduce decorative empty-state height, and ensure conversation space starts immediately below controls.

- [ ] **Step 4: Make the AI composer keyboard-safe**

Keep prompt library, attachment, textarea, and send in one row with a 16px textarea; allow textarea growth without covering navigation.

- [ ] **Step 5: Run adaptive tests and build**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs && npm run build`

Expected: PASS and Vite exits 0.

### Task 6: Browser QA, regression checks, and delivery

**Files:**
- Modify only if browser evidence reveals a defect in files from Tasks 2–5.
- Create: `docs/superpowers/reports/2026-08-15-mobile-first-workspaces-completion.md`

**Interfaces:**
- Consumes: local production preview and demo-mode workspace navigation.
- Produces: viewport evidence, final test/build evidence, one or more intentional commits on `main`, and a verified GitHub Pages deployment.

- [ ] **Step 1: Start the local production preview**

Run: `npm run build` then `npm run preview -- --host 127.0.0.1 --port 4174`.

Expected: Vite preview is reachable at `http://127.0.0.1:4174/station-status-hub/?demo=admin`.

- [ ] **Step 2: Inspect every required phone viewport**

At 320, 360, 390, 412, 430, and 844 × 390, open the shell plus PCB, Data Center, administration, maintenance dashboard, material, and AI query. Confirm `document.documentElement.scrollWidth === innerWidth`, fixed controls do not cover primary content, and scroll/pinch/typing controls remain reachable.

- [ ] **Step 3: Run final verification**

Run: `node --test tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs tests/pcb-designer/*.test.ts`

Run: `npm run build`

Run: `git diff --check`

Expected: all commands exit 0.

- [ ] **Step 4: Record completion evidence**

Document viewport results, test/build commands, changed interaction hierarchy, and any existing unrelated warnings in the completion report.

- [ ] **Step 5: Commit and push main**

Run: `git add <intentional files>`

Run: `git commit -m "feat: rebuild core mobile workspaces"`

Run: `git push origin main`

Expected: remote `main` advances to the new commit.

- [ ] **Step 6: Verify deployment**

Open `https://lovableteat.github.io/station-status-hub/?reload=<timestamp>` and verify the deployed assets correspond to the pushed commit and the mobile shell renders at a phone viewport.

