# Database Schema And Secret Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move application tables into one exposed `workspace` schema, make the browser client consume deployment-provided environment variables, ignore `.env`, and remove `.env` and hard-coded Supabase credentials from Git history.

**Architecture:** Keep Supabase-managed `auth`, `storage`, and `realtime` schemas unchanged. Create a single application namespace named `workspace` so existing cross-workspace foreign keys remain intact, move the application tables there with an idempotent migration, and clone application RPC functions into that schema while preserving public compatibility for triggers and legacy callers. Configure the Supabase client and Edge Functions to use `workspace` as their default database schema; keep storage calls and authentication services unchanged.

**Tech Stack:** Supabase PostgreSQL migrations, Supabase JS v2, Vite `import.meta.env`, GitHub Actions secrets/variables, Node test runner, ESLint, Vite build, Git history rewrite.

## Global Constraints

- Do not print or commit values from `.env`; inspect only variable names and secret-presence metadata.
- Do not change Supabase-managed `auth`, `storage`, or `realtime` schemas.
- Do not reset the database, delete historical migrations, or rewrite migration files that have already been applied.
- The new migration must be idempotent for every table that exists in the current workspace schema registry.
- GitHub Actions may read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Secrets and `VITE_REALTIME_COLLABORATION_V2` from Variables; no credential may remain in source or Git history.
- Existing public RPC functions remain available for legacy triggers/callers; workspace copies are used by the application client.

---

### Task 1: Add failing repository contracts

**Files:**
- Create: `tests/databaseSchemaAndSecrets.test.mjs`
- Test: `src/integrations/supabase/client.ts`, `.gitignore`, `supabase/migrations/20260822120000_archive_workspace_schema.sql`, `supabase/config.toml`, `.github/workflows/main.yml`, `.github/workflows/keep_alive.yml`

- [ ] **Step 1: Write the failing test**

Add tests that assert the intended contract without reading secret values:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("browser Supabase client reads deployment environment and uses workspace schema", () => {
  const source = read("src/integrations/supabase/client.ts");
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.match(source, /schema:\s*[\"']workspace[\"']/);
  const jwtLikePrefix = [\"eyJ\", \"hbGciOiJIUzI1NiIs\"].join(\"\");
  assert.doesNotMatch(source, new RegExp(jwtLikePrefix));
  assert.doesNotMatch(source, /https:\/\/[^\"']+\.supabase\.co/);
});

test("repository ignores local environment files", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /(^|\n)\.env(\*|\n|$)/);
  assert.match(gitignore, /(^|\n)!\.env\.example(\n|$)/);
});

test("workspace schema migration archives application tables and grants API roles", () => {
  const migration = read("supabase/migrations/20260822120000_archive_workspace_schema.sql");
  assert.match(migration, /create schema if not exists workspace/i);
  assert.match(migration, /alter table public\./i);
  assert.match(migration, /set schema workspace/i);
  assert.match(migration, /grant usage on schema workspace/i);
  assert.match(migration, /grant select, insert, update, delete on all tables in schema workspace/i);
});

test("deployment workflows use Secrets, Variables, and the workspace profile", () => {
  const main = read(".github/workflows/main.yml");
  const keepAlive = read(".github/workflows/keep_alive.yml");
  assert.match(main, /VITE_SUPABASE_URL:\s*\$\{\{\s*secrets\.VITE_SUPABASE_URL\s*\}\}/);
  assert.match(main, /VITE_SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.VITE_SUPABASE_ANON_KEY\s*\}\}/);
  assert.match(main, /VITE_REALTIME_COLLABORATION_V2:\s*\$\{\{\s*vars\.VITE_REALTIME_COLLABORATION_V2/);
  assert.match(keepAlive, /Accept-Profile: workspace/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
node --test tests/databaseSchemaAndSecrets.test.mjs
```

Expected: FAIL because the client still contains a literal Supabase URL/key, `.gitignore` does not yet protect `.env`, and the schema migration does not yet exist.

### Task 2: Remove hard-coded browser credentials and define local configuration

**Files:**
- Modify: `src/integrations/supabase/client.ts`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Implement environment-backed client configuration**

Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the primary names, accept the old local-only `VITE_SUPABASE_PUBLISHABLE_KEY` as a compatibility fallback, fail with a clear message when either required value is absent, and set the Supabase JS default database schema to `workspace`.

- [ ] **Step 2: Document safe local setup**

Create `.env.example` containing variable names only:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_REALTIME_COLLABORATION_V2=true
```

Update README setup/deployment text so `.env` is local-only, `.env.example` is the committed template, and GitHub Actions Secrets/Variables are the production source.

- [ ] **Step 3: Run the focused client contract**

Run:

```powershell
node --test tests/databaseSchemaAndSecrets.test.mjs --test-name-pattern "browser Supabase client"
```

Expected: PASS for the client contract; repository and migration contracts remain red until their tasks are implemented.

### Task 3: Add the workspace schema migration and generated type surface

**Files:**
- Create: `supabase/migrations/20260822120000_archive_workspace_schema.sql`
- Modify: `supabase/config.toml`
- Modify: `src/integrations/supabase/types.ts`
- Create: `docs/database-schema.md`

- [ ] **Step 1: Write the schema registry and migration**

Use an explicit registry for every application table currently represented by the generated Supabase types, including legacy tables that are not created by the newest migrations. The migration must:

1. Create `workspace` if it does not exist.
2. Grant schema usage and table DML to `anon`, `authenticated`, and `service_role` so existing RLS policies remain authoritative.
3. Move only existing ordinary/partitioned/foreign application tables from `public` to `workspace`.
4. Keep Supabase-managed schemas untouched.
5. Clone public application RPC functions into `workspace`, rewrite explicit `public.<application_table>` references to `workspace.<application_table>`, set their search path to `workspace, public, auth, storage, realtime, extensions, pg_temp`, and grant execute to API roles.
6. Update the original public application functions' search path and explicit table references so triggers and legacy callers continue to work.
7. Notify PostgREST to reload its schema cache.

- [ ] **Step 2: Configure local Supabase API exposure**

Add `[api] schemas = ["public", "workspace"]` to `supabase/config.toml` and document that the hosted Supabase project must expose `workspace` in API settings before production requests can use it. The migration grants database privileges; the hosted API allow-list remains a project-level setting.

- [ ] **Step 3: Make generated types available under `workspace`**

Refactor the generated type declaration into a private base schema type, export `Database` as the existing database plus `workspace: BaseDatabase["public"]`, and preserve existing `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, and `CompositeTypes` helper behavior.

- [ ] **Step 4: Add the table archive registry documentation**

Document the `workspace` namespace, the unchanged Supabase-managed schemas, the migration filename, and the requirement to expose `workspace` in the hosted API. List the table groups by current workspace domain so future migrations add new application tables to the same namespace.

- [ ] **Step 5: Run schema contracts and type/build checks**

Run:

```powershell
node --test tests/databaseSchemaAndSecrets.test.mjs --test-name-pattern "workspace schema"
npm run build
```

Expected: the schema contract passes and the TypeScript/Vite build exits 0.

### Task 4: Update Edge Functions and keep-alive requests for the custom schema

**Files:**
- Modify: `supabase/functions/api/index.ts`
- Modify: `supabase/functions/account-login/index.ts`
- Modify: `supabase/functions/account-admin-sync/index.ts`
- Modify: `supabase/functions/daily-stats/index.ts`
- Modify: `.github/workflows/keep_alive.yml`

- [ ] **Step 1: Set the Edge Function database default**

Pass `{ db: { schema: "workspace" } }` to every application Supabase client created in the Edge Functions. Storage bucket calls remain `storage.from(bucketName)`; RPC calls resolve against the workspace clones created by the migration.

- [ ] **Step 2: Add the PostgREST profile header to keep-alive**

Keep the URL sourced from `secrets.VITE_SUPABASE_URL`, keep the anon key in both required headers, and add `Accept-Profile: workspace` to the GET request.

- [ ] **Step 3: Run Edge Function syntax checks**

Run:

```powershell
npx --yes esbuild supabase/functions/api/index.ts --bundle --platform=neutral --format=esm --outfile="$env:TEMP\workspace-api-check.js"
npx --yes esbuild supabase/functions/account-login/index.ts --bundle --platform=neutral --format=esm --outfile="$env:TEMP\workspace-account-login-check.js"
npx --yes esbuild supabase/functions/account-admin-sync/index.ts --bundle --platform=neutral --format=esm --outfile="$env:TEMP\workspace-account-admin-sync-check.js"
npx --yes esbuild supabase/functions/daily-stats/index.ts --bundle --platform=neutral --format=esm --outfile="$env:TEMP\workspace-daily-stats-check.js"
```

Expected: all four commands exit 0.

### Task 5: Ignore `.env`, remove it from the index, and purge its history and credential literals

**Files:**
- Modify: `.gitignore`
- Keep local-only: `.env` (remove from Git index; do not delete the working copy)

- [ ] **Step 1: Add ignore rules and untrack the local file**

Add `.env*` and an exception for `.env.example` to `.gitignore`, then run `git rm --cached -- .env` so the local file remains available without being staged.

- [ ] **Step 2: Verify the current tree contains no tracked environment file or credential literal**

Run:

```powershell
git ls-files -- '.env*'
rg -n --hidden -g '!node_modules' -g '!dist' -g '!docs/superpowers/plans/**' -g '!docs/superpowers/specs/**' 'VITE_SUPABASE_PUBLISHABLE_KEY\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=' .
```

Expected: the first command prints only `.env.example`, and the second command prints no credential value or hard-coded key.

- [ ] **Step 3: Rewrite all Git refs to remove `.env` and the old hard-coded key**

Use `git filter-repo` if available, otherwise install the isolated `git-filter-repo` utility and run a repository-wide rewrite that removes `.env` and replaces the old credential literal in every historical blob. Expire reflogs and prune unreachable objects only after confirming the rewritten refs no longer contain `.env` or the credential literal.

- [ ] **Step 4: Force-update the explicitly requested remote history**

After reviewing the rewritten commit graph and confirming no secret values are printed, force-push the rewritten `main` ref to `origin` and verify GitHub no longer returns `.env` from the branch history.

### Task 6: Final verification, commit, push, and deployment checks

**Files:**
- Test: all changed source, migration, workflow, and history contracts

- [ ] **Step 1: Run focused tests and lint**

```powershell
node --test tests/databaseSchemaAndSecrets.test.mjs tests/platformLogo.test.mjs tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs
npm exec eslint src/integrations/supabase/client.ts src/integrations/supabase/types.ts supabase/functions/api/index.ts supabase/functions/account-login/index.ts supabase/functions/account-admin-sync/index.ts supabase/functions/daily-stats/index.ts tests/databaseSchemaAndSecrets.test.mjs
```

- [ ] **Step 2: Run production build and diff checks**

```powershell
git diff --check
npm run build
```

- [ ] **Step 3: Review the staged diff without reading secret values**

Confirm the diff contains only the planned migration, type/client/config/workflow/docs changes, `.gitignore`/`.env.example`, tests, and history-safe removals. Confirm `.env` is not staged.

- [ ] **Step 4: Commit and push**

```powershell
git add -- .gitignore .env.example README.md docs/database-schema.md supabase/config.toml supabase/migrations/20260822120000_archive_workspace_schema.sql src/integrations/supabase/client.ts src/integrations/supabase/types.ts supabase/functions .github/workflows/keep_alive.yml tests/databaseSchemaAndSecrets.test.mjs
git commit -m "chore: archive workspace schema and remove env history"
git push --force origin main
```

- [ ] **Step 5: Verify deployment and repository state**

Check the latest GitHub Actions run for the pushed SHA, wait for a successful Pages deployment, inspect the production JavaScript bundle for environment-backed configuration and absence of the old credential literal, and finish with:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git log --all --format='' --name-only -- '.env'
```

Expected: clean branch, matching local/remote SHA, and no `.env` path in reachable history. The live database migration is considered applied only if an authenticated Supabase migration command succeeds; repository migration files and API exposure documentation alone do not prove that remote state changed.
