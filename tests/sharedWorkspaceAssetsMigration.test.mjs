import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260822190000_shared_workspace_assets.sql",
  import.meta.url,
);

const assetTables = ["tools_management", "code_snippets", "command_library"];
const readMigration = () => readFile(migrationUrl, "utf8");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("shared assets add workspace scope columns and preserve existing rows as global", async () => {
  const sql = await readMigration();

  for (const table of assetTables) {
    const qualifiedTable = `workspace.${table}`;
    const escapedTable = escapeRegExp(qualifiedTable);

    assert.match(
      sql,
      new RegExp(
        `alter table ${escapedTable}[\\s\\S]*?add column if not exists scope text[\\s\\S]*?add column if not exists owner_workspace text`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(`update ${escapedTable}\\s+set scope = 'global'\\s+where scope is null`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`alter table ${escapedTable}[\\s\\S]*?alter column scope set default 'global'`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`alter table ${escapedTable}[\\s\\S]*?alter column scope set not null`, "i"),
    );
  }

  assert.doesNotMatch(sql, /alter table public\.(?:tools_management|code_snippets|command_library)/i);
  assert.doesNotMatch(sql, /create table[^;]*(?:general_files|uploaded_files)/i);
});

test("shared asset constraints enforce valid global and workspace ownership", async () => {
  const sql = await readMigration();

  for (const table of assetTables) {
    const constraintName = `${table}_scope_owner_check`;
    const constraint = sql.match(
      new RegExp(
        `add constraint ${escapeRegExp(constraintName)}\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*;`,
        "i",
      ),
    )?.[1];

    assert.ok(constraint, `expected ${constraintName}`);
    assert.match(constraint, /scope = 'global'\s+and owner_workspace is null/i);
    assert.match(
      constraint,
      /scope = 'workspace'\s+and nullif\(btrim\(owner_workspace\), ''\) is not null/i,
    );
  }
});

test("shared asset indexes support scope and owner lookups idempotently", async () => {
  const sql = await readMigration();

  for (const table of assetTables) {
    assert.match(
      sql,
      new RegExp(
        `create index if not exists idx_${escapeRegExp(table)}_scope_owner_workspace\\s+on workspace\\.${escapeRegExp(table)}\\s*\\(scope, owner_workspace\\)`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `alter table workspace\\.${escapeRegExp(table)}\\s+drop constraint if exists ${escapeRegExp(table)}_scope_owner_check`,
        "i",
      ),
    );
  }
});

test("workspace maintenance search accepts an optional workspace and filters every asset kind", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /drop function if exists workspace\.search_maintenance_knowledge\(text, uuid\[\], integer\)/i,
  );
  assert.match(
    sql,
    /create or replace function workspace\.search_maintenance_knowledge\([\s\S]*?p_workspace text default 'station-status'/i,
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = workspace, extensions, auth, pg_temp/i);
  assert.match(sql, /v_workspace text := btrim\(coalesce\(p_workspace, 'station-status'\)\)/i);

  for (const alias of ["tools", "snippets", "commands"]) {
    assert.match(
      sql,
      new RegExp(
        `\\(\\s*${alias}\\.scope = 'global'\\s+or \\(\\s*${alias}\\.scope = 'workspace'\\s+and ${alias}\\.owner_workspace = v_workspace\\s*\\)\\s*\\)`,
        "i",
      ),
    );
  }

  for (const table of [
    "test_project_tool_assignments",
    "test_project_code_assignments",
    "test_project_command_assignments",
  ]) {
    assert.match(sql, new RegExp(`workspace\\.${table}`, "i"));
  }
});

test("shared asset tables and RPC retain the app role grants", async () => {
  const sql = await readMigration();

  for (const table of assetTables) {
    assert.match(
      sql,
      new RegExp(
        `grant select, insert, update, delete on table workspace\\.${escapeRegExp(table)} to anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  assert.match(
    sql,
    /revoke all on function workspace\.search_maintenance_knowledge\(text, uuid\[\], integer, text\) from public/i,
  );
  assert.match(
    sql,
    /grant execute on function workspace\.search_maintenance_knowledge\(text, uuid\[\], integer, text\) to anon, authenticated, service_role/i,
  );
});
