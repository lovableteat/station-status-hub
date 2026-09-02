import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("login normalizes only the username and preserves the password", async () => {
  const userContext = await read("src/components/auth/UserContext.tsx");
  const edgeLogin = await read("supabase/functions/account-login/index.ts");

  assert.match(userContext, /const normalizedUsername = username\.trim\(\)\.toLowerCase\(\);/);
  assert.match(userContext, /password_input: password/);
  assert.match(edgeLogin, /payload\?\.username[^\n]*\.trim\(\)\.toLowerCase\(\)/);
  assert.match(edgeLogin, /password_input: password/);
  assert.doesNotMatch(userContext, /password\.trim\(\)|password\.toLowerCase\(\)/);
  assert.doesNotMatch(edgeLogin, /payload\?\.password[^\n]*\.trim\(|payload\?\.password[^\n]*\.toLowerCase\(/);
});

test("database authentication compares normalized usernames and untouched passwords", async () => {
  const migration = await read("supabase/migrations/20260902120000_case_insensitive_usernames.sql");

  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS system_users_username_lower_unique/i);
  assert.match(migration, /lower\(users\.username\)\s*=\s*normalized_username/i);
  assert.match(migration, /public\.verify_password\(password_input, user_record\.password_hash\)/i);
  assert.match(migration, /workspace\.authenticate_user\(username_input text, password_input text\)/i);
  assert.match(migration, /SELECT \* FROM public\.authenticate_user\(\$1, \$2\)/i);
  assert.doesNotMatch(migration, /lower\(password_input\)|btrim\(password_input\)/i);
});
