-- Additive-only audit tables for the production material request workspace.
-- Existing BOM tables, records, JSON payloads and images are not modified.

create table if not exists public.material_bom_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references public.material_bom_workspaces(id) on delete set null,
  record_id text,
  action text not null,
  actor_id text,
  actor_name text,
  previous_updated_at timestamptz,
  new_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_material_bom_audit_workspace_created
  on public.material_bom_audit_logs (workspace_id, created_at desc);

create index if not exists idx_material_bom_audit_record_created
  on public.material_bom_audit_logs (workspace_id, record_id, created_at desc);

create table if not exists public.material_bom_export_logs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id text not null,
  workspace_id text references public.material_bom_workspaces(id) on delete set null,
  export_format text not null check (export_format in ('excel', 'html', 'html_zip')),
  file_name text not null,
  actor_id text,
  actor_name text,
  data_as_of timestamptz not null,
  exported_at timestamptz not null default now(),
  filters jsonb not null default '[]'::jsonb,
  original_group_count integer not null default 0,
  filtered_group_count integer not null default 0,
  row_count integer not null default 0
);

create index if not exists idx_material_bom_export_workspace_created
  on public.material_bom_export_logs (workspace_id, exported_at desc);

alter table public.material_bom_audit_logs enable row level security;
alter table public.material_bom_export_logs enable row level security;

drop policy if exists "Anyone can select material_bom_audit_logs" on public.material_bom_audit_logs;
drop policy if exists "Anyone can insert material_bom_audit_logs" on public.material_bom_audit_logs;
drop policy if exists "Anyone can select material_bom_export_logs" on public.material_bom_export_logs;
drop policy if exists "Anyone can insert material_bom_export_logs" on public.material_bom_export_logs;

create policy "Anyone can select material_bom_audit_logs"
  on public.material_bom_audit_logs for select using (true);
create policy "Anyone can insert material_bom_audit_logs"
  on public.material_bom_audit_logs for insert with check (true);
create policy "Anyone can select material_bom_export_logs"
  on public.material_bom_export_logs for select using (true);
create policy "Anyone can insert material_bom_export_logs"
  on public.material_bom_export_logs for insert with check (true);

grant select, insert on public.material_bom_audit_logs to anon, authenticated, service_role;
grant select, insert on public.material_bom_export_logs to anon, authenticated, service_role;
