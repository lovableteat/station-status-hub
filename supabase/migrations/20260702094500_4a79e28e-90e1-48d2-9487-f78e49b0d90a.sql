create table if not exists public.material_bom_workspaces (
  id text primary key,
  name text not null,
  source_file text not null,
  sheet_name text not null,
  generated_at timestamptz not null default now(),
  record_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_bom_records (
  workspace_id text not null references public.material_bom_workspaces(id) on delete cascade,
  record_id text not null,
  order_index integer not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, record_id)
);

create index if not exists idx_material_bom_workspaces_updated_at
  on public.material_bom_workspaces (updated_at desc);

create index if not exists idx_material_bom_records_workspace_order
  on public.material_bom_records (workspace_id, order_index);

alter table public.material_bom_workspaces enable row level security;
alter table public.material_bom_records enable row level security;

drop policy if exists "Anyone can select material_bom_workspaces" on public.material_bom_workspaces;
drop policy if exists "Anyone can insert material_bom_workspaces" on public.material_bom_workspaces;
drop policy if exists "Anyone can update material_bom_workspaces" on public.material_bom_workspaces;
drop policy if exists "Anyone can delete material_bom_workspaces" on public.material_bom_workspaces;
drop policy if exists "Anyone can select material_bom_records" on public.material_bom_records;
drop policy if exists "Anyone can insert material_bom_records" on public.material_bom_records;
drop policy if exists "Anyone can update material_bom_records" on public.material_bom_records;
drop policy if exists "Anyone can delete material_bom_records" on public.material_bom_records;

create policy "Anyone can select material_bom_workspaces"
  on public.material_bom_workspaces for select
  using (true);

create policy "Anyone can insert material_bom_workspaces"
  on public.material_bom_workspaces for insert
  with check (true);

create policy "Anyone can update material_bom_workspaces"
  on public.material_bom_workspaces for update
  using (true)
  with check (true);

create policy "Anyone can delete material_bom_workspaces"
  on public.material_bom_workspaces for delete
  using (true);

create policy "Anyone can select material_bom_records"
  on public.material_bom_records for select
  using (true);

create policy "Anyone can insert material_bom_records"
  on public.material_bom_records for insert
  with check (true);

create policy "Anyone can update material_bom_records"
  on public.material_bom_records for update
  using (true)
  with check (true);

create policy "Anyone can delete material_bom_records"
  on public.material_bom_records for delete
  using (true);

drop trigger if exists update_material_bom_workspaces_updated_at on public.material_bom_workspaces;
create trigger update_material_bom_workspaces_updated_at
before update on public.material_bom_workspaces
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_material_bom_records_updated_at on public.material_bom_records;
create trigger update_material_bom_records_updated_at
before update on public.material_bom_records
for each row
execute function public.update_updated_at_column();

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.material_bom_workspaces';
  exception
    when duplicate_object then null;
    when undefined_object then null;
    when invalid_object_definition then null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.material_bom_records';
  exception
    when duplicate_object then null;
    when undefined_object then null;
    when invalid_object_definition then null;
  end;
end
$$;
