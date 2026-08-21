import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("browser Supabase client reads deployment environment and uses workspace schema", () => {
  const source = read("src/integrations/supabase/client.ts");

  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.match(source, /schema:\s*["']workspace["']/);
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

test("deployment workflows use Secrets, Variables, and the workspace profile", () => {
  const main = read(".github/workflows/main.yml");
  const keepAlive = read(".github/workflows/keep_alive.yml");

  assert.match(main, /VITE_SUPABASE_URL:\s*\$\{\{\s*secrets\.VITE_SUPABASE_URL\s*\}\}/);
  assert.match(main, /VITE_SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.VITE_SUPABASE_ANON_KEY\s*\}\}/);
  assert.match(main, /VITE_REALTIME_COLLABORATION_V2:\s*\$\{\{\s*vars\.VITE_REALTIME_COLLABORATION_V2/);
  assert.match(keepAlive, /Accept-Profile:\s*workspace/);
});
