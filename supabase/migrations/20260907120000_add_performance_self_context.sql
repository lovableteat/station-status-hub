-- Employees may read only their own performance organization routing data.
-- The full organization roster remains restricted to performance managers.
create or replace function workspace.get_performance_self_context()
returns table (
  employee_id uuid,
  username text,
  display_name text,
  manager_id uuid,
  manager_name text,
  manager_org_level text,
  department text,
  section text,
  job_title text,
  org_level text,
  performance_role text,
  assigned boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := workspace.current_system_user_id();
begin
  if v_actor is null
     or not coalesce(workspace.current_user_can_workspace('performance', 'view'), false) then
    raise exception 'Performance workspace access required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.username::text,
    coalesce(nullif(u.display_name, ''), u.username)::text,
    o.manager_id,
    coalesce(nullif(manager.display_name, ''), manager.username, '')::text,
    coalesce(parent.org_level, '')::text,
    coalesce(o.department, '')::text,
    coalesce(o.section, '')::text,
    coalesce(o.job_title, '')::text,
    coalesce(o.org_level, 'member')::text,
    coalesce(o.performance_role, 'none')::text,
    (o.employee_id is not null)
  from workspace.system_users u
  left join workspace.performance_org_members o on o.employee_id = u.id
  left join workspace.system_users manager
    on manager.id = o.manager_id and manager.status = 'active'
  left join workspace.performance_org_members parent on parent.employee_id = o.manager_id
  where u.id = v_actor and u.status = 'active';
end;
$$;

revoke all on function workspace.get_performance_self_context() from public, anon;
grant execute on function workspace.get_performance_self_context() to authenticated, service_role;
