-- Application administrators maintain the organization, but assessment data
-- belongs only to the direct supervisor assigned in that organization.
create or replace function workspace.current_user_is_performance_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from workspace.system_users actor
    join workspace.performance_org_members organization
      on organization.employee_id = actor.id
    where actor.id = workspace.current_system_user_id()
      and actor.status = 'active'
      and actor.permissions ->> 'performanceManager' = 'true'
      and coalesce(actor.permissions #>> '{workspaceAccess,performance}', '') = 'edit'
      and organization.performance_role = 'manager'
      and organization.org_level in ('director', 'section_chief')
  );
$$;

revoke all on function workspace.current_user_is_performance_manager()
  from public, anon;
grant execute on function workspace.current_user_is_performance_manager()
  to authenticated, service_role;

-- The organization roster remains available to application administrators so
-- they can assign the tree. Global administrators are not labelled as
-- performance managers unless the organization row explicitly says so.
create or replace function workspace.get_performance_organization()
returns table (
  employee_id uuid,
  username text,
  display_name text,
  account_status text,
  is_manager boolean,
  manager_id uuid,
  department text,
  job_title text,
  performance_role text,
  org_level text,
  section text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor workspace.system_users%rowtype;
begin
  select * into v_actor
  from workspace.system_users
  where id = workspace.current_system_user_id()
    and status = 'active';

  if not found
     or (
       v_actor.role not in ('admin', 'super_admin')
       and not workspace.current_user_is_performance_manager()
     ) then
    raise exception 'Performance organization access required'
      using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.username::text,
    coalesce(nullif(account.display_name, ''), account.username)::text,
    account.status::text,
    coalesce(organization.performance_role = 'manager', false),
    organization.manager_id,
    coalesce(organization.department, '')::text,
    coalesce(organization.job_title, '')::text,
    coalesce(organization.performance_role, 'none')::text,
    coalesce(organization.org_level, 'member')::text,
    coalesce(organization.section, '')::text,
    organization.updated_at
  from workspace.system_users account
  left join workspace.performance_org_members organization
    on organization.employee_id = account.id
  order by account.display_name, account.username;
end;
$$;

revoke all on function workspace.get_performance_organization()
  from public, anon;
grant execute on function workspace.get_performance_organization()
  to authenticated, service_role;

create or replace function workspace.can_manage_performance_record(
  p_employee_id text,
  p_reviewer_name text,
  p_scopes uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor workspace.system_users%rowtype;
  v_employee uuid;
begin
  select * into v_actor
  from workspace.system_users
  where id = workspace.current_system_user_id()
    and status = 'active';

  if not found then return false; end if;
  v_employee := workspace.resolve_performance_employee(p_employee_id);
  if v_employee is null or v_employee = v_actor.id then return false; end if;
  if not workspace.current_user_can_workspace('performance', 'edit') then
    return false;
  end if;

  -- The actor must be an actual chief/director in the performance tree and
  -- must be the employee's direct manager. Global site role is irrelevant.
  if not exists (
    select 1
    from workspace.performance_org_members report
    join workspace.performance_org_members manager
      on manager.employee_id = report.manager_id
    where report.employee_id = v_employee
      and report.manager_id = v_actor.id
      and manager.performance_role = 'manager'
      and manager.org_level in ('director', 'section_chief')
      and (
        (manager.org_level = 'section_chief' and report.org_level = 'member')
        or (manager.org_level = 'director' and report.org_level = 'section_chief')
        or (
          manager.org_level = 'director'
          and report.org_level = 'member'
          and trim(report.section) <> ''
        )
      )
  ) then
    return false;
  end if;

  -- A supervisor's optional group password protects only that supervisor's
  -- directly assigned assessment group.
  return workspace.performance_scopes_unlocked(array[v_actor.id]);
end;
$$;

revoke all on function workspace.can_manage_performance_record(text, text, uuid[])
  from public, anon;
grant execute on function workspace.can_manage_performance_record(text, text, uuid[])
  to authenticated;

-- A department report follows the same boundary: the authoring chief and the
-- directly assigned director can read it. Administrators receive no bypass.
create or replace function workspace.can_read_performance_section_report(
  p_chief uuid,
  p_director uuid,
  p_status text,
  p_scopes uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor workspace.system_users%rowtype;
begin
  select * into v_actor
  from workspace.system_users
  where id = workspace.current_system_user_id()
    and status = 'active';
  if not found or not workspace.current_user_can_workspace('performance', 'view') then
    return false;
  end if;
  if v_actor.id = p_chief then return true; end if;
  if p_status = 'draft' or v_actor.id <> p_director then return false; end if;
  if not workspace.performance_scopes_unlocked(array[v_actor.id]) then return false; end if;

  return exists (
    select 1
    from workspace.performance_org_members chief
    join workspace.performance_org_members director
      on director.employee_id = chief.manager_id
    where chief.employee_id = p_chief
      and chief.manager_id = v_actor.id
      and chief.org_level = 'section_chief'
      and director.employee_id = v_actor.id
      and director.org_level = 'director'
      and director.performance_role = 'manager'
  );
end;
$$;

revoke all on function workspace.can_read_performance_section_report(uuid, uuid, text, uuid[])
  from public, anon;
grant execute on function workspace.can_read_performance_section_report(uuid, uuid, text, uuid[])
  to authenticated;

-- Notifications are private to their recipient. Announcement authors retain
-- access to delivery history, but ordinary users cannot enumerate another
-- employee's return notice.
alter table workspace.user_notifications enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'workspace'
      and tablename = 'user_notifications'
  loop
    execute format(
      'drop policy %I on workspace.user_notifications',
      policy_row.policyname
    );
  end loop;
end;
$$;

create policy user_notifications_recipient_read
  on workspace.user_notifications
  for select
  to authenticated
  using (
    recipient_id = workspace.current_system_user_id()
    or (
      sender_id = workspace.current_system_user_id()
      and notification_type = 'admin_announcement'
    )
  );

create policy user_notifications_sender_insert
  on workspace.user_notifications
  for insert
  to authenticated
  with check (
    sender_id = workspace.current_system_user_id()
    and exists (
      select 1
      from workspace.system_users recipient
      where recipient.id = recipient_id
        and recipient.status = 'active'
    )
    and (
      notification_type <> 'performance_review_returned'
      or exists (
        select 1
        from workspace.performance_org_members report
        join workspace.performance_org_members manager
          on manager.employee_id = report.manager_id
        where report.employee_id = recipient_id
          and report.manager_id = workspace.current_system_user_id()
          and manager.performance_role = 'manager'
          and manager.org_level in ('director', 'section_chief')
          and (
            (manager.org_level = 'section_chief' and report.org_level = 'member')
            or (manager.org_level = 'director' and report.org_level = 'section_chief')
            or (
              manager.org_level = 'director'
              and report.org_level = 'member'
              and trim(report.section) <> ''
            )
          )
      )
    )
  );

create policy user_notifications_recipient_update
  on workspace.user_notifications
  for update
  to authenticated
  using (recipient_id = workspace.current_system_user_id())
  with check (recipient_id = workspace.current_system_user_id());

notify pgrst, 'reload schema';
