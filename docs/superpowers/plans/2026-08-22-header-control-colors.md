# Header Control Semantic Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply approved low-saturation semantic colors to the four right-side workspace header controls while preserving layout and behavior.

**Architecture:** Keep each control's styling colocated with its existing component. Change only Tailwind utility classes for surface, border, text, shadow, and hover colors; leave positioning, sizing, handlers, labels, and responsive visibility untouched.

**Tech Stack:** React, TypeScript, Tailwind CSS utility classes, Node.js built-in tests, ESLint, Vite, GitHub Pages.

## Global Constraints

- Preserve existing control sizes, positions, labels, event handlers, responsive breakpoints, and focus behavior.
- Use semantic Tailwind color families: emerald for online, cyan for mobile, indigo for account, rose for logout.
- Keep all four controls at least 44px high and maintain the existing touch spacing.
- Verify the rendered page visually before reporting completion.
- Push the verified commit to `origin/main` and wait for the Pages workflow to succeed.

### Task 1: Add visual regression assertions

**Files:**
- Modify: `tests/platformLogo.test.mjs`

- [ ] **Step 1: Add failing assertions**

Add a test that reads the existing component source and requires these class families:

```js
test("header controls use distinct semantic color families", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");
  const online = read("src/components/common/OnlineUsersIndicator.tsx");
  const mobile = read("src/components/layout/WebsiteQrButton.tsx");

  assert.match(online, /emerald-300\/10/);
  assert.match(mobile, /cyan-300\/10/);
  assert.match(header, /indigo-300\/10/);
  assert.match(header, /rose-300\/10/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
node --test tests/platformLogo.test.mjs
```

Expected: the new test fails because the current header control classes do not yet contain all four semantic surface colors.

### Task 2: Implement the approved semantic colors

**Files:**
- Modify: `src/components/common/OnlineUsersIndicator.tsx`
- Modify: `src/components/layout/WebsiteQrButton.tsx`
- Modify: `src/components/layout/MainWorkspaceHeader.tsx`

- [ ] **Step 1: Update the online control**

Replace only its current primary-colored surface utilities with emerald utilities:

```tsx
"border-emerald-200/30 bg-emerald-300/10 text-emerald-100 shadow-[0_16px_28px_-24px_rgba(16,185,129,0.65)] backdrop-blur-sm hover:border-emerald-200/50 hover:bg-emerald-300/18"
```

- [ ] **Step 2: Update the mobile QR control**

Keep its cyan family but strengthen the surface and border contrast:

```tsx
"border-cyan-200/35 bg-cyan-300/12 text-cyan-50 shadow-[0_16px_30px_-24px_rgba(34,211,238,0.8)] hover:border-cyan-200/60 hover:bg-cyan-300/20 hover:text-white"
```

- [ ] **Step 3: Update the account control**

Replace its neutral surface utilities with indigo utilities while keeping its existing dimensions and dropdown behavior:

```tsx
"interactive-lift flex h-10 w-[140px] shrink-0 items-center gap-2 rounded-xl border border-indigo-200/30 bg-indigo-300/10 px-3 text-left text-indigo-50 transition-colors hover:bg-indigo-300/18 hover:shadow-[0_16px_28px_-24px_rgba(99,102,241,0.6)] max-sm:w-10 max-sm:justify-center max-sm:px-0 sm:h-12 sm:rounded-2xl sm:gap-3"
```

- [ ] **Step 4: Update the logout control**

Replace its neutral surface utilities with rose utilities while keeping the existing logout action:

```tsx
"border-rose-300/30 bg-rose-300/10 text-rose-100 hover:border-rose-200/50 hover:bg-rose-300/18 hover:text-rose-50"
```

- [ ] **Step 5: Run focused verification**

Run:

```powershell
node --test tests/platformLogo.test.mjs tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs
npm exec eslint src/components/layout/MainWorkspaceHeader.tsx src/components/common/OnlineUsersIndicator.tsx src/components/layout/WebsiteQrButton.tsx tests/platformLogo.test.mjs
npm run build
```

Expected: all tests pass, ESLint exits successfully, and Vite produces a production build.

### Task 3: Visually verify and deploy

**Files:**
- No additional source files.

- [ ] **Step 1: Open the rendered local workspace**

Start the local server and open `/station-status-hub/?demo=admin` in the browser.

- [ ] **Step 2: Visually inspect the four controls**

Confirm the online, mobile, account, and logout controls are visibly distinct, readable, still aligned to the right edge, and not overlapping the navigation. Confirm no horizontal overflow.

- [ ] **Step 3: Commit and push**

```powershell
git add src/components/common/OnlineUsersIndicator.tsx src/components/layout/WebsiteQrButton.tsx src/components/layout/MainWorkspaceHeader.tsx tests/platformLogo.test.mjs docs/superpowers/specs/2026-08-22-header-control-colors-design.md docs/superpowers/plans/2026-08-22-header-control-colors.md
git commit -m "style: improve header control color contrast"
git push origin main
```

- [ ] **Step 4: Wait for deployment and verify the published bundle**

Wait for the latest GitHub Pages workflow for the pushed SHA to finish successfully, then fetch the published workspace chunk and confirm it contains the semantic color markers. Confirm `git status --short --branch` is clean and local `HEAD` equals `origin/main`.
