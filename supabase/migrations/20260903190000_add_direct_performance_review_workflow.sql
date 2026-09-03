-- Assessment access follows the immediate reporting relationship. Ancestors
-- remain password-protection scopes, never an additional reading permission.
create or replace function workspace.can_manage_performance_record(p_employee_id text, p_reviewer_name text, p_scopes uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype; v_employee uuid;
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  if not found then return false; end if;
  v_employee := workspace.resolve_performance_employee(p_employee_id);
  if not workspace.performance_scopes_unlocked(coalesce(p_scopes, array[]::uuid[])
    || workspace.performance_org_ancestors(v_employee) || array[v_employee]) then return false; end if;
  if v_actor.role in ('admin', 'super_admin') then return true; end if;
  if not workspace.current_user_is_performance_manager() or not workspace.current_user_can_workspace('performance', 'edit') then return false; end if;
  return exists (
    select 1 from workspace.performance_org_members child
    join workspace.performance_org_members parent on parent.employee_id = child.manager_id
    where child.employee_id = v_employee and child.manager_id = v_actor.id
      and ((parent.org_level = 'section_chief' and child.org_level = 'member')
        or (parent.org_level = 'director' and child.org_level = 'section_chief')
        or (parent.org_level = 'director' and child.org_level = 'member' and trim(child.section) <> ''))
  );
end;
$$;
revoke all on function workspace.can_manage_performance_record(text,text,uuid[]) from public, anon;
grant execute on function workspace.can_manage_performance_record(text,text,uuid[]) to authenticated;

-- A chief sends a separate summary to the director. Raw employee assessments
-- are never embedded in, joined into or exposed through these reports.
create table if not exists workspace.performance_section_reports (
  id uuid primary key default gen_random_uuid(),
  chief_id uuid not null references workspace.system_users(id) on delete restrict,
  director_id uuid not null references workspace.system_users(id) on delete restrict,
  cycle_id text not null check (cycle_id ~ '^[0-9]{4}-q[1-4]$'),
  department text not null,
  section text not null,
  summary text not null default '' check (length(summary) <= 20000),
  status text not null default 'draft' check (status in ('draft','submitted','returned','approved')),
  director_feedback text not null default '' check (length(director_feedback) <= 10000),
  total_members integer not null default 0,
  completed_members integer not null default 0,
  submitted_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  privacy_scope_ids uuid[] not null default array[]::uuid[],
  unique(chief_id, cycle_id)
);
create index if not exists performance_section_reports_director_cycle_idx on workspace.performance_section_reports(director_id, cycle_id);
alter table workspace.performance_section_reports enable row level security;
revoke all on workspace.performance_section_reports from public, anon, authenticated;
grant select on workspace.performance_section_reports to authenticated;
grant all on workspace.performance_section_reports to service_role;

create or replace function workspace.can_read_performance_section_report(p_chief uuid, p_director uuid, p_status text, p_scopes uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype;
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  if not found or not workspace.current_user_can_workspace('performance','view') then return false; end if;
  if v_actor.id = p_chief then return true; end if;
  if not workspace.performance_scopes_unlocked(coalesce(p_scopes,array[]::uuid[]) || array[p_chief,p_director] || workspace.performance_org_ancestors(p_chief)) then return false; end if;
  if v_actor.role in ('admin','super_admin') then return true; end if;
  return p_status <> 'draft' and v_actor.id = p_director
    and workspace.current_user_is_performance_manager()
    and exists (select 1 from workspace.performance_org_members chief
      join workspace.performance_org_members director on director.employee_id = chief.manager_id
      where chief.employee_id = p_chief and chief.org_level = 'section_chief'
        and director.employee_id = v_actor.id and director.org_level = 'director');
end;
$$;
revoke all on function workspace.can_read_performance_section_report(uuid,uuid,text,uuid[]) from public, anon;
grant execute on function workspace.can_read_performance_section_report(uuid,uuid,text,uuid[]) to authenticated;
create policy performance_section_reports_read on workspace.performance_section_reports for select to authenticated
using (workspace.can_read_performance_section_report(chief_id,director_id,status,privacy_scope_ids));

create or replace function workspace.get_performance_section_reports(p_cycle_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
    'chief_name',chief.display_name,'director_name',director.display_name)
    order by r.updated_at desc),'[]'::jsonb)
  from workspace.performance_section_reports r
  join workspace.system_users chief on chief.id = r.chief_id
  join workspace.system_users director on director.id = r.director_id
  where r.cycle_id = p_cycle_id and workspace.can_read_performance_section_report(r.chief_id,r.director_id,r.status,r.privacy_scope_ids);
$$;
revoke all on function workspace.get_performance_section_reports(text) from public, anon;
grant execute on function workspace.get_performance_section_reports(text) to authenticated;

create or replace function workspace.save_performance_section_report(p_cycle_id text, p_summary text, p_submit boolean, p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := workspace.current_system_user_id(); v_chief workspace.performance_org_members%rowtype;
  v_existing workspace.performance_section_reports%rowtype; v_id uuid; v_scopes uuid[]; v_total integer; v_completed integer;
begin
  if not workspace.current_user_is_performance_manager() or not workspace.current_user_can_workspace('performance','edit') then
    raise exception 'Active performance manager required' using errcode = '42501'; end if;
  if p_cycle_id is null or p_cycle_id !~ '^[0-9]{4}-q[1-4]$' or p_summary is null or length(p_summary) > 20000
    or p_submit is null or (p_submit and trim(p_summary) = '') then
    raise exception 'A valid cycle and summary are required' using errcode = '22023'; end if;
  lock table workspace.performance_org_members in share mode;
  lock table workspace.performance_section_reports in share row exclusive mode;
  select * into v_chief from workspace.performance_org_members where employee_id = v_actor and org_level = 'section_chief';
  if not found or not exists (select 1 from workspace.performance_org_members o join workspace.system_users u on u.id = o.employee_id
    where o.employee_id = v_chief.manager_id and o.org_level = 'director' and o.performance_role = 'manager' and u.status = 'active') then
    raise exception 'Only an assigned chief can send a summary to their director' using errcode = '42501'; end if;
  select * into v_existing from workspace.performance_section_reports where chief_id = v_actor and cycle_id = p_cycle_id;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'Summary changed; reload before saving' using errcode = '40001'; end if;
  if v_existing.status = 'approved' or (v_existing.status = 'submitted' and v_existing.director_id = v_chief.manager_id) then
    raise exception 'Submitted summary must be returned before editing' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x),array[]::uuid[]) into v_scopes from unnest(
    coalesce(v_existing.privacy_scope_ids,array[]::uuid[]) || workspace.performance_org_ancestors(v_actor) || array[v_actor]) x where x is not null;
  select count(*), count(*) filter (where exists (select 1 from workspace.performance_reviews r
    where workspace.resolve_performance_employee(r.employee_id) = o.employee_id and r.cycle_id = p_cycle_id and r.status = 'approved'
      and workspace.can_manage_performance_record(r.employee_id,r.reviewer_name,r.privacy_scope_ids)))
    into v_total, v_completed from workspace.performance_org_members o
    where o.manager_id = v_actor and o.org_level = 'member';
  insert into workspace.performance_section_reports(chief_id,director_id,cycle_id,department,section,summary,status,total_members,completed_members,submitted_at,privacy_scope_ids)
    values(v_actor,v_chief.manager_id,p_cycle_id,v_chief.department,v_chief.section,trim(p_summary),case when p_submit then 'submitted' else 'draft' end,
      v_total,v_completed,case when p_submit then clock_timestamp() else null end,v_scopes)
  on conflict(chief_id,cycle_id) do update set director_id = excluded.director_id, department = excluded.department, section = excluded.section,
    summary = excluded.summary, status = excluded.status, total_members = excluded.total_members, completed_members = excluded.completed_members,
    submitted_at = excluded.submitted_at, privacy_scope_ids = excluded.privacy_scope_ids, updated_at = clock_timestamp()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function workspace.save_performance_section_report(text,text,boolean,timestamptz) from public, anon;
grant execute on function workspace.save_performance_section_report(text,text,boolean,timestamptz) to authenticated;

create or replace function workspace.review_performance_section_report(p_id uuid, p_action text, p_feedback text, p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := workspace.current_system_user_id(); v_existing workspace.performance_section_reports%rowtype;
begin
  if not workspace.current_user_is_performance_manager() or not workspace.current_user_can_workspace('performance','edit') then
    raise exception 'Active performance manager required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('approve','return') or p_feedback is null or length(p_feedback) > 10000
    or (p_action = 'return' and trim(p_feedback) = '') then
    raise exception 'A return requires feedback' using errcode = '22023'; end if;
  lock table workspace.performance_org_members in share mode;
  lock table workspace.performance_section_reports in share row exclusive mode;
  select * into v_existing from workspace.performance_section_reports where id = p_id;
  if not found or v_existing.director_id <> v_actor or not exists (
    select 1 from workspace.performance_org_members chief join workspace.performance_org_members director on director.employee_id = chief.manager_id
    where chief.employee_id = v_existing.chief_id and chief.org_level = 'section_chief'
      and director.employee_id = v_actor and director.org_level = 'director')
    or not workspace.can_read_performance_section_report(v_existing.chief_id,v_existing.director_id,v_existing.status,v_existing.privacy_scope_ids) then
    raise exception 'Only the current director can review an unlocked submitted summary' using errcode = '42501'; end if;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception 'Summary changed; reload before reviewing' using errcode = '40001'; end if;
  if v_existing.status <> 'submitted' then raise exception 'Summary is not awaiting review' using errcode = '22023'; end if;
  update workspace.performance_section_reports set status = case when p_action = 'approve' then 'approved' else 'returned' end,
    director_feedback = trim(p_feedback), updated_at = clock_timestamp() where id = p_id;
end;
$$;
revoke all on function workspace.review_performance_section_report(uuid,text,text,timestamptz) from public, anon;
grant execute on function workspace.review_performance_section_report(uuid,text,text,timestamptz) to authenticated;

create or replace function workspace.retain_section_report_privacy_before_org_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id then return new; end if;
  update workspace.performance_section_reports r set privacy_scope_ids = (
    select coalesce(array_agg(distinct x),array[]::uuid[]) from unnest(r.privacy_scope_ids || workspace.performance_org_ancestors(r.chief_id) || array[r.chief_id]) x where x is not null
  ) where r.chief_id = old.employee_id or old.employee_id = any(workspace.performance_org_ancestors(r.chief_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function workspace.retain_section_report_privacy_before_org_change() from public, anon, authenticated;
create trigger retain_section_report_privacy_before_org_change before update or delete on workspace.performance_org_members
for each row execute function workspace.retain_section_report_privacy_before_org_change();
notify pgrst,'reload schema';
