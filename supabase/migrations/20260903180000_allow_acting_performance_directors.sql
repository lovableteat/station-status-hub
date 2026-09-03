-- Allow a director to act for a vacant section chief. Keep employee identity,
-- reviewer routing, stale-edit checks and privacy retention on the existing path.
create or replace function workspace.save_performance_organization_member(
  p_employee_id uuid, p_manager_id uuid, p_department text, p_job_title text,
  p_expected_updated_at timestamptz default null, p_performance_role text default 'employee',
  p_org_level text default 'member', p_section text default ''
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_existing workspace.performance_org_members%rowtype;
  v_manager_name text := '';
  v_settings jsonb;
  v_pages jsonb;
  v_parent workspace.performance_org_members%rowtype;
  v_department text := trim(coalesce(p_department, ''));
  v_section text := trim(coalesce(p_section, ''));
begin
  if not exists (select 1 from workspace.system_users u where u.id = v_actor
    and u.status = 'active' and u.role in ('admin', 'super_admin')) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from workspace.system_users where id = p_employee_id and status = 'active') then
    raise exception 'Employee must be active' using errcode = '22023';
  end if;
  if length(coalesce(p_department, '')) > 100 or length(coalesce(p_job_title, '')) > 100 or length(v_section) > 100 then
    raise exception 'Department and job title must be at most 100 characters' using errcode = '22023';
  end if;
  -- Serialize all structure edits, including parent eligibility checks.
  lock table workspace.performance_org_members in share row exclusive mode;
  if p_org_level is null or p_org_level not in ('director', 'section_chief', 'member') then
    raise exception 'Invalid organization level' using errcode = '22023';
  end if;
  if p_performance_role is null or p_performance_role not in ('none', 'employee', 'manager')
    or (p_org_level in ('director', 'section_chief') and p_performance_role <> 'manager')
    or (p_org_level = 'member' and p_performance_role = 'manager') then
    raise exception 'Performance role must match organization level' using errcode = '22023';
  end if;
  if p_org_level = 'director' and (p_manager_id is not null or v_department = '') then
    raise exception 'Department director requires a department and no parent' using errcode = '22023';
  end if;
  if p_org_level = 'section_chief' and v_section = '' then
    raise exception 'Section chief requires a section name' using errcode = '22023';
  end if;
  if p_org_level = 'director' then v_section := ''; end if;
  if p_manager_id is not null then
    select u.username into v_manager_name from workspace.system_users u
    where u.id = p_manager_id and u.status = 'active'
      and (u.role in ('admin', 'super_admin') or (
        u.permissions ->> 'performanceManager' = 'true'
        and u.permissions #>> '{workspaceAccess,performance}' = 'edit'
      ));
    if not found or p_manager_id = p_employee_id then
      raise exception 'Choose another active performance manager' using errcode = '22023';
    end if;
    select * into v_parent from workspace.performance_org_members where employee_id = p_manager_id;
    if not found or (p_org_level = 'section_chief' and v_parent.org_level <> 'director')
      or (p_org_level = 'member' and v_parent.org_level not in ('section_chief', 'director')) then
      raise exception 'Choose a director for a chief, or a chief/acting director for a member' using errcode = '22023';
    end if;
    v_department := v_parent.department;
    if p_org_level = 'member' and v_parent.org_level = 'section_chief' then
      v_section := v_parent.section;
    elsif p_org_level = 'member' and v_parent.org_level = 'director' and v_section = '' then
      raise exception 'Acting director requires a section name for the member' using errcode = '22023';
    end if;
  end if;
  if p_performance_role <> 'manager'
    and not exists (select 1 from workspace.system_users where id = p_employee_id and role in ('admin', 'super_admin'))
    and exists (select 1 from workspace.performance_org_members where manager_id = p_employee_id) then
    raise exception 'Reassign reports before removing manager role' using errcode = '22023';
  end if;
  select * into v_existing from workspace.performance_org_members where employee_id = p_employee_id;
  if v_existing.org_level is distinct from p_org_level
    and exists (select 1 from workspace.performance_org_members where manager_id = p_employee_id) then
    raise exception 'Reassign reports before changing manager level' using errcode = '22023';
  end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'Organization changed; reload before saving' using errcode = '40001';
  end if;
  if exists (
    with recursive ancestors(id) as (
      select p_manager_id where p_manager_id is not null
      union
      select o.manager_id from workspace.performance_org_members o
      join ancestors a on o.employee_id = a.id where o.manager_id is not null
    ) select 1 from ancestors where id = p_employee_id
  ) then
    raise exception 'Reporting relationship cannot form a cycle' using errcode = '22023';
  end if;
  insert into workspace.performance_org_members(employee_id, manager_id, department, job_title, performance_role, org_level, section, updated_by)
  values (p_employee_id, p_manager_id, v_department, trim(coalesce(p_job_title, '')), p_performance_role, p_org_level, v_section, v_actor)
  on conflict (employee_id) do update set manager_id = excluded.manager_id,
    department = excluded.department, job_title = excluded.job_title,
    performance_role = excluded.performance_role, org_level = excluded.org_level, section = excluded.section,
    updated_by = excluded.updated_by, updated_at = clock_timestamp();
  -- Renaming/moving a department or section keeps its children in the same unit.
  update workspace.performance_org_members set department = v_department,
    section = case when p_org_level = 'section_chief' then v_section else section end,
    updated_at = clock_timestamp(), updated_by = v_actor
  where manager_id = p_employee_id;
  if p_org_level = 'director' then
    update workspace.performance_org_members set department = v_department, updated_at = clock_timestamp(), updated_by = v_actor
    where manager_id in (select employee_id from workspace.performance_org_members where manager_id = p_employee_id);
  end if;
  -- Only performance-specific permissions change. Global role and every other
  -- workspace/page permission remain exactly as configured by the site admin.
  select coalesce(permissions, '{}'::jsonb) into v_settings from workspace.system_users where id = p_employee_id for update;
  v_pages := case when jsonb_typeof(v_settings -> 'pagePermissions') = 'array' then v_settings -> 'pagePermissions'
    else (select coalesce(jsonb_agg(permission::text), '[]'::jsonb) from workspace.user_page_permissions where user_id = p_employee_id) end;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_pages from jsonb_array_elements_text(v_pages)
    where value not in ('performance_view', 'performance_edit');
  if p_performance_role <> 'none' then v_pages := v_pages || '["performance_view","performance_edit"]'::jsonb; end if;
  update workspace.system_users set permissions = v_settings || jsonb_build_object(
    'workspaceAccess', coalesce(v_settings -> 'workspaceAccess', '{}'::jsonb) || jsonb_build_object('performance', case when p_performance_role = 'none' then 'none' else 'edit' end),
    'performanceManager', p_performance_role = 'manager', 'pagePermissions', v_pages
  ) where id = p_employee_id;
  -- Completed reviews retain their historic reviewer. Open reviews follow the
  -- organization immediately, including submissions created before this page.
  update workspace.performance_reviews r
  set reviewer_name = coalesce(v_manager_name, ''), updated_at = clock_timestamp()
  where workspace.resolve_performance_employee(r.employee_id) = p_employee_id
    and r.status <> 'approved'
    and r.reviewer_name is distinct from coalesce(v_manager_name, '');
end;
$$;
revoke all on function workspace.save_performance_organization_member(uuid, uuid, text, text, timestamptz, text, text, text) from public, anon;
grant execute on function workspace.save_performance_organization_member(uuid, uuid, text, text, timestamptz, text, text, text) to authenticated;


notify pgrst, 'reload schema';
