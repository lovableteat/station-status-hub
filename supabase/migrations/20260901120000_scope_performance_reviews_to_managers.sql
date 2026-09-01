-- Keep employee self-assessments private while limiting manager review rows to
-- administrators or the direct supervisor recorded on each review.
-- The application still hides manager feedback from employee-facing details;
-- these policies make the row scope match that UI boundary as well.

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
      workspace.current_user_can_workspace('performance', 'edit')
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
      and (
        employee_id = workspace.current_system_user_id()::text
        or exists (
          select 1
          from workspace.system_users as current_user
          where current_user.id = workspace.current_system_user_id()
            and lower(coalesce(reviewer_name, '')) in (
              lower(coalesce(current_user.display_name, '')),
              lower(coalesce(current_user.username, ''))
            )
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
      and (
        employee_id = workspace.current_system_user_id()::text
        or exists (
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
      and (
        employee_id = workspace.current_system_user_id()::text
        or exists (
          select 1
          from workspace.system_users as current_user
          where current_user.id = workspace.current_system_user_id()
            and lower(coalesce(reviewer_name, '')) in (
              lower(coalesce(current_user.display_name, '')),
              lower(coalesce(current_user.username, ''))
            )
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
      workspace.current_user_can_workspace('performance', 'edit')
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
