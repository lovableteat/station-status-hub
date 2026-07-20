create table if not exists public.test_project_address_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.test_projects(id) on delete cascade,
  label text not null,
  placeholder text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_project_address_fields_label_not_blank
    check (length(trim(label)) > 0)
);

create unique index if not exists idx_test_project_address_fields_project_label
  on public.test_project_address_fields(project_id, lower(trim(label)));

create index if not exists idx_test_project_address_fields_project_order
  on public.test_project_address_fields(project_id, sort_order, created_at);

create table if not exists public.test_system_address_values (
  field_id uuid not null references public.test_project_address_fields(id) on delete cascade,
  system_id uuid not null references public.test_systems(id) on delete cascade,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (field_id, system_id)
);

create index if not exists idx_test_system_address_values_system
  on public.test_system_address_values(system_id);

drop trigger if exists update_test_project_address_fields_updated_at
  on public.test_project_address_fields;
create trigger update_test_project_address_fields_updated_at
before update on public.test_project_address_fields
for each row execute function public.update_updated_at_column();

drop trigger if exists update_test_system_address_values_updated_at
  on public.test_system_address_values;
create trigger update_test_system_address_values_updated_at
before update on public.test_system_address_values
for each row execute function public.update_updated_at_column();

alter table public.test_project_address_fields enable row level security;
alter table public.test_system_address_values enable row level security;

drop policy if exists "Allow anonymous access to test_project_address_fields"
  on public.test_project_address_fields;
create policy "Allow anonymous access to test_project_address_fields"
on public.test_project_address_fields for all using (true) with check (true);

drop policy if exists "Allow anonymous access to test_system_address_values"
  on public.test_system_address_values;
create policy "Allow anonymous access to test_system_address_values"
on public.test_system_address_values for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.test_project_address_fields;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.test_system_address_values;
exception
  when duplicate_object then null;
end
$$;
