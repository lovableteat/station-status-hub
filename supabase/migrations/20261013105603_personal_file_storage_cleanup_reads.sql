-- Storage.remove needs SELECT as well as DELETE. Once metadata is deleted,
-- its trigger queues the path; the authorized cleaner must still be able to
-- select that exact object until physical deletion succeeds.
create or replace function workspace.test_plan_current_user_can_read_storage_object(object_name text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select (select auth.uid()) is not null
    and workspace.test_plan_current_user_can('view') and (
      exists (
        select 1 from workspace.test_plan_files files
        where files.storage_path = object_name
          and workspace.test_plan_current_user_can_access_space(files.space_id, 'view')
      ) or exists (
        select 1 from workspace.test_plan_storage_cleanup_queue queue
        where queue.storage_path = object_name
          and workspace.test_plan_current_user_can_manage_storage_object(object_name)
      )
    )
$$;
revoke all on function workspace.test_plan_current_user_can_read_storage_object(text) from public, anon;
grant execute on function workspace.test_plan_current_user_can_read_storage_object(text) to authenticated;
notify pgrst, 'reload schema';
