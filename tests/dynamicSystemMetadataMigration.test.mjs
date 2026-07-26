import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260726120000_dynamic_system_metadata.sql",
  import.meta.url
);

const typesUrl = new URL("../src/integrations/supabase/types.ts", import.meta.url);

const migration = async () => readFile(migrationUrl, "utf8");

test("dynamic system metadata defines constrained field and value tables", async () => {
  const source = await migration();

  assert.match(source, /create table if not exists public\.test_project_system_fields/i);
  assert.match(source, /category text not null check \(category in \('software', 'statistics'\)\)/i);
  assert.match(source, /field_key text not null/i);
  assert.match(source, /field_type text not null check \(field_type in \('text', 'number', 'boolean', 'select'\)\)/i);
  assert.match(source, /options jsonb not null default '\[\]'::jsonb/i);
  assert.match(source, /is_required boolean not null default false/i);
  assert.match(source, /is_system boolean not null default false/i);
  assert.match(source, /unique index if not exists idx_test_project_system_fields_project_key\s+on public\.test_project_system_fields\(project_id, field_key\)/i);
  assert.match(source, /index if not exists idx_test_project_system_fields_project_order\s+on public\.test_project_system_fields\(project_id, sort_order, created_at\)/i);

  assert.match(source, /create table if not exists public\.test_system_field_values/i);
  assert.match(source, /value jsonb not null default 'null'::jsonb/i);
  assert.match(source, /primary key \(field_id, system_id\)/i);
  assert.match(source, /index if not exists idx_test_system_field_values_system\s+on public\.test_system_field_values\(system_id\)/i);
});

test("dynamic system metadata is available to the custom anon client", async () => {
  const source = await migration();

  for (const table of ["test_project_system_fields", "test_system_field_values"]) {
    assert.match(source, new RegExp(`grant select, insert, update, delete on public\\.${table} to anon`, "i"));
    assert.match(source, new RegExp(`grant select, insert, update, delete on public\\.${table} to authenticated`, "i"));
    assert.match(source, new RegExp(`grant all on public\\.${table} to service_role`, "i"));
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(source, new RegExp(`create policy "Allow anonymous access to ${table}"[\\s\\S]*?on public\\.${table} for all using \\(true\\) with check \\(true\\)`, "i"));
    assert.match(source, new RegExp(`alter publication supabase_realtime add table public\\.${table}`, "i"));
  }
});

test("dynamic system metadata seeds reserved values and migrates legacy software data", async () => {
  const source = await migration();

  for (const key of ["bom_90", "ubuntu_version", "cuda_version", "include_in_dashboard"]) {
    assert.match(source, new RegExp(`'${key}'`, "i"));
  }
  assert.match(source, /from public\.test_projects/i);
  assert.match(source, /from public\.test_systems/i);
  assert.match(source, /to_jsonb\(systems\.bom_90\)/i);
  assert.match(source, /to_jsonb\(systems\.ubuntu_version\)/i);
  assert.match(source, /to_jsonb\(systems\.cuda_version\)/i);
  assert.match(source, /to_jsonb\(not coalesce\(systems\.exclude_from_dashboard, false\)\)/i);
  assert.match(source, /from public\.test_project_software_fields legacy_fields/i);
  assert.match(source, /md5\(legacy_fields\.id::text\)/i);
  assert.match(source, /from public\.test_system_software_values legacy_values/i);
  assert.match(source, /to_jsonb\(legacy_values\.value\)/i);
  assert.match(source, /on conflict \(project_id, field_key\) do nothing/i);
  assert.match(source, /on conflict \(field_id, system_id\) do nothing/i);
});

test("metadata seed migration preserves user edits and the hardening hook seeds future projects", async () => {
  const [baseSource, hardeningSource] = await Promise.all([
    migration(),
    readFile(
      new URL(
        "../supabase/migrations/20260726123000_harden_system_metadata.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    baseSource,
    /on conflict \(project_id, field_key\) do nothing/i,
  );
  assert.match(
    baseSource,
    /on conflict \(field_id, system_id\) do nothing/i,
  );
  assert.doesNotMatch(baseSource, /label = excluded\.label/i);
  assert.doesNotMatch(baseSource, /sort_order = excluded\.sort_order/i);
  assert.match(
    hardeningSource,
    /create or replace function public\.seed_reserved_system_metadata_fields/i,
  );
  assert.match(hardeningSource, /after insert on public\.test_projects/i);
  assert.match(hardeningSource, /new\.id/i);
  assert.match(hardeningSource, /on conflict \(project_id, field_key\) do nothing/i);
  assert.match(hardeningSource, /drop trigger if exists seed_reserved_system_metadata_fields/i);
});

test("generated database types expose both dynamic metadata tables", async () => {
  const source = await readFile(typesUrl, "utf8");

  const fields = source.match(/test_project_system_fields: \{([\s\S]*?)\n      \}\n      test_project_tool_assignments:/i)?.[1];
  const values = source.match(/test_system_field_values: \{([\s\S]*?)\n      \}\n      test_systems:/i)?.[1];

  assert.ok(fields, "expected a test_project_system_fields table definition");
  assert.ok(values, "expected a test_system_field_values table definition");
  for (const property of [
    "category: string",
    "field_key: string",
    "field_type: string",
    "options: Json",
    "is_required: boolean",
    "is_system: boolean",
    "test_project_system_fields_project_id_fkey",
  ]) {
    assert.match(fields, new RegExp(property));
  }
  for (const property of [
    "field_id: string",
    "system_id: string",
    "value: Json",
    "test_system_field_values_field_id_fkey",
    "test_system_field_values_system_id_fkey",
  ]) {
    assert.match(values, new RegExp(property));
  }
});
