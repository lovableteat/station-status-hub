-- Preserve original test progress as the source of truth. Unresolved issues are
-- projected as Blocked by the application and only guard future Done writes.

drop trigger if exists sync_unresolved_issue_to_test_progress on workspace.issues;
drop function if exists workspace.sync_unresolved_issue_to_test_progress();

-- The legacy summary trigger looked at every station in the database. Scope it
-- to the affected system's project and flow version before restoring progress.
create or replace function public.update_system_completion_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_system_id uuid;
  system_project_id uuid;
  system_flow_version_id uuid;
begin
  affected_system_id := case when tg_op = 'DELETE' then old.system_id else new.system_id end;

  select
    systems.project_id,
    coalesce(systems.flow_version_id, projects.active_flow_version_id)
  into system_project_id, system_flow_version_id
  from workspace.test_systems as systems
  left join workspace.test_projects as projects on projects.id = systems.project_id
  where systems.id = affected_system_id;

  if system_project_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  with scoped_stations as (
    select
      stations.id,
      stations.station_name,
      stations.station_order
    from workspace.test_flow_stations as stations
    where stations.project_id = system_project_id
      and stations.flow_version_id is not distinct from system_flow_version_id
  ),
  station_progress as (
    select
      stations.id as station_id,
      stations.station_name,
      stations.station_order,
      pg_catalog.count(items.id) as total_items,
      pg_catalog.count(items.id) filter (where progress.status = 'Done') as completed_items,
      case
        when pg_catalog.count(items.id) = 0 then 0
        else pg_catalog.round(
          pg_catalog.count(items.id) filter (where progress.status = 'Done')::pg_catalog.numeric
          / pg_catalog.count(items.id)::pg_catalog.numeric * 100
        )
      end as completion_percent
    from scoped_stations as stations
    left join workspace.test_flow_items as items
      on items.station_id = stations.id
      and items.project_id = system_project_id
      and items.flow_version_id is not distinct from system_flow_version_id
    left join workspace.test_progress as progress
      on progress.project_id = system_project_id
      and progress.system_id = affected_system_id
      and progress.station_id = stations.id
      and progress.item_id = items.id
    group by stations.id, stations.station_name, stations.station_order
  ),
  summary as (
    select
      pg_catalog.count(*) as station_count,
      pg_catalog.count(*) filter (where completion_percent = 100) as completed_stations,
      coalesce(pg_catalog.round(pg_catalog.avg(completion_percent)), 0) as overall_progress,
      (
        select progress.station_name
        from station_progress as progress
        where progress.completion_percent < 100
        order by progress.station_order, progress.station_id
        limit 1
      ) as first_incomplete_station,
      (
        select progress.station_name
        from station_progress as progress
        order by progress.station_order desc, progress.station_id desc
        limit 1
      ) as final_station
    from station_progress
  )
  update workspace.test_systems as systems
  set
    overall_progress = summary.overall_progress,
    current_station = coalesce(
      summary.first_incomplete_station,
      summary.final_station,
      systems.current_station
    ),
    status = case
      when summary.station_count > 0
        and summary.completed_stations = summary.station_count then 'Done'
      when summary.completed_stations > 0 then 'On-going'
      else 'Not Start'
    end,
    actual_completed_at = case
      when summary.station_count > 0
        and summary.completed_stations = summary.station_count
        and systems.actual_completed_at is null then pg_catalog.now()
      else systems.actual_completed_at
    end,
    actual_started_at = case
      when summary.completed_stations > 0 and systems.actual_started_at is null then
        coalesce(
          (
            select pg_catalog.min(progress.started_at)
            from workspace.test_progress as progress
            where progress.project_id = system_project_id
              and progress.system_id = affected_system_id
              and progress.started_at is not null
          ),
          pg_catalog.now()
        )
      else systems.actual_started_at
    end,
    updated_at = pg_catalog.now()
  from summary
  where systems.id = affected_system_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Restore only rows whose current state and timestamp still exactly match the
-- anonymous Done -> Error audit record emitted by the destructive backfill.
with backfill_changes as (
  select distinct on (
    audit.system_id,
    audit.station_id,
    audit.item_id
  )
    audit.system_id,
    audit.station_id,
    audit.item_id,
    audit.old_values ->> 'status' as old_status,
    (audit.old_values ->> 'started_at')::pg_catalog.timestamptz as old_started_at,
    (audit.old_values ->> 'completed_at')::pg_catalog.timestamptz as old_completed_at,
    (audit.old_values ->> 'actual_hours')::pg_catalog.numeric as old_actual_hours
  from workspace.test_progress_audit as audit
  join workspace.test_progress as progress
    on progress.system_id = audit.system_id
    and progress.station_id = audit.station_id
    and progress.item_id = audit.item_id
  where audit.change_type = 'update'
    and audit.user_id is null
    and audit.old_values ->> 'status' = 'Done'
    and audit.new_values ->> 'status' = 'Error'
    and audit.old_values ->> 'completed_at' is not null
    and progress.status = 'Error'
    and progress.progress_percent = 0
    and progress.completed_at is null
    and progress.updated_at = audit.created_at
    and exists (
      select 1
      from workspace.issues as issues
      where issues.project_id = progress.project_id
        and issues.system_id = progress.system_id
        and issues.station_id = progress.station_id
        and issues.test_item_id = progress.item_id
        and issues.status in ('open', 'in_progress')
    )
  order by audit.system_id, audit.station_id, audit.item_id, audit.created_at desc
)
update workspace.test_progress as progress
set
  status = changes.old_status,
  progress_percent = 100,
  started_at = changes.old_started_at,
  completed_at = changes.old_completed_at,
  actual_hours = changes.old_actual_hours,
  updated_at = pg_catalog.now()
from backfill_changes as changes
where progress.system_id = changes.system_id
  and progress.station_id = changes.station_id
  and progress.item_id = changes.item_id;

notify pgrst, 'reload schema';
