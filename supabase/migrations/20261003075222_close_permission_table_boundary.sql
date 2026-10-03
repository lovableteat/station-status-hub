-- Close direct client writes and serialize permission changes around fresh
-- authorization. Apply only after 20261002160000 and 20261002170000.
begin;

do $$
declare
  v_sql2_applied boolean := true;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $query$
      select exists (
        select 1 from supabase_migrations.schema_migrations
        where version = '20261002170000'
      )
    $query$ into v_sql2_applied;
    if not v_sql2_applied then
      raise exception 'SQL3 requires SQL2 migration 20261002170000';
    end if;
  end if;
end;
$$;

create or replace function workspace.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text,
  p_performance_manager boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_is_service_role boolean := coalesce((select auth.role()), '') = 'service_role';
  v_lock_user_id uuid;
begin
  if not v_is_service_role then
    v_actor_id := workspace.current_system_user_id();
  end if;

  -- Every permission mutation takes the same actor/target lock order. The
  -- authorization below is deliberately a later statement, so Read Committed
  -- obtains a fresh snapshot after any queued revocation has committed.
  for v_lock_user_id in
    select lock_user_id
    from unnest(array[v_actor_id, p_user_id]) as lock_ids(lock_user_id)
    where lock_user_id is not null
    group by lock_user_id
    order by lock_user_id
  loop
    perform 1
    from workspace.system_users
    where id = v_lock_user_id
    for update;
  end loop;

  if not exists (
    select 1 from workspace.system_users where id = p_user_id
  ) then
    raise exception 'Unknown system user: %', p_user_id;
  end if;

  if not v_is_service_role
     and not workspace.can_manage_system_users() then
    raise exception 'User management edit access required'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_workspace_access) is distinct from 'object'
     or not (p_workspace_access ?& array[
       'station-status',
       'material-requests',
       'data-center'
     ])
     or exists (
       select 1
       from jsonb_each_text(p_workspace_access) as access(key, value)
       where key not in (
         'station-status',
         'material-requests',
         'data-center',
         'pcb-designer',
         'user-management',
         'ai-chat',
         'performance'
       )
          or value is null
          or value not in ('none', 'view', 'edit')
     ) then
    raise exception 'Invalid workspace access payload';
  end if;

  delete from workspace.user_page_permissions
  where user_id = p_user_id;

  insert into workspace.user_page_permissions (user_id, permission, granted_by)
  select p_user_id, permission, nullif(p_granted_by, '')
  from unnest(
    coalesce(p_permissions, array[]::public.page_permission[])
  ) as permission
  on conflict (user_id, permission) do nothing;

  update workspace.system_users
  set permissions = coalesce(permissions, '{}'::jsonb)
    || jsonb_build_object(
      'workspaceAccess', p_workspace_access,
      'pagePermissions', to_jsonb(
        coalesce(p_permissions, array[]::public.page_permission[])
      )
    )
    || case
      when p_performance_manager is null then '{}'::jsonb
      else jsonb_build_object('performanceManager', p_performance_manager)
    end
  where id = p_user_id;
end;
$$;

create or replace function workspace.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text default 'admin'
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select workspace.set_user_access_permissions(
    p_user_id,
    p_permissions,
    p_workspace_access,
    p_granted_by,
    null
  );
$$;

create or replace function public.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text,
  p_performance_manager boolean
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select workspace.set_user_access_permissions(
    p_user_id,
    p_permissions,
    p_workspace_access,
    p_granted_by,
    p_performance_manager
  );
$$;

create or replace function public.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text default 'admin'
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select workspace.set_user_access_permissions(
    p_user_id,
    p_permissions,
    p_workspace_access,
    p_granted_by,
    null
  );
$$;

revoke all on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) from public, anon;
revoke all on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) from public, anon;
revoke all on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) from public, anon;
revoke all on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) from public, anon;

grant execute on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) to authenticated, service_role;
grant execute on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) to authenticated, service_role;
grant execute on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) to authenticated, service_role;
grant execute on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) to authenticated, service_role;

-- Account profile, activation, and deletion decisions must be made in the
-- same transaction that changes the system-user row. The Edge function keeps
-- the service key only for Auth/storage synchronization; it calls these RPCs
-- with the requesting user's JWT.
create or replace function workspace.create_system_user_admin_profile(
  p_username text,
  p_password_hash text,
  p_role text,
  p_status text,
  p_display_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := workspace.current_system_user_id();
  v_actor_username text;
  v_created workspace.system_users%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  perform 1
  from workspace.system_users
  where id = v_actor_id
  for update;

  if workspace.current_system_user_id() is distinct from v_actor_id
     or not workspace.can_manage_system_users() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  if nullif(btrim(p_username), '') is null or length(btrim(p_username)) > 50
     or nullif(btrim(p_display_name), '') is null or length(btrim(p_display_name)) > 100
     or nullif(p_password_hash, '') is null
     or p_role not in ('viewer', 'engineer', 'admin', 'super_admin')
     or p_status not in ('active', 'inactive') then
    raise exception 'Invalid account profile' using errcode = '22023';
  end if;

  select username into strict v_actor_username
  from workspace.system_users
  where id = v_actor_id;

  insert into workspace.system_users (
    username,
    password_hash,
    role,
    permissions,
    display_name,
    status,
    created_by,
    updated_at
  ) values (
    btrim(p_username),
    p_password_hash,
    p_role,
    '{}'::jsonb,
    btrim(p_display_name),
    p_status,
    v_actor_username,
    now()
  )
  returning * into v_created;

  return jsonb_build_object(
    'id', v_created.id,
    'username', v_created.username,
    'role', v_created.role,
    'display_name', v_created.display_name,
    'status', v_created.status,
    'auth_user_id', v_created.auth_user_id,
    'updated_at', v_created.updated_at
  );
end;
$$;

create or replace function workspace.update_system_user_admin_profile(
  p_user_id uuid,
  p_username text default null,
  p_password_hash text default null,
  p_role text default null,
  p_status text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := workspace.current_system_user_id();
  v_lock_user_id uuid;
  v_updated workspace.system_users%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  for v_lock_user_id in
    select lock_user_id
    from unnest(array[v_actor_id, p_user_id]) as lock_ids(lock_user_id)
    where lock_user_id is not null
    group by lock_user_id
    order by lock_user_id
  loop
    perform 1
    from workspace.system_users
    where id = v_lock_user_id
    for update;
  end loop;

  if workspace.current_system_user_id() is distinct from v_actor_id
     or not workspace.can_manage_system_users() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  if not exists (select 1 from workspace.system_users where id = p_user_id) then
    raise exception 'Unknown system user: %', p_user_id;
  end if;
  if (p_username is not null and (nullif(btrim(p_username), '') is null or length(btrim(p_username)) > 50))
     or (p_display_name is not null and (nullif(btrim(p_display_name), '') is null or length(btrim(p_display_name)) > 100))
     or (p_password_hash is not null and p_password_hash = '')
     or (p_role is not null and p_role not in ('viewer', 'engineer', 'admin', 'super_admin'))
     or (p_status is not null and p_status not in ('active', 'inactive')) then
    raise exception 'Invalid account profile' using errcode = '22023';
  end if;

  update workspace.system_users
  set username = coalesce(btrim(p_username), username),
      password_hash = coalesce(p_password_hash, password_hash),
      role = coalesce(p_role, role),
      status = coalesce(p_status, status),
      display_name = coalesce(btrim(p_display_name), display_name),
      updated_at = now()
  where id = p_user_id
  returning * into strict v_updated;

  return jsonb_build_object(
    'id', v_updated.id,
    'username', v_updated.username,
    'role', v_updated.role,
    'display_name', v_updated.display_name,
    'status', v_updated.status,
    'auth_user_id', v_updated.auth_user_id,
    'updated_at', v_updated.updated_at
  );
end;
$$;

create or replace function workspace.delete_system_user_admin_profile(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := workspace.current_system_user_id();
  v_lock_user_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  for v_lock_user_id in
    select lock_user_id
    from unnest(array[v_actor_id, p_user_id]) as lock_ids(lock_user_id)
    where lock_user_id is not null
    group by lock_user_id
    order by lock_user_id
  loop
    perform 1
    from workspace.system_users
    where id = v_lock_user_id
    for update;
  end loop;

  if workspace.current_system_user_id() is distinct from v_actor_id
     or not workspace.can_manage_system_users() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  delete from workspace.system_users where id = p_user_id;
  return found;
end;
$$;

create or replace function workspace.authorize_system_user_admin_sync(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := workspace.current_system_user_id();
  v_lock_user_id uuid;
  v_target workspace.system_users%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  for v_lock_user_id in
    select lock_user_id
    from unnest(array[v_actor_id, p_user_id]) as lock_ids(lock_user_id)
    where lock_user_id is not null
    group by lock_user_id
    order by lock_user_id
  loop
    perform 1
    from workspace.system_users
    where id = v_lock_user_id
    for update;
  end loop;

  if workspace.current_system_user_id() is distinct from v_actor_id
     or not workspace.can_manage_system_users() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_target
  from workspace.system_users
  where id = p_user_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'id', v_target.id,
    'username', v_target.username,
    'role', v_target.role,
    'display_name', v_target.display_name,
    'status', v_target.status,
    'auth_user_id', v_target.auth_user_id,
    'updated_at', v_target.updated_at
  );
end;
$$;

-- SQL2 created the compatibility approval entrypoint. Replace its workspace
-- implementation only after SQL2 so activation also uses the common lock order
-- and a post-wait authorization snapshot.
create or replace function workspace.approve_system_user(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := workspace.current_system_user_id();
  v_lock_user_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  for v_lock_user_id in
    select lock_user_id
    from unnest(array[v_actor_id, p_user_id]) as lock_ids(lock_user_id)
    where lock_user_id is not null
    group by lock_user_id
    order by lock_user_id
  loop
    perform 1
    from workspace.system_users
    where id = v_lock_user_id
    for update;
  end loop;

  if workspace.current_system_user_id() is distinct from v_actor_id
     or not workspace.can_manage_system_users() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  update workspace.system_users
  set status = 'active', approved_at = now(), approved_by = v_actor_id, updated_at = now()
  where id = p_user_id and status = 'pending';
  return found;
end;
$$;

revoke all on function workspace.create_system_user_admin_profile(
  text, text, text, text, text
) from public, anon, service_role;
revoke all on function workspace.update_system_user_admin_profile(
  uuid, text, text, text, text, text
) from public, anon, service_role;
revoke all on function workspace.delete_system_user_admin_profile(uuid)
  from public, anon, service_role;
revoke all on function workspace.authorize_system_user_admin_sync(uuid)
  from public, anon, service_role;
revoke all on function workspace.approve_system_user(uuid) from public, anon;

grant execute on function workspace.create_system_user_admin_profile(
  text, text, text, text, text
) to authenticated;
grant execute on function workspace.update_system_user_admin_profile(
  uuid, text, text, text, text, text
) to authenticated;
grant execute on function workspace.delete_system_user_admin_profile(uuid)
  to authenticated;
grant execute on function workspace.authorize_system_user_admin_sync(uuid)
  to authenticated;
grant execute on function workspace.approve_system_user(uuid)
  to authenticated, service_role;

alter table workspace.user_page_permissions enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'workspace'
      and tablename = 'user_page_permissions'
  loop
    execute format(
      'drop policy %I on workspace.user_page_permissions',
      policy_record.policyname
    );
  end loop;
end;
$$;

revoke all on table workspace.user_page_permissions
  from public, anon, authenticated;
grant select on table workspace.user_page_permissions to authenticated;
grant all on table workspace.user_page_permissions to service_role;

create policy user_page_permissions_authenticated_read
on workspace.user_page_permissions
for select
to authenticated
using (
  user_id = (select workspace.current_system_user_id())
  or (select workspace.can_manage_system_users())
);

notify pgrst, 'reload schema';
commit;
