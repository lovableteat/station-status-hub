begin;

-- Keep an immutable, employee-only copy of every successful self-assessment
-- submission.  This is intentionally separate from performance_reviews so a
-- supervisor deleting the current review cannot erase the employee's history.
create table if not exists workspace.performance_self_assessment_backups (
  id uuid primary key default gen_random_uuid(),
  review_id text not null,
  employee_id text not null,
  cycle_id text not null,
  version_no integer not null,
  employee_name text not null default '',
  department text not null default '',
  role text not null default '',
  due_date date,
  goals jsonb not null default '[]'::jsonb,
  self_feedback text not null,
  source_updated_at timestamptz not null,
  submitted_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (review_id, version_no)
);

create index if not exists performance_self_assessment_backups_employee_idx
  on workspace.performance_self_assessment_backups (employee_id, submitted_at desc);
create index if not exists performance_self_assessment_backups_review_idx
  on workspace.performance_self_assessment_backups (review_id, version_no desc);

alter table workspace.performance_self_assessment_backups enable row level security;
revoke all on table workspace.performance_self_assessment_backups from public, anon, authenticated;
grant select on table workspace.performance_self_assessment_backups to authenticated;
grant all on table workspace.performance_self_assessment_backups to service_role;

create policy performance_self_assessment_backups_employee_read
  on workspace.performance_self_assessment_backups
  for select to authenticated
  using (
    workspace.resolve_performance_employee(employee_id) = workspace.current_system_user_id()
  );

create or replace function workspace.snapshot_performance_self_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := workspace.current_system_user_id();
  v_version integer;
begin
  -- Only the employee's own successful submission creates a snapshot. Drafts,
  -- manager returns, manager scores, and administrator edits never enter this
  -- table, so private manager data is never copied into the employee archive.
  if new.status <> 'submitted'
     or v_actor is null
     or workspace.resolve_performance_employee(new.employee_id) <> v_actor
     or nullif(trim(coalesce(new.self_feedback, '')), '') is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.id::text, 2)
  );

  select coalesce(max(version_no), 0) + 1
    into v_version
    from workspace.performance_self_assessment_backups
   where review_id = new.id;

  insert into workspace.performance_self_assessment_backups (
    review_id,
    employee_id,
    cycle_id,
    version_no,
    employee_name,
    department,
    role,
    due_date,
    goals,
    self_feedback,
    source_updated_at,
    submitted_at
  ) values (
    new.id,
    new.employee_id,
    new.cycle_id,
    v_version,
    coalesce(new.employee_name, ''),
    coalesce(new.department, ''),
    coalesce(new.role, ''),
    new.due_date,
    coalesce(new.goals, '[]'::jsonb),
    new.self_feedback,
    new.updated_at,
    clock_timestamp()
  );

  return new;
end;
$$;

revoke all on function workspace.snapshot_performance_self_assessment() from public, anon, authenticated;
drop trigger if exists snapshot_performance_self_assessment on workspace.performance_reviews;
create trigger snapshot_performance_self_assessment
  after insert or update on workspace.performance_reviews
  for each row execute function workspace.snapshot_performance_self_assessment();

notify pgrst, 'reload schema';
commit;
