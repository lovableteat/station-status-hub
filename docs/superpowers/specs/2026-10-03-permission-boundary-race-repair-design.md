# Permission Boundary Race Repair Design

## Goal

Close direct client writes to `workspace.user_page_permissions` and make an
administrator's complete permission save one atomic database operation. The
operation must remain authorized after any row-lock wait, so a queued self-save
cannot restore authority that another administrator has just revoked.

This change prepares SQL and application artifacts only. It does not connect to
or modify a hosted Supabase project.

## Confirmed failure modes

1. The browser currently saves the durable JSON permission document through an
   Edge Function and then performs best-effort direct delete/insert operations
   on `workspace.user_page_permissions`. A partial failure can leave the two
   representations out of sync.
2. The four-argument permission RPC authorizes before taking any target row
   lock. Under PostgreSQL Read Committed, a caller queued behind a revocation
   can therefore proceed on a stale authorization decision.
3. The archived schema migration granted broad table access and installed a
   permissive `PUBLIC` policy on `user_page_permissions`. A row-level policy is
   not a substitute for removing unnecessary table privileges.
4. PostgreSQL grants `EXECUTE` on newly created functions to `PUBLIC` by
   default. Every RPC overload therefore needs an explicit ACL.

## Chosen approach

Add a five-argument `workspace.set_user_access_permissions` overload that owns
the full mutation: page permissions, workspace access, and the performance
manager flag. The function locks the authenticated actor and target user rows
in UUID order, then performs a fresh authorization check after the waits. It
updates both permission representations in the same transaction.

The existing four-argument workspace and public overloads remain compatibility
aliases. They delegate to the five-argument function with a null manager flag,
which preserves the target's existing manager value. All overloads revoke
`PUBLIC` and `anon` execution and grant only `authenticated` and
`service_role`.

The table boundary becomes read-only for authenticated clients: revoke all
table access, grant only `SELECT`, and replace existing policies with one
authenticated policy allowing an active user to read their own rows or a
currently authorized manager to read managed rows. The service role retains
full access. Browser writes use only the five-argument RPC.

## Lock and authorization protocol

1. Resolve the actor from `auth.uid()` unless the request is service-role.
2. Lock the distinct actor and target `system_users` rows in ascending UUID
   order. Every call follows this order, including self-saves.
3. After all waits, call the volatile authorization helper again. This is a new
   SQL statement and therefore observes a current Read Committed snapshot.
4. Validate the payload, replace legacy permission rows, and update the durable
   JSON document while the same transaction still owns the row locks.

Consistent ordering prevents actor/target cross-save deadlocks. An advisory lock
was rejected because existing row updates do not participate in it.
`SERIALIZABLE` was rejected because it would move retry handling and `40001`
errors into every caller while still leaving the direct-table boundary open.

## Compatibility and data rules

- Four-argument calls preserve `performanceManager` rather than deleting or
  coercing it.
- An explicitly empty `pagePermissions` array is authoritative. Legacy rows are
  a fallback only when the durable property is absent, never when it is present
  and empty.
- No account, permission, or operational row is rewritten during migration.
- Account identity, login, avatar, organization writers, and Realtime behavior
  are outside this change.
- Existing `system_users` column privileges must not be broadened. The exact
  hosted ACL remains a rollout preflight assertion rather than a guessed local
  rewrite.

## Verification

- Static tests prove the browser has one RPC write path, overloads have explicit
  ACLs, and the table no longer has client write privileges.
- Existing PGlite integration checks exercise migration behavior and fallback
  semantics, but are not accepted as concurrency proof.
- A disposable real PostgreSQL container runs independent sessions for queued
  revocation/self-save, cross-user lock ordering, authorization, RLS, and
  effective function ACL matrices.
- Full unit tests, application and Node TypeScript checks, build, and the
  existing lint baseline run before review.

## Rollout and rollback

Production order is fixed: capture a metadata/aggregate preflight, apply
`20261002160000`, then `20261002170000`, then this migration, verify the SQL
boundary, and only then deploy the RPC-using frontend. A frontend must never be
deployed before its five-argument RPC exists.

Rollback is deliberately fail-closed. Roll back the frontend first. The
database rollback artifact may restore the prior four-argument implementation
but must retain the restricted table grants and policy; it must not recreate
the permissive client write boundary. Exact hosted definitions, owners, ACLs,
dependencies, policies, and aggregate counts are captured immediately before
execution for forensic restoration. That snapshot is not a full database
backup, and full production restore readiness must be confirmed separately by
the operator.
