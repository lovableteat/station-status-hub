# Authenticated Realtime Session Recovery Implementation Plan

**Goal:** Recover stale local login sessions into valid Supabase Auth sessions so
realtime presence and account administration work reliably.

**Architecture:** Add an explicit upgrade state to `UserContext`, gate all
private providers in `App`, provide an in-place password verification screen,
and defend account mutations against missing JWTs.

**Tech stack:** React, TypeScript, Supabase Auth/Edge Functions/Realtime, Vite,
Node test runner.

## Constraints

- Preserve the current account and page during the upgrade.
- Do not authorize server operations from the legacy local cache.
- Do not silently fall back to a legacy session while v2 is enabled.
- Do not store or log passwords.
- Fetch and integrate the latest `origin/main` immediately before publishing.
- Never force push.

### Task 1: Lock the recovery contract with failing tests

**Files:**

- Modify: `tests/realtimeCollaborationV2.test.mjs`
- Modify: `tests/permissionPersistence.test.mjs`

- [ ] Assert cached users remain initializing until Supabase session recovery
  completes.
- [ ] Assert `UserContext` exposes an explicit realtime-upgrade requirement.
- [ ] Assert `App` gates private providers behind the upgrade screen.
- [ ] Assert v2 authentication cannot resolve to a legacy-only success.
- [ ] Assert account mutations have an authenticated-session guard.
- [ ] Make the existing permission RPC source assertion whitespace-safe.
- [ ] Run the focused tests and confirm the new assertions fail for the expected
  missing behavior.

### Task 2: Implement session recovery

**Files:**

- Modify: `src/components/auth/UserContext.tsx`
- Create: `src/components/auth/RealtimeSessionUpgradePage.tsx`
- Modify: `src/App.tsx`

- [ ] Keep initialization pending while checking a cached user's Supabase
  session.
- [ ] Expose `requiresRealtimeUpgrade`.
- [ ] Restrict the legacy authentication fallback to v2-disabled deployments.
- [ ] Build the in-place password verification screen with sign-out recovery.
- [ ] Gate all private application providers until authentication is complete.

### Task 3: Add account-administration defense

**Files:**

- Modify: `src/components/admin/AdminPanel.tsx`

- [ ] Check `isRealtimeAuthenticated` before account create, update, or delete
  when v2 is enabled.
- [ ] Show an actionable session-verification message instead of a generic sync
  failure.

### Task 4: Verify locally

- [ ] Run the focused realtime, presence, collaboration, and permission tests.
- [ ] Run TypeScript/Vite production build.
- [ ] Run targeted lint checks on changed source files.
- [ ] Use a browser to verify the login surface and failed-login behavior have
  no console errors.

### Task 5: Integrate and publish safely

- [ ] Fetch `origin/main` immediately before commit/push.
- [ ] If main advanced, rebase the isolated branch and inspect every conflict.
- [ ] Rerun the focused tests and production build after integration.
- [ ] Commit the exact reviewed scope.
- [ ] Push `HEAD:main` without force.
- [ ] Verify the remote main SHA and the deployed GitHub Pages application.
