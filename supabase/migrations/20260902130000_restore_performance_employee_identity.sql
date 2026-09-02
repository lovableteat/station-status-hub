-- Existing performance rows may identify an employee by the auth UUID or by
-- the account/display name used by the first version of the self-assessment.
-- Keep the RLS boundary, but recognise all of those stable representations so
-- an employee can reopen and continue the same cycle instead of seeing a new
-- blank form.

-- Keep this migration self-contained for projects that have not yet applied
-- the optional manager-assignment migration.  The policy below uses this
-- helper for the private manager branch.
create or replace function workspace.current_user_is_performance_manager()
returns boolean
language sql
stable
security definer
set search_path = workspace, auth, pg_temp
as $$
  select exists (
    select 1
    from workspace.system_users as actor
    where actor.id = workspace.current_system_user_id()
      and actor.status = 'active'
      and (
        actor.role in ('admin', 'super_admin')
        or actor.permissions ->> 'performanceManager' = 'true'
      )
  );
$$;

revoke all on function workspace.current_user_is_performance_manager()
  from public, anon;
grant execute on function workspace.current_user_is_performance_manager()
  to authenticated, service_role;

create or replace function workspace.current_user_is_performance_employee(
  p_employee_id text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, auth, pg_temp
as $$
  select exists (
    select 1
    from workspace.system_users as actor
    where actor.id = workspace.current_system_user_id()
      and actor.status = 'active'
      and nullif(trim(p_employee_id), '') is not null
      and (
        trim(p_employee_id) = actor.id::text
        or lower(trim(p_employee_id)) in (
          lower(trim(coalesce(actor.username, ''))),
          lower(trim(coalesce(actor.display_name, '')))
        )
      )
  );
$$;

revoke all on function workspace.current_user_is_performance_employee(text)
  from public, anon;
grant execute on function workspace.current_user_is_performance_employee(text)
  to authenticated, service_role;

drop policy if exists performance_reviews_read on workspace.performance_reviews;
drop policy if exists performance_reviews_insert on workspace.performance_reviews;
drop policy if exists performance_reviews_update on workspace.performance_reviews;
drop policy if exists performance_reviews_delete on workspace.performance_reviews;

create policy performance_reviews_read
  on workspace.performance_reviews for select to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as actor
      where actor.id = workspace.current_system_user_id()
        and actor.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'view')
      and workspace.current_user_is_performance_employee(employee_id)
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as actor
        where actor.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(actor.display_name, '')),
            lower(coalesce(actor.username, ''))
          )
      )
    )
  );

create policy performance_reviews_insert
  on workspace.performance_reviews for insert to authenticated
  with check (
    exists (
      select 1
      from workspace.system_users as actor
      where actor.id = workspace.current_system_user_id()
        and actor.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and workspace.current_user_is_performance_employee(employee_id)
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as actor
        where actor.id = workspace.current_system_user_id()
          and lower(coalesce(reviewer_name, '')) in (
            lower(coalesce(actor.display_name, '')),
            lower(coalesce(actor.username, ''))
          )
      )
    )
  );

create policy performance_reviews_update
  on workspace.performance_reviews for update to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as actor
      where actor.id = workspace.current_system_user_id()
        and actor.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and workspace.current_user_is_performance_employee(employee_id)
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as actor
        where actor.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(actor.display_name, '')),
            lower(coalesce(actor.username, ''))
          )
      )
    )
  )
  with check (
    exists (
      select 1
      from workspace.system_users as actor
      where actor.id = workspace.current_system_user_id()
        and actor.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and workspace.current_user_is_performance_employee(employee_id)
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as actor
        where actor.id = workspace.current_system_user_id()
          and lower(coalesce(reviewer_name, '')) in (
            lower(coalesce(actor.display_name, '')),
            lower(coalesce(actor.username, ''))
          )
      )
    )
  );

create policy performance_reviews_delete
  on workspace.performance_reviews for delete to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as actor
      where actor.id = workspace.current_system_user_id()
        and actor.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as actor
        where actor.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(actor.display_name, '')),
            lower(coalesce(actor.username, ''))
          )
      )
    )
  );

notify pgrst, 'reload schema';
