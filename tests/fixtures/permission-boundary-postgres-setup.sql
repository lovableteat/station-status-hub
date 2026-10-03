create schema auth;
create schema workspace;
create schema supabase_migrations;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public, auth, workspace to anon, authenticated, service_role;

create table supabase_migrations.schema_migrations (
  version text primary key,
  name text
);
insert into supabase_migrations.schema_migrations(version, name)
values ('20261001203000', 'production_fixture_head');

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create type public.page_permission as enum (
  'admin_edit',
  'data_center_view',
  'data_center_edit'
);

create table workspace.system_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username varchar(50) not null unique,
  display_name text,
  password_hash varchar(255) not null default 'fixture-hash',
  role varchar(20) not null default 'engineer',
  status varchar(20) default 'active',
  permissions jsonb default '{}'::jsonb,
  created_by varchar(50),
  created_at timestamptz not null default now(),
  registration_requested_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  auth_migrated_at timestamptz,
  last_seen_at timestamptz,
  avatar_path text,
  updated_at timestamptz not null default now()
);

create table workspace.user_page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references workspace.system_users(id) on delete cascade,
  permission public.page_permission not null,
  granted_by text,
  unique (user_id, permission)
);

create table workspace.performance_org_members (
  employee_id uuid primary key references workspace.system_users(id),
  manager_id uuid,
  performance_role text,
  org_level text,
  section text not null default ''
);

create function workspace.resolve_performance_employee(p_employee_id text)
returns uuid language sql stable set search_path = '' as $$
  select case
    when p_employee_id ~* '^[0-9a-f-]{36}$' then p_employee_id::uuid
    else null::uuid
  end;
$$;

create function workspace.current_user_is_performance_manager()
returns boolean language sql stable set search_path = '' as $$
  select false;
$$;

create function workspace.current_user_can_workspace(p_workspace text, p_level text)
returns boolean language sql stable set search_path = '' as $$
  select false;
$$;

create function workspace.performance_scopes_unlocked(p_scopes uuid[])
returns boolean language sql stable set search_path = '' as $$
  select true;
$$;

alter table workspace.user_page_permissions enable row level security;
grant all on table workspace.user_page_permissions to public, anon, authenticated, service_role;
create policy legacy_public_all
on workspace.user_page_permissions
for all
to public
using (true)
with check (true);

create function workspace.current_system_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account.id
  from workspace.system_users account
  where account.auth_user_id = auth.uid()
    and account.status = 'active'
  limit 1;
$$;

create function workspace.can_manage_system_users()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from workspace.system_users account
    where account.auth_user_id = auth.uid()
      and account.status = 'active'
      and (
        account.role in ('admin', 'super_admin')
        or (
          coalesce(account.permissions #>> '{workspaceAccess,user-management}', '') = 'edit'
          and coalesce(account.permissions -> 'pagePermissions', '[]'::jsonb)
            ? 'admin_edit'
        )
      )
  );
$$;

revoke all on function workspace.current_system_user_id() from public, anon;
revoke all on function workspace.can_manage_system_users() from public, anon;
grant execute on function workspace.current_system_user_id() to authenticated, service_role;
grant execute on function workspace.can_manage_system_users() to authenticated, service_role;

alter table workspace.system_users enable row level security;
revoke all on table workspace.system_users from public, anon, authenticated;
grant select (
  id, auth_user_id, username, display_name, permissions, role, status
) on workspace.system_users to authenticated;
grant all on table workspace.system_users to service_role;
create policy system_users_authenticated_read
on workspace.system_users
for select
to authenticated
using (workspace.current_system_user_id() is not null);

insert into workspace.system_users (
  id, auth_user_id, username, display_name, role, status, permissions
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'actor-a', 'Actor A', 'engineer', 'active',
    '{"workspaceAccess":{"user-management":"edit"},"pagePermissions":["admin_edit"],"performanceManager":false}'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'ordinary-b', 'Ordinary B', 'engineer', 'active',
    '{"workspaceAccess":{"user-management":"none"},"pagePermissions":[],"performanceManager":false}'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003',
    'actor-c', 'Actor C', 'admin', 'active',
    '{"workspaceAccess":{"user-management":"edit"},"pagePermissions":["admin_edit"],"performanceManager":false}'
  );

insert into workspace.user_page_permissions (user_id, permission, granted_by)
values
  ('00000000-0000-4000-8000-000000000001', 'admin_edit', 'fixture'),
  ('00000000-0000-4000-8000-000000000002', 'data_center_view', 'fixture'),
  ('00000000-0000-4000-8000-000000000003', 'admin_edit', 'fixture');
