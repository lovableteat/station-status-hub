-- Dedicated, read-only department access. Keep the direct-supervisor write
-- policies unchanged; list metadata first and fetch one full record on demand.
create or replace function workspace.can_read_department_assessment(p_employee uuid, p_scopes uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := workspace.current_system_user_id();
begin
  if v_actor is null or not workspace.current_user_can_workspace('performance','view')
    or not workspace.current_user_is_performance_manager() then return false; end if;
  if not exists (
    select 1 from workspace.performance_org_members actor
    join workspace.system_users actor_user on actor_user.id=actor.employee_id and actor_user.status='active'
    join workspace.performance_org_members employee on employee.employee_id=p_employee
    join workspace.system_users employee_user on employee_user.id=employee.employee_id and employee_user.status='active'
    left join workspace.performance_org_members chief on chief.employee_id=employee.manager_id
    where actor.employee_id=v_actor and actor.performance_role='manager'
      and employee.performance_role<>'none' and employee.employee_id<>v_actor
      and ((actor.org_level='section_chief' and employee.manager_id=v_actor and employee.org_level='member')
        or (actor.org_level='director' and (employee.manager_id=v_actor
          or (chief.manager_id=v_actor and chief.org_level='section_chief' and chief.performance_role='manager'))))
  ) then return false; end if;
  return workspace.performance_scopes_unlocked(coalesce(p_scopes,array[]::uuid[])
    || workspace.performance_org_ancestors(p_employee) || array[p_employee,v_actor]);
end;
$$;
revoke all on function workspace.can_read_department_assessment(uuid,uuid[]) from public,anon,authenticated;

create or replace function workspace.get_performance_department_assessments(p_cycle_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := workspace.current_system_user_id(); v_result jsonb;
begin
  if not exists(select 1 from workspace.system_users where id=v_actor and status='active')
    or not workspace.current_user_can_workspace('performance','view') then
    raise exception 'Performance access required' using errcode='42501';
  end if;
  if not workspace.current_user_is_performance_manager() then return '[]'::jsonb; end if;
  if not workspace.performance_scopes_unlocked(array[v_actor]) then
    raise exception 'Unlock performance data first' using errcode='42501';
  end if;
  with members as materialized (
    select e.employee_id,e.department,e.section,u.display_name,u.username,reviewer.display_name reviewer_name
    from workspace.performance_org_members actor
    join workspace.performance_org_members e on e.employee_id<>actor.employee_id
    join workspace.system_users u on u.id=e.employee_id and u.status='active'
    left join workspace.performance_org_members chief on chief.employee_id=e.manager_id
    left join workspace.system_users reviewer on reviewer.id=e.manager_id
    where actor.employee_id=v_actor and e.performance_role<>'none'
      and ((actor.org_level='section_chief' and e.manager_id=v_actor and e.org_level='member')
        or (actor.org_level='director' and (e.manager_id=v_actor
          or (chief.manager_id=v_actor and chief.org_level='section_chief' and chief.performance_role='manager'))))
  ), identities as materialized (
    select r.id,workspace.resolve_performance_employee(r.employee_id) employee_id,r.updated_at
    from workspace.performance_reviews r where r.cycle_id=p_cycle_id
  ), latest as (
    select distinct on (i.employee_id) i.id,i.employee_id from identities i join members m on m.employee_id=i.employee_id
    order by i.employee_id,i.updated_at desc nulls last,i.id desc
  ), records as (
    select m.*,r.id review_id,r.status,r.updated_at,r.score,
      workspace.can_read_department_assessment(m.employee_id,r.privacy_scope_ids) unlocked
    from members m left join latest l on l.employee_id=m.employee_id left join workspace.performance_reviews r on r.id=l.id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'employee_id',employee_id,'employee_name',display_name,'username',username,'department',department,'section',section,
    'reviewer_name',reviewer_name,'locked',not unlocked,
    'review_id',case when unlocked then review_id end,'status',case when unlocked then status end,
    'updated_at',case when unlocked then updated_at end,'score',case when unlocked then score end
  ) order by department,section,display_name,employee_id),'[]'::jsonb) into v_result from records;
  return v_result;
end;
$$;
revoke all on function workspace.get_performance_department_assessments(text) from public,anon;
grant execute on function workspace.get_performance_department_assessments(text) to authenticated,service_role;

create or replace function workspace.get_performance_department_assessment(p_review_id text,p_cycle_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_record workspace.performance_reviews%rowtype; v_employee uuid; v_result jsonb;
begin
  select * into v_record from workspace.performance_reviews where id::text=p_review_id and cycle_id=p_cycle_id;
  if not found then raise exception 'Assessment not available' using errcode='42501'; end if;
  v_employee := workspace.resolve_performance_employee(v_record.employee_id);
  if not workspace.can_read_department_assessment(v_employee,v_record.privacy_scope_ids) then
    raise exception 'Assessment not available or group locked' using errcode='42501';
  end if;
  select to_jsonb(v_record) || jsonb_build_object('employee_name',u.display_name,'department',o.department,
    'reviewer_name',coalesce(reviewer.display_name,v_record.reviewer_name)) into v_result
  from workspace.system_users u join workspace.performance_org_members o on o.employee_id=u.id
  left join workspace.system_users reviewer on reviewer.id=o.manager_id where u.id=v_employee;
  return v_result;
end;
$$;
revoke all on function workspace.get_performance_department_assessment(text,text) from public,anon;
grant execute on function workspace.get_performance_department_assessment(text,text) to authenticated,service_role;
comment on function workspace.get_performance_department_assessment(text,text) is
  'Read-only full assessment for current department hierarchy, all saved statuses, with record privacy checks. No editing authority.';
notify pgrst,'reload schema';
