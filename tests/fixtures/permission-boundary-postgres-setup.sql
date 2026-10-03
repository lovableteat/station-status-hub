create schema auth;
create schema workspace;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public, auth, workspace to anon, authenticated, service_role;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('test.role', true), '');
$$;

create type public.page_permission as enum (
  'admin_edit',
  'data_center_view',
  'data_center_edit'
);

create table workspace.system_users (
  id uuid primary key,
  auth_user_id uuid unique,
  username text not null,
  display_name text not null,
  role text not null,
  status text not null,
  permissions jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid,
  updated_at timestamptz
);

create table workspace.user_page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references workspace.system_users(id) on delete cascade,
  permission public.page_permission not null,
  granted_by text,
  unique (user_id, permission)
);

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
