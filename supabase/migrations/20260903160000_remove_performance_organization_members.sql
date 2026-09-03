-- Keep removal history private so removing a classification cannot reactivate
-- legacy reviewer-name permissions on a completed assessment.
create table if not exists workspace.performance_org_removed_members (
  employee_id uuid primary key references workspace.system_users(id) on delete cascade,
  removed_at timestamptz not null default clock_timestamp(),
  removed_by uuid references workspace.system_users(id) on delete set null
);
alter table workspace.performance_org_removed_members enable row level security;
revoke all on workspace.performance_org_removed_members from public, anon, authenticated;
grant all on workspace.performance_org_removed_members to service_role;

create or replace function workspace.can_manage_performance_record(p_employee_id text, p_reviewer_name text, p_scopes uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype; v_employee uuid; v_ancestors uuid[];
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  if not found then return false; end if;
  v_employee := workspace.resolve_performance_employee(p_employee_id);
  v_ancestors := workspace.performance_org_ancestors(v_employee);
  if not workspace.performance_scopes_unlocked(coalesce(p_scopes, array[]::uuid[]) || v_ancestors || array[v_employee]) then return false; end if;
  if v_actor.role in ('admin', 'super_admin') then return true; end if;
  if not workspace.current_user_is_performance_manager() or not workspace.current_user_can_workspace('performance', 'edit') then return false; end if;
  if v_employee = v_actor.id then return false; end if;
  return v_actor.id = any(v_ancestors)
    or (not exists (select 1 from workspace.performance_org_members where employee_id = v_employee)
      and not exists (select 1 from workspace.performance_org_removed_members where employee_id = v_employee)
      and nullif(trim(p_reviewer_name), '') is not null
      and workspace.resolve_performance_employee(p_reviewer_name) = v_actor.id);
end;
$$;
revoke all on function workspace.can_manage_performance_record(text, text, uuid[]) from public, anon;
grant execute on function workspace.can_manage_performance_record(text, text, uuid[]) to authenticated;

create or replace function workspace.remove_performance_organization_member(
  p_employee_id uuid, p_expected_updated_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := workspace.current_system_user_id(); v_existing workspace.performance_org_members%rowtype;
begin
  if not exists (select 1 from workspace.system_users where id = v_actor and status = 'active' and role in ('admin', 'super_admin')) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  -- Same lock order as assignment and password setup prevents reparenting races.
  lock table workspace.performance_org_members in share row exclusive mode;
  select * into v_existing from workspace.performance_org_members where employee_id = p_employee_id;
  if not found or v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'Organization changed; reload before removing' using errcode = '40001';
  end if;
  if exists (select 1 from workspace.performance_org_members where manager_id = p_employee_id) then
    raise exception 'Reassign reports before removing classification' using errcode = '23503';
  end if;
  insert into workspace.performance_org_removed_members(employee_id, removed_by) values(p_employee_id, v_actor)
  on conflict(employee_id) do update set removed_at = clock_timestamp(), removed_by = excluded.removed_by;
  -- The existing BEFORE DELETE trigger retains historic password scopes.
  delete from workspace.performance_org_members where employee_id = p_employee_id;
  update workspace.system_users set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('performanceManager', false)
  where id = p_employee_id;
  -- Preserve completed reviewer metadata, while terminating obsolete authority
  -- through the private removal history above. Never delete reviews or secrets.
  update workspace.performance_reviews set reviewer_name = '', updated_at = clock_timestamp()
  where workspace.resolve_performance_employee(employee_id) = p_employee_id
    and status <> 'approved' and coalesce(reviewer_name, '') <> '';
end;
$$;
revoke all on function workspace.remove_performance_organization_member(uuid, timestamptz) from public, anon;
grant execute on function workspace.remove_performance_organization_member(uuid, timestamptz) to authenticated;
notify pgrst, 'reload schema';
