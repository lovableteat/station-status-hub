# Authenticated Realtime Session Recovery Design

## Problem

Realtime collaboration v2 requires a valid Supabase Auth session. Browsers that
were already signed in before the rollout can still restore the application's
legacy local account cache, but that cache has no Supabase JWT.

This creates a misleading half-authenticated state:

- the main application opens as if the user is signed in;
- presence rejects the session and reports realtime as unavailable;
- `account-admin-sync` rejects account creation because the function verifies
  JWTs;
- the generic account-sync error does not explain how the user can recover.

The deployed `account-login` and `account-admin-sync` functions both respond to
preflight requests, so the failure is not caused by a missing deployment or
general network connectivity.

## Goals

- Upgrade an existing cached session without losing the current account,
  workspace, or page.
- Require the user's password once to obtain a real Supabase Auth session.
- Never mount authenticated application providers while a cached account lacks
  the required JWT.
- Prevent new v2 logins from silently falling back into the same broken legacy
  state.
- Give administrators a precise recovery message if an unauthenticated mutation
  is attempted.
- Keep legacy login behavior unchanged when realtime collaboration v2 is
  explicitly disabled.

## Considered Approaches

### Force logout every legacy session

This is secure but disruptive. It discards the user's current context and makes
the rollout look like random session loss.

### Let realtime and account administration use the legacy local session

Rejected. A local cache is not a server-verifiable identity and must not be used
to authorize presence or account mutations.

### In-place authenticated session upgrade

Selected. Keep the cached account only long enough to identify who is upgrading,
block the private application, ask for the password, exchange it through the
deployed login function, and continue only after Supabase confirms the session.

## Design

### Session state

`UserContext` exposes `requiresRealtimeUpgrade`. It is true only when all of the
following are true:

- realtime collaboration v2 is enabled;
- a local application user exists;
- no authenticated Supabase session has been established.

When a cached user exists, initialization stays pending until
`supabase.auth.getSession()` resolves. This prevents the upgrade page from
flashing when the browser already has a valid restored session.

When v2 is enabled, a new login succeeds only when `account-login` establishes
the Supabase session. The legacy RPC fallback remains available only when v2 is
disabled.

### Global application gate

The gate lives in `App`, above presence, permissions, notifications, and data
providers. A cached legacy user sees a focused session-upgrade page instead of
the private application. This also covers direct routes, not only the home page.

The upgrade page:

- shows the cached username as read-only context;
- asks only for the current password;
- calls the existing `authenticate` flow;
- never persists the password;
- offers a clear way to sign out and use another account;
- distinguishes a wrong password from an unavailable authenticated-login
  service.

### Administrative defense

Account create, update, and delete operations check
`isRealtimeAuthenticated` before calling `account-admin-sync` whenever v2 is
enabled. The global gate should normally make this unreachable, but the guard
prevents confusing 401 responses from programmatic or future entry points.

## Security and Failure Handling

- No password is written to local storage, session storage, logs, or URLs.
- The cached account is not treated as authorization.
- A failed upgrade leaves the private application blocked.
- Signing out clears both Supabase Auth and the cached application account.
- No force push is permitted. The branch must be rebased onto the latest
  `origin/main` and fully reverified immediately before publishing.

## Verification

- Source and behavior tests cover initialization, upgrade detection, the global
  gate, v2 login behavior, and the admin mutation guard.
- Existing presence, collaboration, and permission-persistence tests pass.
- Production build succeeds.
- Browser verification covers the signed-out login screen and error handling.
- Before pushing, fetch `origin/main`, integrate any remote commits, rerun the
  focused tests and build, then push with a normal fast-forward update.
