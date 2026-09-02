-- Permanently delete a maintenance project and all of its project-owned data.
-- The UI exposes this only to users with station-status edit access, while the
-- database function keeps the same guard in place for direct API callers.
create or replace function workspace.delete_test_project(
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = workspace, auth, extensions, pg_temp
as $$
declare
  v_active_project_count integer;
begin
  if p_project_id is null then
    raise exception 'Project id is required' using errcode = '22023';
  end if;

  if not workspace.current_user_can_workspace('station-status', 'edit') then
    raise exception 'Station-status edit access is required to delete a project'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from workspace.test_projects
    where id = p_project_id
  ) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select count(*)
  into v_active_project_count
  from workspace.test_projects
  where status <> 'archived'
    and not is_archived;

  if v_active_project_count <= 1
     and exists (
       select 1
       from workspace.test_projects
       where id = p_project_id
         and status <> 'archived'
         and not is_archived
     ) then
    raise exception 'At least one active project must be kept'
      using errcode = '23514';
  end if;

  -- These legacy project links intentionally use RESTRICT. Remove their rows
  -- first so deleting a project remains atomic even when it owns live data.
  delete from workspace.test_progress
  where project_id = p_project_id
     or system_id in (
       select id from workspace.test_systems where project_id = p_project_id
     )
     or item_id in (
       select id from workspace.test_flow_items where project_id = p_project_id
     );

  -- Analytics has a legacy NO ACTION link to systems and must be cleared before
  -- the systems themselves are removed.
  delete from workspace.station_time_analytics
  where system_id in (
    select id from workspace.test_systems where project_id = p_project_id
  );

  delete from workspace.station_time_records where project_id = p_project_id;
  delete from workspace.issues where project_id = p_project_id;
  delete from workspace.station_contents where project_id = p_project_id;
  delete from workspace.test_flow_items where project_id = p_project_id;
  delete from workspace.test_flow_stations where project_id = p_project_id;
  delete from workspace.test_systems where project_id = p_project_id;

  -- Remaining project-owned tables use ON DELETE CASCADE (including test-plan
  -- spaces/files). File metadata deletion queues storage blobs for cleanup.
  delete from workspace.test_projects where id = p_project_id;

  return true;
end;
$$;

revoke all on function workspace.delete_test_project(uuid) from public, anon;
grant execute on function workspace.delete_test_project(uuid) to authenticated, service_role;

-- Do not expose a raw table DELETE endpoint that could bypass the permission
-- check above. All project deletion must go through the guarded function.
revoke delete on table workspace.test_projects from anon, authenticated;

notify pgrst, 'reload schema';
