import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const login = fs.readFileSync("src/components/auth/LoginPage.tsx", "utf8");
const context = fs.readFileSync("src/components/auth/UserContext.tsx", "utf8");
const admin = fs.readFileSync("src/components/admin/AdminPanel.tsx", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260731120000_registration_and_shared_data_center.sql",
  "utf8",
);

test("self-registration creates a pending account with a real display name", () => {
  assert.match(login, /正確姓名/);
  assert.match(context, /register_system_user/);
  assert.match(migration, /display_name_input text/);
  assert.match(migration, /'pending'/);
  assert.match(migration, /'self-registration'/);
});

test("an administrator must explicitly approve pending accounts", () => {
  assert.match(admin, /approve_system_user/);
  assert.match(admin, /核准登入/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.approve_system_user/);
});

test("the auth upgrade signs out once without reloading the page", () => {
  assert.match(context, /AUTH_SESSION_VERSION/);
  assert.doesNotMatch(context, /window\.location\.reload/);
  assert.doesNotMatch(login, /window\.location\.reload/);
});
