# Permission Boundary Race Repair Implementation Plan

**Goal:** Make permission saves atomic and close the stale-authorization race
without touching hosted data during development.

**Architecture:** A new five-argument security-definer RPC locks actor and target
rows in a deterministic order, re-authorizes after waiting, and writes both
permission representations transactionally. Authenticated clients receive
read-only access to the legacy permission table. The React dialog calls only
the atomic RPC. Account profile/role/status/approval writers use authenticated
transactional RPCs with the same post-lock authorization rule; Edge retains the
service role only for Auth and storage synchronization.

## Constraints

- Do not apply migrations or security changes to any hosted project in this
  branch-preparation task.
- Never use project `knmbqgjgwbuaoobicdcd` as a substitute target.
- Preserve real rows, identity helpers, organization writers, login/avatar
  behavior, and Realtime behavior.
- Do not import the stale Library v0 candidate.
- Do not broaden existing `system_users` privileges.

### Task 1: Regression boundaries

- [x] Update static permission-persistence tests to require one five-argument
      RPC and forbid browser writes to `user_page_permissions`.
- [x] Extend migration integration coverage for table ACLs, policies, overload
      ACLs, performance-manager preservation, and durable empty-array priority.
- [x] Add a disposable PostgreSQL harness using independent sessions for the
      queued revocation race and deterministic cross-user lock ordering.
- [x] Run the focused tests and record the expected failures before production
      code is added.

### Task 2: Database boundary

- [x] Generate the migration with the installed Supabase CLI.
- [x] Add the five-argument atomic function and compatibility aliases.
- [x] Revoke client table writes and install the authenticated read policy.
- [x] Explicitly revoke default function execution and grant only intended
      roles for every overload.
- [x] Keep the migration transactional and reload the PostgREST schema cache.
- [x] Guard SQL2/SQL3 ordering so a later SQL2 cannot silently replace SQL3's
      hardened wrapper.

### Task 2a: Account activation and Edge boundary

- [x] Reject legacy Edge `profile.permissions` payloads and remove that field
      from the current frontend contract.
- [x] Route account create/update/delete/sync authorization through narrow
      authenticated RPCs; do not broaden `system_users` grants.
- [x] Harden `approve_system_user` with ordered actor/target locks and a fresh
      post-wait authorization decision.
- [x] Remove stale failure compensation for permissions, role, status, and
      password hash; report Auth synchronization as pending instead.

### Task 3: Frontend atomic save

- [x] Replace the Edge-plus-best-effort sequence with one Supabase RPC call.
- [x] Pass the manager flag in the same payload.
- [x] Preserve durable-array precedence and existing refresh/toast behavior.
- [x] Update generated Supabase function argument types.

### Task 4: Operational artifacts

- [x] Add a preflight script that captures definitions, owners, ACLs, policies,
      dependencies, migration history, and aggregate counts without secrets.
- [x] Add a fixed-order rollout runbook for SQL 1 -> SQL 2 -> SQL 3 -> verified
      Edge deployment -> frontend.
- [x] Add fail-closed containment for permission, account-profile, and approval
      RPCs, plus the separate legacy-Edge disablement requirement.
- [x] Capture the complete ordered DDL/ACL write set as scoped recovery evidence;
      do not mislabel it a full backup or auto-restore vulnerable grants.

### Task 5: Verification and handoff

- [x] Run focused Node/PGlite tests and the real PostgreSQL concurrency harness.
- [x] Run the full unit suite, app TypeScript, Node TypeScript, and production
      build.
- [x] Run lint and report its existing baseline separately from this change.
- [x] Review `git diff --check`, inspect the exact diff for secrets/destructive
      SQL, commit the candidate, and provide the exact head for independent
      review before any hosted action.
