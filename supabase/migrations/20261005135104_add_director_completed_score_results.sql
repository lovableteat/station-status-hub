-- Completed results only. Current hierarchy grants read access; existing group
-- passwords and retained record scopes remain required. No appraisal edit rights.
create or replace function workspace.performance_completed_score_payload(p_self text, p_manager text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare s jsonb := '{}'; m jsonb := '{}';
begin
  begin
    if starts_with(p_self, E'RD2_SELF_V1\n') then s := substring(p_self from 13)::jsonb; end if;
  exception when invalid_text_representation then s := '{}'; end;
  begin
    if starts_with(p_manager, E'RD2_MANAGER_V1\n') then m := substring(p_manager from 16)::jsonb; end if;
  exception when invalid_text_representation then m := '{}'; end;
  return jsonb_build_object('employee_number', coalesce(nullif(s->>'employeeNumber',''), m->>'employeeNumber', ''),
    'job_grade', s->>'grade', 'category_scores', jsonb_build_object(
      'IDP', m#>'{categoryReviews,IDP,score}', 'OKR', m#>'{categoryReviews,OKR,score}', 'KPI', m#>'{categoryReviews,KPI,score}'));
end;
$$;
revoke all on function workspace.performance_completed_score_payload(text,text) from public, anon, authenticated;

create or replace function workspace.get_performance_department_results(p_cycle_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_level text;
  v_result jsonb;
begin
  if not exists (select 1 from workspace.system_users where id=v_actor and status='active')
    or not workspace.current_user_can_workspace('performance','view') then
    raise exception 'Performance access required' using errcode='42501';
  end if;
  if not workspace.current_user_is_performance_manager() then return '[]'::jsonb; end if;
  select org_level into v_level from workspace.performance_org_members where employee_id=v_actor;
  if not workspace.performance_scopes_unlocked(array[v_actor]) then
    raise exception 'Unlock performance data first' using errcode='42501';
  end if;
  with chiefs as materialized (
    select o.employee_id, o.department, o.section, u.display_name
    from workspace.performance_org_members o join workspace.system_users u on u.id=o.employee_id and u.status='active'
    where o.org_level='section_chief' and o.performance_role='manager'
      and ((v_level='director' and o.manager_id=v_actor) or (v_level='section_chief' and o.employee_id=v_actor))
  ), members as materialized (
    select m.employee_id, m.manager_id, u.display_name
    from workspace.performance_org_members m join chiefs c on c.employee_id=m.manager_id
    join workspace.system_users u on u.id=m.employee_id and u.status='active'
    where m.org_level='member' and m.performance_role<>'none'
  ), identities as materialized (
    select r.id, workspace.resolve_performance_employee(r.employee_id) employee_id, r.updated_at
    from workspace.performance_reviews r where r.cycle_id=p_cycle_id
  ), latest as (
    select distinct on (i.employee_id) i.id, i.employee_id
    from identities i join members m on m.employee_id=i.employee_id
    order by i.employee_id, i.updated_at desc nulls last, i.id desc
  ), completed as materialized (
    select m.*, r.id review_id, r.score, r.reviewer_name, r.updated_at, r.self_feedback, r.manager_feedback,
      workspace.performance_scopes_unlocked(coalesce(r.privacy_scope_ids,array[]::uuid[])
        || workspace.performance_org_ancestors(m.employee_id) || array[m.employee_id,m.manager_id,v_actor]) unlocked
    from latest l join members m on m.employee_id=l.employee_id
    join workspace.performance_reviews r on r.id=l.id where r.status='approved'
  ), groups as (
    select c.employee_id chief_id, c.display_name chief_name, c.department, c.section,
      (select count(*) from completed r where r.manager_id=c.employee_id and not r.unlocked)::integer locked_results,
      coalesce((select jsonb_agg(jsonb_build_object('review_id',r.review_id,'employee_id',r.employee_id,
        'employee_name',r.display_name,'reviewer_name',r.reviewer_name,'completed_at',r.updated_at,'total_score',r.score)
        || workspace.performance_completed_score_payload(r.self_feedback,r.manager_feedback)
        order by r.display_name,r.employee_id) from completed r where r.manager_id=c.employee_id and r.unlocked),'[]'::jsonb) results
    from chiefs c
  ) select coalesce(jsonb_agg(to_jsonb(groups) order by department,section,chief_name),'[]'::jsonb) into v_result from groups;
  return v_result;
end;
$$;
revoke all on function workspace.get_performance_department_results(text) from public, anon;
grant execute on function workspace.get_performance_department_results(text) to authenticated, service_role;
comment on function workspace.get_performance_department_results(text) is 'Read-only completed scores for current director/chief hierarchy, requiring all record privacy scopes; excludes drafts and feedback payloads.';
