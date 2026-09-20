alter table workspace.performance_section_reports
  add column if not exists director_attachments jsonb not null default '[]'::jsonb,
  add column if not exists feedback_history jsonb not null default '[]'::jsonb;

update workspace.performance_section_reports report
set feedback_history = jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'action', case when report.status = 'returned' then 'return' else 'approve' end,
  'feedback', trim(report.director_feedback),
  'attachments', '[]'::jsonb,
  'reviewerName', coalesce(nullif(reviewer.display_name, ''), reviewer.username, '部長'),
  'reviewedAt', report.updated_at
))
from workspace.system_users reviewer
where reviewer.id = report.director_id
  and report.status in ('returned', 'approved')
  and trim(report.director_feedback) <> ''
  and report.feedback_history = '[]'::jsonb;

create or replace function workspace.performance_section_attachments_valid(p_attachments jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) = 'array' then
    jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) <= 4
    and octet_length(coalesce(p_attachments, '[]'::jsonb)::text) <= 6000000
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) item
      where jsonb_typeof(item) <> 'object'
        or nullif(item ->> 'id', '') is null
        or nullif(item ->> 'name', '') is null
        or length(item ->> 'name') > 255
        or lower(item ->> 'name') !~ '\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip|jpg|jpeg|png|webp)$'
        or not case
          when coalesce(item ->> 'size', '') ~ '^[0-9]+$'
          then (item ->> 'size')::numeric between 0 and 4194304
          else false
        end
        or coalesce(item ->> 'dataUrl', '') !~* '^data:(application/(pdf|msword|vnd\.[^;,]+|zip|x-zip-compressed|octet-stream)|text/(plain|csv)|image/(jpeg|png|webp));base64,'
    )
  else false end;
$$;

revoke all on function workspace.performance_section_attachments_valid(jsonb) from public, anon, authenticated;

create or replace function workspace.review_performance_section_report_v2(
  p_id uuid,
  p_action text,
  p_feedback text,
  p_attachments jsonb,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_existing workspace.performance_section_reports%rowtype;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_reviewer_name text;
begin
  if not workspace.current_user_is_performance_manager()
     or not workspace.current_user_can_workspace('performance','edit') then
    raise exception 'Active performance manager required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve','return')
     or p_feedback is null or length(p_feedback) > 10000
     or (p_action = 'return' and trim(p_feedback) = '')
     or not workspace.performance_section_attachments_valid(v_attachments) then
    raise exception 'A valid review response is required' using errcode = '22023';
  end if;

  lock table workspace.performance_org_members in share mode;
  lock table workspace.performance_section_reports in share row exclusive mode;
  select * into v_existing from workspace.performance_section_reports where id = p_id;
  if not found or v_existing.director_id <> v_actor or not exists (
    select 1
    from workspace.performance_org_members chief
    join workspace.performance_org_members director on director.employee_id = chief.manager_id
    where chief.employee_id = v_existing.chief_id
      and chief.org_level = 'section_chief'
      and director.employee_id = v_actor
      and director.org_level = 'director'
  ) or not workspace.can_read_performance_section_report(
    v_existing.chief_id,
    v_existing.director_id,
    v_existing.status,
    v_existing.privacy_scope_ids
  ) then
    raise exception 'Only the current director can review an unlocked submitted summary' using errcode = '42501';
  end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'Summary changed; reload before reviewing' using errcode = '40001';
  end if;
  if v_existing.status <> 'submitted' then
    raise exception 'Summary is not awaiting review' using errcode = '22023';
  end if;

  select coalesce(nullif(display_name, ''), username)
    into v_reviewer_name
    from workspace.system_users
    where id = v_actor;

  update workspace.performance_section_reports
  set status = case when p_action = 'approve' then 'approved' else 'returned' end,
      director_feedback = trim(p_feedback),
      director_attachments = v_attachments,
      feedback_history = coalesce(feedback_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'action', p_action,
        'feedback', trim(p_feedback),
        'attachments', v_attachments,
        'reviewerName', coalesce(v_reviewer_name, '部長'),
        'reviewedAt', clock_timestamp()
      )),
      updated_at = clock_timestamp()
  where id = p_id;
end;
$$;

revoke all on function workspace.review_performance_section_report_v2(uuid,text,text,jsonb,timestamptz) from public, anon;
grant execute on function workspace.review_performance_section_report_v2(uuid,text,text,jsonb,timestamptz) to authenticated;

create or replace function workspace.review_performance_section_report(
  p_id uuid,
  p_action text,
  p_feedback text,
  p_expected_updated_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  select workspace.review_performance_section_report_v2(
    p_id,
    p_action,
    p_feedback,
    '[]'::jsonb,
    p_expected_updated_at
  );
$$;

revoke all on function workspace.review_performance_section_report(uuid,text,text,timestamptz) from public, anon;
grant execute on function workspace.review_performance_section_report(uuid,text,text,timestamptz) to authenticated;

create or replace function workspace.clear_section_report_current_feedback_on_resubmit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'returned' and new.status = 'submitted' then
    new.director_feedback := '';
    new.director_attachments := '[]'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function workspace.clear_section_report_current_feedback_on_resubmit() from public, anon, authenticated;
drop trigger if exists clear_section_report_current_feedback_on_resubmit on workspace.performance_section_reports;
create trigger clear_section_report_current_feedback_on_resubmit
before update on workspace.performance_section_reports
for each row execute function workspace.clear_section_report_current_feedback_on_resubmit();

notify pgrst, 'reload schema';
