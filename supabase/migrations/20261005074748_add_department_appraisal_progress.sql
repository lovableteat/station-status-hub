-- Read-only, live department progress. Completing employee reviews must not
-- publish a chief's draft or make individual ratings visible to a director.
create or replace function workspace.get_performance_department_progress(p_cycle_id text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_level text;
  v_result jsonb;
begin
  if not exists (select 1 from workspace.system_users where id = v_actor and status = 'active')
    or not workspace.current_user_can_workspace('performance', 'view') then
    raise exception 'Performance access required' using errcode = '42501';
  end if;
  if not workspace.current_user_is_performance_manager() then return '[]'::jsonb; end if;
  select org_level into v_level from workspace.performance_org_members where employee_id = v_actor;
  if not workspace.performance_scopes_unlocked(array[v_actor]) then
    raise exception 'Unlock performance data first' using errcode = '42501';
  end if;

  with chiefs as materialized (
    select o.employee_id, o.department, o.section, u.display_name
    from workspace.performance_org_members o
    join workspace.system_users u on u.id = o.employee_id and u.status = 'active'
    where o.org_level = 'section_chief' and o.performance_role = 'manager'
      and ((v_level = 'director' and o.manager_id = v_actor)
        or (v_level = 'section_chief' and o.employee_id = v_actor))
  ), members as materialized (
    select m.employee_id, m.manager_id from workspace.performance_org_members m
    join chiefs c on c.employee_id = m.manager_id
    join workspace.system_users u on u.id = m.employee_id and u.status = 'active'
    where m.org_level = 'member' and m.performance_role <> 'none'
  ), review_identities as materialized (
    select workspace.resolve_performance_employee(r.employee_id) as employee_id,
      r.status, r.updated_at, r.id
    from workspace.performance_reviews r where r.cycle_id = p_cycle_id
  ), latest as (
    select distinct on (r.employee_id) r.employee_id, r.status
    from review_identities r join members m on m.employee_id = r.employee_id
    order by r.employee_id, r.updated_at desc nulls last, r.id desc
  ), progress as (
    select c.employee_id as chief_id, c.display_name as chief_name, c.department, c.section,
      count(m.employee_id)::integer as total_members,
      count(m.employee_id) filter (where r.status = 'approved')::integer as completed_members,
      count(m.employee_id) filter (where r.status = 'submitted')::integer as awaiting_members,
      count(m.employee_id) filter (where r.status = 'returned')::integer as returned_members,
      count(m.employee_id) filter (where r.status in ('draft', 'in-progress'))::integer as drafting_members,
      count(m.employee_id) filter (where r.status is null)::integer as not_started_members,
      -- A draft's content, ID, timestamps and existence stay private to its owner.
      coalesce(delivered.status, 'not_submitted') as report_status
    from chiefs c left join members m on m.manager_id = c.employee_id
    left join latest r on r.employee_id = m.employee_id
    left join workspace.performance_section_reports delivered
      on delivered.chief_id = c.employee_id and delivered.cycle_id = p_cycle_id
      and delivered.status <> 'draft'
    group by c.employee_id, c.display_name, c.department, c.section, delivered.status
  )
  select coalesce(jsonb_agg(to_jsonb(progress) order by department, section, chief_name), '[]'::jsonb)
  into v_result from progress;
  return v_result;
end;
$$;

revoke all on function workspace.get_performance_department_progress(text) from public, anon;
grant execute on function workspace.get_performance_department_progress(text) to authenticated, service_role;
comment on function workspace.get_performance_department_progress(text) is
  'Scoped live counts for a director or chief; no individual scores, feedback or unsubmitted report content.';
