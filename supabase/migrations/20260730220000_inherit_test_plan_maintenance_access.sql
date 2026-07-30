-- Test_Plan is a child module of the maintenance workspace. Keep the database
-- predicate aligned with the browser permission resolver so metadata and
-- private Storage policies cannot disagree with the visible navigation.
create or replace function public.test_plan_current_user_can(action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.system_users as users
    where users.auth_user_id = (select auth.uid())
      and users.status = 'active'
      and (
        users.role in ('admin', 'super_admin')
        or (
          coalesce(
            users.permissions #> '{workspaceAccess}',
            '{}'::jsonb
          ) ? 'station-status'
          and (
            (
              action = 'view'
              and users.permissions
                #>> '{workspaceAccess,station-status}' in ('view', 'edit')
            )
            or (
              action = 'edit'
              and users.permissions
                #>> '{workspaceAccess,station-status}' = 'edit'
            )
          )
        )
        or (
          not (
            coalesce(
              users.permissions #> '{workspaceAccess}',
              '{}'::jsonb
            ) ? 'station-status'
          )
          and exists (
            select 1
            from public.user_page_permissions as page_permissions
            where page_permissions.user_id = users.id
              and (
                (
                  action = 'view'
                  and page_permissions.permission::text in (
                    'test_plan_view',
                    'test_plan_edit'
                  )
                )
                or (
                  action = 'edit'
                  and page_permissions.permission::text = 'test_plan_edit'
                )
              )
          )
        )
      )
  )
$$;

revoke all on function public.test_plan_current_user_can(text) from public;
grant execute on function public.test_plan_current_user_can(text)
  to authenticated;
