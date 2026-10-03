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
const approvalPermissionMigration = fs.readFileSync(
  "supabase/migrations/20260731170000_align_account_approval_permissions.sql",
  "utf8",
);
const accountAdminSync = fs.readFileSync(
  "supabase/functions/account-admin-sync/index.ts",
  "utf8",
);
const permissionBoundaryMigration = fs.readFileSync(
  "supabase/migrations/20261003075222_close_permission_table_boundary.sql",
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
  assert.match(approvalPermissionMigration, /CREATE OR REPLACE FUNCTION public\.can_manage_system_users/);
  assert.match(approvalPermissionMigration, /page_permission\.permission = 'admin_edit'/);
  assert.match(approvalPermissionMigration, /NOT public\.can_manage_system_users\(\)/);
  assert.match(accountAdminSync, /caller\.rpc\(\s*"(?:create|update|delete)_system_user_admin_profile"/);
  assert.match(permissionBoundaryMigration, /create or replace function workspace\.approve_system_user[\s\S]+for update/i);
  assert.match(permissionBoundaryMigration, /not workspace\.can_manage_system_users\(\)/i);
});

test("the auth upgrade signs out once without reloading the page", () => {
  assert.match(context, /AUTH_SESSION_VERSION/);
  assert.doesNotMatch(context, /window\.location\.reload/);
  assert.doesNotMatch(login, /window\.location\.reload/);
});
