> 集中副本；原始路徑：`docs/security/applied-login-audit-cutover-20261112.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Applied anonymous login-audit containment

## Applied scope and verification limits

A separately authorized production operation recorded migration `20261112022029_restrict_anonymous_login_audit_access` at 2026-11-12 02:20:29 UTC. Its only application-object change was to revoke all table privileges from anon on `workspace.login_audit`. The original postgres, authenticated and service_role grants, owner, RLS, policies, column ACL state, and both postgres-owned SECURITY DEFINER login aliases were retained. No business/audit row, object, machine operation, login, password, Auth session, policy or function was changed.

A body-free anonymous HEAD against login_audit returned 401 at 02:22:01 UTC. A same-key HEAD against the unchanged test_progress_audit control returned 200 at 02:22:46 UTC. That rules out an invalid-key explanation for the observed denial, but is not a successful real-user login or machine-workflow test. Actual captured login function definitions passed isolated synthetic successful/failed login tests using a synthetic password-helper stub; no real credential or login was used as a production probe.

This cutover closes only anonymous login-audit table access. It does not establish per-user authorization for the retained signed-in grants. The separate test_progress_audit candidate was not applied: older/sessionless timer consumers remain a compatibility concern. Core tables, other RPCs, frontend and private-bucket proposals remain pending. No claim of complete exposure remediation or zero interruption follows from this narrow result.

## Exact repository history

The [migration SQL](https://github.com/lovableteat/station-status-hub/blob/2c5dd8829effc42acd60f64089701abb57e481c2/supabase/migrations/20261112022029_restrict_anonymous_login_audit_access.sql) was copied from an independently read existing server ledger record and matched the retained applied SQL byte-for-byte:

- Version: `20261112022029`
- Name: `restrict_anonymous_login_audit_access`
- UTF-8 bytes: `4521`
- SHA-256: `6f0a61cb237f41df51239433a3112257ccef4480a635cc43c7c9d653c5ba49c5`

The original PENDING comment is immutable historical text, not current deployment status. The file retains its original timestamp and has path-specific LF protection plus byte/hash tests. Before later promotion, match the target ledger's version, name and statement and skip this already-applied entry. Never re-execute its pre-cutover guards, invent a duplicate version, or repair the ledger to bypass a mismatch. This repository synchronization performs no production mutation.

The exact migration was replayed from the repository file in private PGlite 0.3.14/PostgreSQL 17.5 and 0.5.8/PostgreSQL 18.3 fixtures: 15/15 checks passed on each. Those tests use captured definitions and synthetic data only, including denial, retained callers, login writes, drift rejection and row/metadata preservation. They are not a complete historical migration-chain replay, hosted Auth/PostgREST end-to-end test, or full DB/PITR/Storage restore.

## Remaining stage and recovery baseline

Stage 01 must start from this already-closed anonymous table/column boundary and fail on drift, rather than silently closing it again. Its original authenticated audit-write restrictions and restrictive policies remain necessary and pending; authenticated SELECT/MAINTAIN retain their original ACL entries and grant options, and direct authenticated column writes are removed without changing retained SELECT or non-browser grants; the narrow applied cutover did not perform those changes. Later stage failure must preserve the successful cutovers and current data, not restore grants from before containment. Public/inherited or column-level anonymous access is still access even if a direct anon table grant is absent.

The old private whole-configuration rollback was prepared before the three applied narrow migrations. It would reopen login-audit and RPC exposure, so its former entry point has been retired with an unconditional failure before any mutation; the original bytes remain preserved as historical evidence. The retired entry point passed 2/2 isolated checks on each of PGlite 0.3.14 and 0.5.8: it fails before its first old DDL, leaves an aborted transaction until explicit rollback, and then preserves synthetic rows, policies, ACLs and function definitions with anon access still denied. No executable whole-configuration rollback is claimed. Historic narrow reopen scripts likewise are not the current recovery baseline and must not run automatically. Prefer a fresh, specifically reviewed compatibility correction that keeps the anonymous boundary closed. After any failed transaction, issue ROLLBACK or close the connection promptly.

The current recovery baseline includes [four internal RPCs](./docs__security__applied-internal-rpc-cutover-20261112.md), [both anonymous-delete aliases](./docs__security__applied-delete-rpc-cutover-20261112.md), and this login-audit containment. Configuration preimages and retained SQL are not a complete database or Storage-object backup. Never overwrite ongoing work with an old database or clear drafts as recovery.

Final commit-specific CI results are recorded in the draft PR. The PR remains unmerged; existing loaded tabs and drafts still require a safe frontend cutover plan.

## Repository reconciliation verification

- Combined staged SQL suites: 38/38 passed on the frozen implementation, retaining all 26 prior cases. New cases cover effective anonymous grants before and after preflight, retained login behavior, policy/column/table ACL preservation, authenticated SELECT/MAINTAIN and grant options, and failed recovery that must not reopen anonymous access.
- Full unit/source suite: 2,316 passed, 8 existing skips, 0 failed (2,324 total). Typecheck passed; branch-local lint has 0 errors and 72 existing warnings. PR merge validation may include additional changes already on main; its exact checkout and warnings are recorded separately in the PR.
- All three immutable migration statement/hash/LF suites: 12/12 passed. The private retired whole-configuration rollback tests and exact applied-SQL replay are separate from the public staged fixtures.
- Independent review reproduced two missing retained-rights checks, then verified their repair: removing authenticated MAINTAIN or SELECT grant option now fails and rolls back, while ordinary baselines with or without MAINTAIN preserve their original rights. Those fixes do not expand the intended authenticated revoke scope.
