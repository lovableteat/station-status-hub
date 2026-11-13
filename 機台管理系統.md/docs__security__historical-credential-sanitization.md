> 集中副本；原始路徑：`docs/security/historical-credential-sanitization.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Historical credential source cleanup

## What changed

Five historical migration filenames and versions are retained. Only embedded credential seed/reset DML and the associated revealing comments are removed. No replacement password, reversible encoding, secret-derived hash, account reset, or automatic privileged bootstrap is added.

- `20250704045846-aba86276-5cc5-4280-99de-c0bc1f03bfbf.sql`: retains system_users and production_targets structure, policies, RLS, triggers and the non-account target default; removes the account seed.
- `20250706170245-978d1ca4-4fb0-40fd-88bd-aa753800bec8.sql`: retains policy changes; removes the account upsert.
- `20250706170658-86bd7765-9557-492e-8cb7-97dcde7ed99a.sql`: credential-only reset becomes a comment-only no-op.
- `20250727034628-8bcf66f4-ca69-4cbe-9018-42163fb36f64.sql`: retains login_audit structure, policies and the authenticate_user definition; removes the account reset.
- `20250804074607_73e090c7-cfc7-4639-8434-58a1667db1a0.sql`: credential-only reset becomes a comment-only no-op.

The one-time private review verified that all bytes outside the five reviewed removal spans remain unchanged. Public tests use only sanitized current files and generated synthetic accounts. They do not retrieve earlier secret-bearing blobs or publish deleted-line patches.

## Production and migration history boundary

This is source-tree cleanup, not a production database migration. It does not modify existing accounts, password hashes, roles, permissions, status, creator, timestamps, business rows or server migration history. The exact three already-applied November containment migration copies remain unchanged.

Read-only metadata review did not match these five historical versions to the current target ledger. Existing objects do not prove which migration produced them. Do not assume an ordinary migration runner will skip these files. Do not run a bulk migration push, reset, repair, retimestamp or replay against production to implement this change. The first historical structural file is deliberately not made replayable; applying it over an existing schema fails with duplicate_table in the isolated test.

## New installations fail closed

The tested historical slice creates zero accounts, including zero default administrators. This is intentional. Ordinary registration creates a pending ordinary account; privileged account creation and approval require an already-authorized actor. Neither is a first-administrator bootstrap.

A new target requires a separately reviewed, protected bootstrap with an approved identity and a unique operator-supplied or independently generated secret, never stored in Git or logs. Verify Auth UID mapping, role, permissions and status on that new isolated target. Do not add a fixed temporary password, an encoded or hashed default, a public first-user-wins endpoint, or a password reset for existing production accounts.

The complete historical migration chain, fresh Auth setup, Storage and final RLS boundary have not been certified for empty-database reconstruction. The selected historical slice still contains historical permissive policies. Passing these source-preservation tests is not approval to expose that intermediate database or declare a new deployment secure.

## Regression and limits

`tests/historicalCredentialSanitization.test.mjs` runs in the existing complete unit gate. `tests/historicalCredentialSanitization.postgres.mjs` runs in both isolated PR workflows using PGlite and synthetic prerequisites. It validates preserved structure, zero initial accounts, unchanged existing synthetic account fields and ledger, repeatable no-ops, and rejection of structural replay. Credential helpers fail if invoked during initialization; no real credential or production connection is used.

Current-tree removal does not erase ancestors, old branch tips, PR deleted-line views, cached blobs, build artifacts, forks or downloaded copies. No Git history is rewritten by this change. It also does not invalidate any previously disclosed credential or revoke active sessions; those require a separately coordinated response that protects ongoing work. No complete backup, full restore, production login or uninterrupted operation is claimed.
