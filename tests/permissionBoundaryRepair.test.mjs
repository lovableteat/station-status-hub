import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("permission boundary migration locks before a fresh authorization decision", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );
  const fiveArg = sql.match(
    /create or replace function workspace\.set_user_access_permissions\([\s\S]+?p_performance_manager boolean[\s\S]+?\$\$;/i,
  )?.[0] ?? "";

  assert.match(fiveArg, /for v_lock_user_id in[\s\S]+order by lock_user_id/i);
  assert.match(fiveArg, /for update/i);
  assert.match(fiveArg, /if[\s\S]+not workspace\.can_manage_system_users\(\)/i);
  assert.ok(
    fiveArg.toLowerCase().indexOf("for update")
      < fiveArg.toLowerCase().indexOf("workspace.can_manage_system_users()"),
    "authorization must happen after row locking",
  );
  assert.match(fiveArg, /performanceManager/);
  assert.match(fiveArg, /p_performance_manager is null/i);
});

test("approval and account profile mutations lock before fresh authorization", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  for (const functionName of [
    "approve_system_user",
    "create_system_user_admin_profile",
    "update_system_user_admin_profile",
    "delete_system_user_admin_profile",
    "authorize_system_user_admin_sync",
  ]) {
    const body = sql.match(
      new RegExp(`create or replace function workspace\\.${functionName}\\([\\s\\S]+?\\$\\$;`, "i"),
    )?.[0] ?? "";
    assert.match(body, /for update/i, `${functionName} must take a row lock`);
    assert.match(body, /workspace\.can_manage_system_users\(\)/i);
    assert.ok(
      body.toLowerCase().indexOf("for update")
        < body.toLowerCase().lastIndexOf("workspace.can_manage_system_users()"),
      `${functionName} must authorize after locking`,
    );
  }
});

test("legacy account Edge path rejects permission payloads and uses guarded RPCs", async () => {
  const edge = await read("../supabase/functions/account-admin-sync/index.ts");

  assert.match(edge, /npm:@supabase\/supabase-js@2\.100\.0/);
  assert.doesNotMatch(edge, /esm\.sh\/@supabase\/supabase-js@2["']/);
  assert.match(edge, /Object\.prototype\.hasOwnProperty\.call\([^,]+,\s*["']permissions["']\)/);
  assert.match(edge, /Permission changes require the atomic permission RPC/);
  assert.doesNotMatch(edge, /updateData\.permissions\s*=/);
  assert.doesNotMatch(edge, /permissions:\s*target\.permissions/);
  for (const rpc of [
    "create_system_user_admin_profile",
    "update_system_user_admin_profile",
    "delete_system_user_admin_profile",
    "authorize_system_user_admin_sync",
  ]) {
    assert.match(edge, new RegExp(`caller\\.rpc\\(\\s*["']${rpc}["']`));
  }
});

test("admin account writers never fall back to restricted table mutations", async () => {
  const [panel, editor, sync] = await Promise.all([
    read("../src/components/admin/AdminPanel.tsx"),
    read("../src/components/admin/UserEditDialog.tsx"),
    read("../src/components/admin/authAccountSync.ts"),
  ]);

  for (const source of [panel, editor]) {
    assert.doesNotMatch(source, /\.from\(['"]system_users['"]\)[\s\S]{0,180}\.(?:insert|update|delete)\(/);
    assert.doesNotMatch(source, /rpc\(['"]hash_password['"]/);
  }
  assert.match(panel, /action:\s*"create"/);
  assert.match(panel, /action:\s*"update"/);
  assert.match(panel, /action:\s*"delete"/);
  assert.match(editor, /mutateAuthAccount\(userId/);
  assert.doesNotMatch(sync, /Realtime account synchronization is disabled/);
});

test("SQL3 preserves the production seven-column account roster boundary", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  assert.match(sql, /revoke all on table workspace\.system_users from authenticated/i);
  assert.match(
    sql,
    /grant select\s*\(\s*id,\s*auth_user_id,\s*username,\s*display_name,\s*permissions,\s*role,\s*status\s*\)\s*on workspace\.system_users to authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant select\s*\([^)]*(?:password_hash|created_at|last_seen_at|avatar_path)[^)]*\)\s*on workspace\.system_users to authenticated/i,
  );
});

test("durable permission fallback is absent-only and malformed values fail closed", async () => {
  const sql1 = await read(
    "../supabase/migrations/20261002160000_enforce_explicit_permission_revocation.sql",
  );

  assert.match(sql1, /when not \(coalesce\(account\.permissions, '\{\}'::jsonb\) \? 'pagePermissions'\)[\s\S]+from workspace\.user_page_permissions/i);
  assert.match(sql1, /when jsonb_typeof\(account\.permissions -> 'pagePermissions'\) = 'array'/i);
  assert.match(sql1, /else false/i);
});

test("permission boundary keeps compatibility aliases and closes default ACLs", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  assert.match(sql, /select workspace\.set_user_access_permissions\([\s\S]+null\s*\);/i);
  for (const schema of ["workspace", "public"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function ${schema}\\.set_user_access_permissions\\(\\s*uuid,\\s*public\\.page_permission\\[\\],\\s*jsonb,\\s*text,\\s*boolean\\s*\\) from public, anon`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function ${schema}\\.set_user_access_permissions\\(\\s*uuid,\\s*public\\.page_permission\\[\\],\\s*jsonb,\\s*text,\\s*boolean\\s*\\) to authenticated, service_role`,
        "i",
      ),
    );
  }
});

test("migration ordering fails closed instead of letting SQL2 downgrade SQL3", async () => {
  const sql2 = await read(
    "../supabase/migrations/20261002170000_align_account_permission_mutation_entrypoints.sql",
  );
  const sql3 = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  assert.match(sql2, /20261003075222[\s\S]+SQL2 cannot run after SQL3/i);
  assert.match(sql3, /20261002170000[\s\S]+SQL3 requires SQL2/i);
});

test("permission table is read-only to authenticated clients with a narrow policy", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  assert.match(sql, /revoke all on table workspace\.user_page_permissions\s+from public, anon, authenticated/i);
  assert.match(sql, /grant select on table workspace\.user_page_permissions to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)[^;]*user_page_permissions[^;]*authenticated/i);
  assert.match(sql, /create policy user_page_permissions_authenticated_read/i);
  assert.match(sql, /user_id = \(select workspace\.current_system_user_id\(\)\)/i);
  assert.match(sql, /workspace\.can_manage_system_users\(\)/i);
});

test("migration is non-destructive and does not rewrite unrelated boundaries", async () => {
  const sql = await read(
    "../supabase/migrations/20261003075222_close_permission_table_boundary.sql",
  );

  assert.doesNotMatch(sql, /(?:truncate|drop table)\s+/i);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+workspace\.(?:test_|material_|issues|api_keys)/i);
  assert.doesNotMatch(sql, /alter table workspace\.system_users/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

test("operational rollback remains fail-closed", async () => {
  const rollback = await read(
    "../docs/audits/2026-10-03-permission-boundary-safe-containment.sql",
  );
  const runbook = await read(
    "../docs/audits/2026-10-03-permission-boundary-rollout.md",
  );

  assert.match(rollback, /from public, anon, authenticated/i);
  for (const rpc of [
    "create_system_user_admin_profile",
    "update_system_user_admin_profile",
    "delete_system_user_admin_profile",
    "authorize_system_user_admin_sync",
    "approve_system_user",
  ]) {
    assert.match(rollback, new RegExp(`revoke all on function (?:workspace|public)\\.${rpc}`, "i"));
  }
  assert.match(rollback, /grant select on table workspace\.user_page_permissions to authenticated/i);
  assert.doesNotMatch(rollback, /grant\s+(?:all|insert|update|delete)[^;]*user_page_permissions[^;]*authenticated/i);
  assert.match(runbook, /20261002160000[\s\S]+20261002170000[\s\S]+20261003075222[\s\S]+Deploy the frontend/i);
  assert.match(runbook, /scoped recovery capture[\s\S]+not[\s\S]+full backup/i);
});
