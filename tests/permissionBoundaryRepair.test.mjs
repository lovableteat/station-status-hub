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
  assert.match(rollback, /grant select on table workspace\.user_page_permissions to authenticated/i);
  assert.doesNotMatch(rollback, /grant\s+(?:all|insert|update|delete)[^;]*user_page_permissions[^;]*authenticated/i);
  assert.match(runbook, /20261002160000[\s\S]+20261002170000[\s\S]+20261003075222[\s\S]+Deploy the frontend/i);
  assert.match(runbook, /metadata and aggregate snapshot, not a backup/i);
});
