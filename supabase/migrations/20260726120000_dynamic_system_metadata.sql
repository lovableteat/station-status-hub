create table if not exists public.test_project_system_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.test_projects(id) on delete cascade,
  category text not null check (category in ('software', 'statistics')),
  field_key text not null,
  label text not null,
  placeholder text,
  field_type text not null check (field_type in ('text', 'number', 'boolean', 'select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_test_project_system_fields_project_key
  on public.test_project_system_fields(project_id, field_key);

create index if not exists idx_test_project_system_fields_project_order
  on public.test_project_system_fields(project_id, sort_order, created_at);

create table if not exists public.test_system_field_values (
  field_id uuid not null references public.test_project_system_fields(id) on delete cascade,
  system_id uuid not null references public.test_systems(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (field_id, system_id)
);

create index if not exists idx_test_system_field_values_system
  on public.test_system_field_values(system_id);

grant select, insert, update, delete on public.test_project_system_fields to anon;
grant select, insert, update, delete on public.test_project_system_fields to authenticated;
grant all on public.test_project_system_fields to service_role;
grant select, insert, update, delete on public.test_system_field_values to anon;
grant select, insert, update, delete on public.test_system_field_values to authenticated;
grant all on public.test_system_field_values to service_role;

alter table public.test_project_system_fields enable row level security;
alter table public.test_system_field_values enable row level security;

drop policy if exists "Allow anonymous access to test_project_system_fields"
  on public.test_project_system_fields;
create policy "Allow anonymous access to test_project_system_fields"
on public.test_project_system_fields for all using (true) with check (true);

drop policy if exists "Allow anonymous access to test_system_field_values"
  on public.test_system_field_values;
create policy "Allow anonymous access to test_system_field_values"
on public.test_system_field_values for all using (true) with check (true);

drop trigger if exists update_test_project_system_fields_updated_at
  on public.test_project_system_fields;
create trigger update_test_project_system_fields_updated_at
before update on public.test_project_system_fields
for each row execute function public.update_updated_at_column();

drop trigger if exists update_test_system_field_values_updated_at
  on public.test_system_field_values;
create trigger update_test_system_field_values_updated_at
before update on public.test_system_field_values
for each row execute function public.update_updated_at_column();

insert into public.test_project_system_fields (
  project_id,
  category,
  field_key,
  label,
  field_type,
  is_system,
  sort_order
)
select
  projects.id,
  reserved.category,
  reserved.field_key,
  reserved.label,
  reserved.field_type,
  true,
  reserved.sort_order
from public.test_projects projects
cross join (
  values
    ('software', 'bom_90', 'BOM 90', 'text', 0),
    ('software', 'ubuntu_version', 'Ubuntu Version', 'text', 1),
    ('software', 'cuda_version', 'CUDA Version', 'text', 2),
    ('statistics', 'include_in_dashboard', 'Include in Dashboard', 'boolean', 3)
) as reserved(category, field_key, label, field_type, sort_order)
on conflict (project_id, field_key) do nothing;

insert into public.test_system_field_values (
  field_id,
  system_id,
  value
)
select
  fields.id,
  systems.id,
  case fields.field_key
    when 'bom_90' then coalesce(to_jsonb(systems.bom_90), 'null'::jsonb)
    when 'ubuntu_version' then coalesce(to_jsonb(systems.ubuntu_version), 'null'::jsonb)
    when 'cuda_version' then coalesce(to_jsonb(systems.cuda_version), 'null'::jsonb)
    when 'include_in_dashboard' then to_jsonb(not coalesce(systems.exclude_from_dashboard, false))
  end
from public.test_systems systems
join public.test_project_system_fields fields
  on fields.project_id = systems.project_id
 and fields.field_key in ('bom_90', 'ubuntu_version', 'cuda_version', 'include_in_dashboard')
on conflict (field_id, system_id) do nothing;

insert into public.test_project_system_fields (
  project_id,
  category,
  field_key,
  label,
  placeholder,
  field_type,
  is_system,
  sort_order,
  created_at,
  updated_at
)
select
  legacy_fields.project_id,
  'software',
  'legacy_software_' || md5(legacy_fields.id::text),
  legacy_fields.label,
  legacy_fields.placeholder,
  'text',
  false,
  legacy_fields.sort_order,
  legacy_fields.created_at,
  legacy_fields.updated_at
from public.test_project_software_fields legacy_fields
on conflict (project_id, field_key) do nothing;

insert into public.test_system_field_values (
  field_id,
  system_id,
  value,
  created_at,
  updated_at
)
select
  fields.id,
  legacy_values.system_id,
  to_jsonb(legacy_values.value),
  legacy_values.created_at,
  legacy_values.updated_at
from public.test_system_software_values legacy_values
join public.test_project_software_fields legacy_fields
  on legacy_fields.id = legacy_values.field_id
join public.test_project_system_fields fields
  on fields.project_id = legacy_fields.project_id
 and fields.field_key = 'legacy_software_' || md5(legacy_fields.id::text)
on conflict (field_id, system_id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.test_project_system_fields;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.test_system_field_values;
exception
  when duplicate_object then null;
end
$$;
