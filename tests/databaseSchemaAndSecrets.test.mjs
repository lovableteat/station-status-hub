import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("browser Supabase client stays on public until the deployment schema is switched", () => {
  const source = read("src/integrations/supabase/client.ts");

  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_SCHEMA/);
  assert.match(source, /VITE_SUPABASE_SCHEMA\s*\?\?\s*["']public["']/);
  assert.match(source, /schema:\s*SUPABASE_SCHEMA/);
  const jwtLikePrefix = ["eyJ", "hbGciOiJIUzI1NiIs"].join("");
  assert.doesNotMatch(source, new RegExp(jwtLikePrefix));
  assert.doesNotMatch(source, /https:\/\/[^"']+\.supabase\.co/);
});

test("repository ignores local environment files", () => {
  const gitignore = read(".gitignore");

  assert.match(gitignore, /(^|\n)\.env\*(?:\n|$)/);
  assert.match(gitignore, /(^|\n)!\.env\.example(?:\n|$)/);
});

test("workspace schema migration archives application tables and grants API roles", () => {
  const migration = read("supabase/migrations/20260822120000_archive_workspace_schema.sql");

  assert.match(migration, /create schema if not exists workspace/i);
  assert.match(migration, /alter table public\./i);
  assert.match(migration, /set schema workspace/i);
  assert.match(migration, /grant usage on schema workspace/i);
  assert.match(migration, /grant select, insert, update, delete on all tables in schema workspace/i);
});

test("edge functions stay on public until the remote schema cutover is enabled", () => {
  const functionFiles = [
    "supabase/functions/api/index.ts",
    "supabase/functions/account-login/index.ts",
    "supabase/functions/account-admin-sync/index.ts",
    "supabase/functions/daily-stats/index.ts",
  ];

  for (const functionFile of functionFiles) {
    const source = read(functionFile);
    assert.match(source, /Deno\.env\.get\(["']APP_DB_SCHEMA["']\)\s*\?\?\s*["']public["']/);
    assert.match(source, /schema:\s*supabaseSchema/);
  }
});

test("deployment workflows use Secrets, Variables, and the workspace profile", () => {
  const main = read(".github/workflows/main.yml");
  const keepAlive = read(".github/workflows/keep_alive.yml");

  assert.match(main, /VITE_SUPABASE_URL:\s*\$\{\{\s*secrets\.VITE_SUPABASE_URL\s*\}\}/);
  assert.match(main, /VITE_SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.VITE_SUPABASE_ANON_KEY\s*\}\}/);
  assert.match(main, /VITE_REALTIME_COLLABORATION_V2:\s*\$\{\{\s*vars\.VITE_REALTIME_COLLABORATION_V2/);
  assert.match(main, /VITE_SUPABASE_SCHEMA:\s*\$\{\{\s*vars\.VITE_SUPABASE_SCHEMA\s*\|\|\s*["']public["']/);
  assert.match(keepAlive, /Accept-Profile:\s*\$\{\{\s*vars\.SUPABASE_DB_SCHEMA\s*\|\|\s*["']public["']/);
});
