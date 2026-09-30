begin;
set local request.jwt.claims = '{"role":"service_role"}';

-- Names are labels, while employee UUIDs remain the permanent identity.
create or replace function workspace.canonical_performance_employee_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_employee uuid; v_name text;
begin
  v_employee := workspace.resolve_performance_employee(new.employee_id);
  if v_employee is not null then
    select coalesce(nullif(trim(display_name), ''), username) into v_name
      from workspace.system_users where id = v_employee;
    new.employee_id := v_employee::text;
    new.employee_name := v_name;
  end if;
  return new;
end;
$$;
revoke all on function workspace.canonical_performance_employee_name() from public, anon, authenticated;
create trigger canonical_performance_employee_name
before insert or update of employee_id, employee_name on workspace.performance_reviews
for each row execute function workspace.canonical_performance_employee_name();

create or replace function workspace.sync_performance_account_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.display_name is not distinct from old.display_name
     and new.username is not distinct from old.username then return new; end if;
  if tg_when = 'BEFORE' then
    -- Resolve legacy account/name identifiers before their old labels disappear.
    update workspace.performance_reviews r set employee_id = old.id::text
      where r.employee_id is distinct from old.id::text
        and workspace.resolve_performance_employee(r.employee_id) = old.id;
  else
    update workspace.performance_reviews set
      employee_name = coalesce(nullif(trim(new.display_name), ''), new.username)
      where employee_id = new.id::text
        and employee_name is distinct from coalesce(nullif(trim(new.display_name), ''), new.username);
  end if;
  return new;
end;
$$;
revoke all on function workspace.sync_performance_account_name() from public, anon, authenticated;
create trigger preserve_performance_account_identity
before update of display_name, username on workspace.system_users
for each row execute function workspace.sync_performance_account_name();
create trigger sync_performance_account_name
after update of display_name, username on workspace.system_users
for each row execute function workspace.sync_performance_account_name();

-- A label update must not create an extra submitted backup.
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
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.self_feedback is not distinct from old.self_feedback
     and new.goals is not distinct from old.goals then
    return new;
  end if;
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


-- Label-only changes are not a new assessment content version.
create or replace function workspace.preserve_performance_name_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new) - array['employee_name', 'employee_id', 'updated_at'])
     = (to_jsonb(old) - array['employee_name', 'employee_id', 'updated_at']) then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function workspace.preserve_performance_name_version() from public, anon, authenticated;
create trigger zzzz_preserve_performance_name_version
before update on workspace.performance_reviews
for each row execute function workspace.preserve_performance_name_version();

-- Repair already submitted records whose account name was changed earlier.
update workspace.performance_reviews r
set employee_id = u.id::text,
    employee_name = coalesce(nullif(trim(u.display_name), ''), u.username)
from workspace.system_users u
where workspace.resolve_performance_employee(r.employee_id) = u.id
  and (r.employee_id is distinct from u.id::text
       or r.employee_name is distinct from coalesce(nullif(trim(u.display_name), ''), u.username));
notify pgrst, 'reload schema';
commit;
