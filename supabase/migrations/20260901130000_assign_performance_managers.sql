-- An account's performance workspace access is not the same thing as being a
-- reviewer.  Administrators explicitly toggle performanceManager in the
-- system-user permission snapshot; this migration makes that designation
-- enforceable at the database boundary.

create or replace function workspace.current_user_is_performance_manager()
returns boolean
language sql
stable
security definer
set search_path = workspace, auth, pg_temp
as $$
  select exists (
    select 1
    from workspace.system_users as current_user
    where current_user.id = workspace.current_system_user_id()
      and current_user.status = 'active'
      and (
        current_user.role in ('admin', 'super_admin')
        or current_user.permissions ->> 'performanceManager' = 'true'
      )
  );
$$;

revoke all on function workspace.current_user_is_performance_manager() from public, anon;
grant execute on function workspace.current_user_is_performance_manager()
  to authenticated, service_role;

-- Employees may update their own self-assessment, but manager-only fields and
-- the assigned reviewer are immutable to them.  This prevents a crafted API
-- request from writing private feedback into a self-assessment row.
create or replace function workspace.guard_performance_review_self_update()
returns trigger
language plpgsql
security definer
set search_path = workspace, auth, pg_temp
as $$
declare
  current_user_row workspace.system_users%rowtype;
begin
  select users.*
  into current_user_row
  from workspace.system_users as users
  where users.id = workspace.current_system_user_id()
    and users.status = 'active'
  limit 1;

  if current_user_row.role in ('admin', 'super_admin')
    or coalesce(current_user_row.permissions ->> 'performanceManager', 'false') = 'true'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.manager_feedback, '') <> ''
      or new.score is not null
      or coalesce(new.reviewer_name, '') <> ''
    then
      raise exception 'Only an assigned performance manager can edit manager assessment fields';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.manager_feedback is distinct from old.manager_feedback
      or new.score is distinct from old.score
      or new.reviewer_name is distinct from old.reviewer_name
    then
      raise exception 'Only an assigned performance manager can edit manager assessment fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_performance_review_self_update
  on workspace.performance_reviews;
create trigger guard_performance_review_self_update
before insert or update on workspace.performance_reviews
for each row execute function workspace.guard_performance_review_self_update();

drop policy if exists performance_reviews_read on workspace.performance_reviews;
drop policy if exists performance_reviews_insert on workspace.performance_reviews;
drop policy if exists performance_reviews_update on workspace.performance_reviews;
drop policy if exists performance_reviews_delete on workspace.performance_reviews;

create policy performance_reviews_read
  on workspace.performance_reviews for select to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as current_user
      where current_user.id = workspace.current_system_user_id()
        and current_user.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'view')
      and employee_id = workspace.current_system_user_id()::text
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as current_user
        where current_user.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(current_user.display_name, '')),
            lower(coalesce(current_user.username, ''))
          )
      )
    )
  );

create policy performance_reviews_insert
  on workspace.performance_reviews for insert to authenticated
  with check (
    exists (
      select 1
      from workspace.system_users as current_user
      where current_user.id = workspace.current_system_user_id()
        and current_user.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and employee_id = workspace.current_system_user_id()::text
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as current_user
        where current_user.id = workspace.current_system_user_id()
          and lower(coalesce(reviewer_name, '')) in (
            lower(coalesce(current_user.display_name, '')),
            lower(coalesce(current_user.username, ''))
          )
      )
    )
  );

create policy performance_reviews_update
  on workspace.performance_reviews for update to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as current_user
      where current_user.id = workspace.current_system_user_id()
        and current_user.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and employee_id = workspace.current_system_user_id()::text
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as current_user
        where current_user.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(current_user.display_name, '')),
            lower(coalesce(current_user.username, ''))
          )
      )
    )
  )
  with check (
    exists (
      select 1
      from workspace.system_users as current_user
      where current_user.id = workspace.current_system_user_id()
        and current_user.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_can_workspace('performance', 'edit')
      and employee_id = workspace.current_system_user_id()::text
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as current_user
        where current_user.id = workspace.current_system_user_id()
          and lower(coalesce(reviewer_name, '')) in (
            lower(coalesce(current_user.display_name, '')),
            lower(coalesce(current_user.username, ''))
          )
      )
    )
  );

create policy performance_reviews_delete
  on workspace.performance_reviews for delete to authenticated
  using (
    exists (
      select 1
      from workspace.system_users as current_user
      where current_user.id = workspace.current_system_user_id()
        and current_user.role in ('admin', 'super_admin')
    )
    or (
      workspace.current_user_is_performance_manager()
      and workspace.current_user_can_workspace('performance', 'edit')
      and exists (
        select 1
        from workspace.system_users as current_user
        where current_user.id = workspace.current_system_user_id()
          and lower(coalesce(performance_reviews.reviewer_name, '')) in (
            lower(coalesce(current_user.display_name, '')),
            lower(coalesce(current_user.username, ''))
          )
      )
    )
  );

notify pgrst, 'reload schema';
