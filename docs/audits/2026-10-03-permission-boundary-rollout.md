# Permission Boundary Rollout and Containment

## Scope

Target only production project `rfppeuzuoxtqkpbwehbq`. Never substitute the
test project. These steps preserve account and operational rows; no production
execution is part of the candidate branch.

Fresh read-only evidence captured 2026-10-03 07:59-08:00 UTC showed the project
healthy and the latest recorded migration at `20261001203000`. Neither
`20261002160000` nor `20261002170000` was present. The legacy permission table
had RLS enabled but one permissive `ALL TO PUBLIC` policy and full table ACLs
for `anon`, `authenticated`, and `service_role`. `system_users` retained its
authenticated-only seven-column `SELECT` boundary (`id`, `auth_user_id`,
`username`, `display_name`, `permissions`, `role`, `status`) and no client table
writes.

## Required preflight

1. Confirm the project reference and database executor in the same session.
2. Run `2026-10-03-permission-boundary-preflight.sql` as a read-only transaction
   and retain the output privately.
3. Compare function definitions, owners, ACLs, policies, dependencies, and
   aggregate counts with the fresh approved catalog. Do not select password
   hashes, tokens, API keys, or row-level business data.
4. Archive the complete scoped recovery capture from the preflight: migration
   state; definitions, owners, volatility, search paths and ACLs for every SQL1,
   SQL2 and SQL3 function; both affected tables' table/column ACLs; and every
   affected policy. These migrations perform no application-time business-row
   DML: their `INSERT`/`UPDATE`/`DELETE` statements are function bodies for later
   calls, while SQL3's `DO` block changes policies. A full-database backup is not
   an inherent prerequisite for this bounded release, but an operator must review
   a targeted forward-recovery script from the capture before execution. Never
   call this capture a full backup or restore the vulnerable grants automatically.

Stop if the migration head, safe seven-column account grant, function owner,
ACL, policy, or aggregate evidence differs unexpectedly.

## Fixed rollout order

1. Keep the existing frontend deployed.
2. Apply `20261002160000_enforce_explicit_permission_revocation.sql` as one
   transaction and verify its helpers and ACLs.
3. Apply `20261002170000_align_account_permission_mutation_entrypoints.sql` as
   one transaction and verify both four-argument entrypoints.
4. Apply `20261003075222_close_permission_table_boundary.sql` as one transaction.
5. Before any frontend deployment, verify:
   - `anon` has no table privileges on `user_page_permissions`;
   - `authenticated` has `SELECT` only;
   - the sole policy is authenticated own-row or authorized-manager read;
   - all four permission RPC signatures deny `PUBLIC`/`anon` and allow only the
     intended authenticated/service roles;
   - the account create/update/delete/sync RPCs deny `PUBLIC`, `anon`, and
     `service_role`, allow `authenticated`, and expose no broad table write;
   - both approval wrappers use the SQL3 post-lock implementation;
   - `system_users` is still authenticated-only safe seven-column `SELECT` with
     no table-level client access;
   - aggregate counts match the preflight.
6. Deploy `account-admin-sync` from this exact reviewed head and independently
   verify the deployed function version/hash. A repository edit or GitHub Pages
   deployment does **not** deploy the Edge function. The new Edge version rejects
   `profile.permissions` and routes role/status/profile mutations through the
   authenticated transactional RPCs. Deploy the matching frontend immediately
   afterward; an older frontend's account-create request will fail closed during
   this short maintenance interval because it still sends `profile.permissions`.
7. Deploy the frontend that calls the five-argument permission RPC and no longer
   sends permissions to `account-admin-sync`.
8. In non-destructive synthetic accounts, verify admin load/save, explicit empty
   permissions, performance-manager assign/revoke, denial after revocation, and
   another signed-in session receiving the existing permission refresh event.
   Also verify two independent browser/device sessions for the same account can
   operate normally, then revoke that account and confirm both sessions fail on
   their next server-authorized mutation. Authorization is account/JWT based, not
   device-bound.
9. Re-run the preflight catalog queries and compare definitions, ACLs, policies,
   migration history, and counts.

Do not deploy the new frontend between SQL steps. Do not use production data for
race or destructive mutation tests.

## Failure handling

- A failed transactional migration rolls itself back; stop and inspect the exact
  error before retrying.
- If SQL3 is healthy but the new frontend fails, roll the frontend back first and
  leave the hardened database boundary in place.
- For complete account-mutation containment, first disable or replace any legacy
  deployed `account-admin-sync` that still writes `system_users` with the service
  role, then run `2026-10-03-permission-boundary-safe-containment.sql`. The SQL
  revokes authenticated permission/profile/activation RPCs while preserving only
  service-role permission recovery and the read-only table boundary. It cannot by
  itself neutralize a previously deployed legacy Edge function or privileged
  operator/service direct SQL.
- Never restore the former permissive policy or client write grants as an
  automatic rollback. Restore exact captured metadata only through a separately
  reviewed forward fix.
