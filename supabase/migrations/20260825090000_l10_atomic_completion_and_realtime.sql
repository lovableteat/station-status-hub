-- Make machine completion atomic and restore realtime coverage after the
-- application tables moved from public to workspace.

create or replace function workspace.complete_test_system(
  p_project_id uuid,
  p_system_id uuid,
  p_assigned_to text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  system_flow_version_id uuid;
  completed_item_count integer;
begin
  if p_project_id is null or p_system_id is null then
    raise exception using
      errcode = '22004',
      message = '專案與機台不可為空';
  end if;

  -- One machine can only be completed by one transaction at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'complete-system:' || p_project_id::pg_catalog.text || ':' ||
      p_system_id::pg_catalog.text,
      0
    )
  );

  select pg_catalog.coalesce(systems.flow_version_id, projects.active_flow_version_id)
  into system_flow_version_id
  from workspace.test_systems as systems
  join workspace.test_projects as projects
    on projects.id = systems.project_id
  where systems.id = p_system_id
    and systems.project_id = p_project_id
  for update of systems;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = '找不到指定機台';
  end if;

  if system_flow_version_id is null then
    raise exception using
      errcode = 'P0002',
      message = '機台尚未設定測試流程';
  end if;

  -- Use the same per-item locks as issue creation and progress completion.
  -- Stable ordering avoids deadlocks when two clients act concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_project_id::pg_catalog.text || ':' ||
      p_system_id::pg_catalog.text || ':' ||
      stations.id::pg_catalog.text || ':' ||
      items.id::pg_catalog.text,
      0
    )
  )
  from workspace.test_flow_stations as stations
  join workspace.test_flow_items as items
    on items.station_id = stations.id
   and items.flow_version_id = system_flow_version_id
  where stations.flow_version_id = system_flow_version_id
    and stations.station_order between 0 and 4
  order by stations.station_order, items.item_order, items.id;

  if exists (
    select 1
    from workspace.issues as issues
    join workspace.test_flow_stations as stations
      on stations.id = issues.station_id
     and stations.flow_version_id = system_flow_version_id
    where issues.project_id = p_project_id
      and issues.system_id = p_system_id
      and issues.status in ('open', 'in_progress')
      and issues.test_item_id is not null
      and stations.station_order between 0 and 4
  ) then
    raise exception using
      errcode = 'P0001',
      message = '尚有問題未被解決';
  end if;

  with target_items as (
    select stations.id as station_id, items.id as item_id
    from workspace.test_flow_stations as stations
    join workspace.test_flow_items as items
      on items.station_id = stations.id
     and items.flow_version_id = system_flow_version_id
    where stations.flow_version_id = system_flow_version_id
      and stations.station_order between 0 and 4
  ),
  completed as (
    insert into workspace.test_progress (
      project_id,
      system_id,
      station_id,
      item_id,
      status,
      progress_percent,
      assigned_to,
      started_at,
      completed_at,
      updated_at
    )
    select
      p_project_id,
      p_system_id,
      target_items.station_id,
      target_items.item_id,
      'Done',
      100,
      p_assigned_to,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    from target_items
    on conflict (system_id, station_id, item_id) do update
    set project_id = excluded.project_id,
        status = excluded.status,
        progress_percent = excluded.progress_percent,
        assigned_to = pg_catalog.coalesce(excluded.assigned_to, test_progress.assigned_to),
        started_at = pg_catalog.coalesce(test_progress.started_at, excluded.started_at),
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    returning 1
  )
  select pg_catalog.count(*)::integer
  into completed_item_count
  from completed;

  if completed_item_count = 0 then
    raise exception using
      errcode = 'P0002',
      message = '此機台沒有可完成的測試項目';
  end if;

  return completed_item_count;
end;
$$;

revoke all on function workspace.complete_test_system(uuid, uuid, text) from public;
revoke all on function workspace.complete_test_system(uuid, uuid, text) from anon;
grant execute on function workspace.complete_test_system(uuid, uuid, text) to authenticated;
grant execute on function workspace.complete_test_system(uuid, uuid, text) to service_role;

-- Reopening an issue must immediately persist the linked test item as Error.
-- Resolving an issue remains non-destructive and does not invent completion.
create or replace function workspace.sync_reopened_issue_to_test_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('open', 'in_progress')
    and new.project_id is not null
    and new.system_id is not null
    and new.station_id is not null
    and new.test_item_id is not null
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.project_id::pg_catalog.text || ':' ||
        new.system_id::pg_catalog.text || ':' ||
        new.station_id::pg_catalog.text || ':' ||
        new.test_item_id::pg_catalog.text,
        0
      )
    );

    insert into workspace.test_progress (
      project_id,
      system_id,
      station_id,
      item_id,
      status,
      progress_percent,
      completed_at,
      updated_at
    )
    values (
      new.project_id,
      new.system_id,
      new.station_id,
      new.test_item_id,
      'Error',
      0,
      null,
      pg_catalog.now()
    )
    on conflict (system_id, station_id, item_id) do update
    set project_id = excluded.project_id,
        status = 'Error',
        progress_percent = 0,
        completed_at = null,
        updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_reopened_issue_to_test_progress on workspace.issues;
create trigger sync_reopened_issue_to_test_progress
after insert or update of status, project_id, system_id, station_id, test_item_id
on workspace.issues
for each row
execute function workspace.sync_reopened_issue_to_test_progress();

revoke all on function workspace.sync_reopened_issue_to_test_progress() from public;
revoke all on function workspace.sync_reopened_issue_to_test_progress()
  from anon, authenticated, service_role;

-- ALTER TABLE ... SET SCHEMA removes the old publication membership. Add every
-- cross-tab collaborative table explicitly and safely when it exists.
do $$
declare
  table_name text;
  realtime_tables constant text[] := array[
    'announcements',
    'chat_members',
    'chat_messages',
    'chat_read_receipts',
    'chat_threads',
    'data_center_projects',
    'issue_attachments',
    'issues',
    'material_bom_records',
    'material_bom_workspaces',
    'pcb_designer_library',
    'pcb_designer_projects',
    'pcb_designer_shared_library',
    'pcb_designer_shared_projects',
    'pcb_designer_workspaces',
    'performance_reviews',
    'station_contents',
    'system_users',
    'test_flow_items',
    'test_flow_stations',
    'test_flow_versions',
    'test_progress',
    'test_project_address_fields',
    'test_project_system_fields',
    'test_projects',
    'test_system_address_values',
    'test_system_field_values',
    'test_systems',
    'troubleshooting_records',
    'ui_table_preferences',
    'user_notifications',
    'user_page_permissions'
  ];
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach table_name in array realtime_tables loop
    if pg_catalog.to_regclass('workspace.' || table_name) is not null
      and not exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'workspace'
          and tablename = table_name
      )
    then
      execute pg_catalog.format(
        'alter publication supabase_realtime add table workspace.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'issues',
    'system_users',
    'test_progress',
    'test_projects',
    'test_systems'
  ] loop
    if pg_catalog.to_regclass('workspace.' || table_name) is not null then
      execute pg_catalog.format(
        'alter table workspace.%I replica identity full',
        table_name
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
