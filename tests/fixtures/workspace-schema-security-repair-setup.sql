create schema if not exists workspace;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'page_permission'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.page_permission as enum (
      'dashboard_view', 'dashboard_edit',
      'test_tracker_view', 'test_tracker_edit',
      'flow_info_view', 'flow_info_edit',
      'issues_view', 'issues_edit',
      'production_view', 'production_edit',
      'tools_view', 'tools_edit',
      'comparison_view', 'comparison_edit',
      'api_management_view', 'api_management_edit'
    );
  end if;
end
$$;

create table workspace.system_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text,
  role text not null default 'engineer',
  status text default 'active',
  permissions jsonb default '{}'::jsonb,
  password_hash text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  registration_requested_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  auth_user_id uuid,
  auth_migrated_at timestamptz,
  last_seen_at timestamptz,
  avatar_path text
);

create table workspace.user_page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references workspace.system_users(id) on delete cascade,
  permission public.page_permission not null,
  unique (user_id, permission)
);

create table workspace.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_name text not null,
  api_key text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  usage_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace.test_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table workspace.test_systems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.test_projects(id) on delete cascade,
  system_name text not null,
  assigned_engineer text,
  model text,
  serial_number text,
  cabinet text,
  os_mac_address text,
  bmc_address text,
  old_bmc_address text,
  bom_90 text,
  ubuntu_version text,
  cuda_version text,
  exclude_from_dashboard boolean default false,
  team text
);

create table workspace.test_project_address_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.test_projects(id) on delete cascade
);

create table workspace.test_system_address_values (
  field_id uuid not null references workspace.test_project_address_fields(id) on delete cascade,
  system_id uuid not null references workspace.test_systems(id) on delete cascade,
  value text,
  primary key (field_id, system_id)
);

create table workspace.test_project_software_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.test_projects(id) on delete cascade,
  label text not null,
  placeholder text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace.test_system_software_values (
  field_id uuid not null references workspace.test_project_software_fields(id) on delete cascade,
  system_id uuid not null references workspace.test_systems(id) on delete cascade,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (field_id, system_id)
);

create or replace function workspace.current_system_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from workspace.system_users
  where auth_user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

grant usage on schema workspace to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema workspace
  to anon, authenticated, service_role;
grant execute on function workspace.current_system_user_id()
  to authenticated, service_role;

insert into workspace.system_users (
  id, username, role, status, permissions, password_hash
) values (
  '00000000-0000-0000-0000-000000000001',
  'verification-user',
  'admin',
  'active',
  '{"workspaceAccess":{"station-status":"edit","ai-chat":"edit","performance":"edit"}}',
  'must-remain-unchanged'
);

insert into workspace.api_keys (key_name, api_key)
values ('verification-key', 'must-not-be-anonymous');

insert into workspace.test_projects (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Verification project');

insert into workspace.test_systems (
  id, project_id, system_name, bom_90, ubuntu_version, cuda_version
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Verification machine',
  'BOM-90',
  '24.04',
  '12.8'
);
