-- Explicit revocation and durable detailed permissions take precedence over
-- legacy rows. Existing active site-admin exceptions are retained for account
-- administration/Data Center; assessment supervision has no global-admin bypass.
-- Apply separately after deployment approval. CI only executes isolated fixtures.
begin;

create or replace function workspace.current_user_has_stored_page_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and case when jsonb_typeof(account.permissions -> 'pagePermissions') = 'array'
        then (account.permissions -> 'pagePermissions') @> jsonb_build_array(p_permission)
        else exists (select 1 from workspace.user_page_permissions legacy
          where legacy.user_id = account.id and legacy.permission::text = p_permission)
      end
  );
$$;
revoke all on function workspace.current_user_has_stored_page_permission(text) from public, anon, authenticated;

create or replace function workspace.can_view_data_center_projects()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and (account.role in ('admin', 'super_admin') or
        case when (account.permissions -> 'workspaceAccess') ? 'data-center'
          then coalesce(account.permissions #>> '{workspaceAccess,data-center}', '') in ('view', 'edit')
          else workspace.current_user_has_stored_page_permission('data_center_edit')
            or workspace.current_user_has_stored_page_permission('data_center_view')
        end)
  );
$$;
-- Existing RLS policies may still reference the public function OID.
create or replace function public.can_view_data_center_projects()
returns boolean language sql stable security definer set search_path = '' as $$
  select workspace.can_view_data_center_projects();
$$;
revoke all on function workspace.can_view_data_center_projects() from public, anon;
revoke all on function public.can_view_data_center_projects() from public, anon;
grant execute on function workspace.can_view_data_center_projects() to authenticated, service_role;
grant execute on function public.can_view_data_center_projects() to authenticated, service_role;

create or replace function workspace.can_edit_data_center_projects()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and (account.role in ('admin', 'super_admin') or
        case when (account.permissions -> 'workspaceAccess') ? 'data-center'
          then coalesce(account.permissions #>> '{workspaceAccess,data-center}', '') = 'edit'
          else workspace.current_user_has_stored_page_permission('data_center_edit')
        end)
  );
$$;
-- Existing RLS policies may still reference the public function OID.
create or replace function public.can_edit_data_center_projects()
returns boolean language sql stable security definer set search_path = '' as $$
  select workspace.can_edit_data_center_projects();
$$;
revoke all on function workspace.can_edit_data_center_projects() from public, anon;
revoke all on function public.can_edit_data_center_projects() from public, anon;
grant execute on function workspace.can_edit_data_center_projects() to authenticated, service_role;
grant execute on function public.can_edit_data_center_projects() to authenticated, service_role;

create or replace function workspace.can_manage_system_users()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and (account.role in ('admin', 'super_admin') or (
        case when (account.permissions -> 'workspaceAccess') ? 'user-management'
          then coalesce(account.permissions #>> '{workspaceAccess,user-management}', '') = 'edit'
          else true end
        and workspace.current_user_has_stored_page_permission('admin_edit')
      ))
  );
$$;
create or replace function public.can_manage_system_users()
returns boolean language sql stable security definer set search_path = '' as $$
  select workspace.can_manage_system_users();
$$;
revoke all on function workspace.can_manage_system_users() from public, anon;
revoke all on function public.can_manage_system_users() from public, anon;
grant execute on function workspace.can_manage_system_users() to authenticated, service_role;
grant execute on function public.can_manage_system_users() to authenticated, service_role;

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
  if not workspace.current_user_is_performance_manager()
     or not workspace.current_user_can_workspace('performance', 'edit') then
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

-- Preserve the chief's own report read path; a director reading another
-- chief's submission must still have the current reviewer assignment.
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
  if not workspace.current_user_is_performance_manager() then return false; end if;
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

notify pgrst, 'reload schema';
commit;
