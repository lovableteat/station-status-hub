-- Keep persisted progress non-destructive while enforcing the completion rule at
-- the table boundary. The issue-side lock serializes concurrent issue creation
-- with guarded completion writes without changing progress data.

create or replace function workspace.lock_issue_test_progress_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null
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
  end if;

  return new;
end;
$$;

drop trigger if exists lock_issue_test_progress_link on workspace.issues;
create trigger lock_issue_test_progress_link
before insert or update of status, project_id, system_id, station_id, test_item_id
on workspace.issues
for each row
execute function workspace.lock_issue_test_progress_link();

create or replace function workspace.guard_test_progress_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_guard boolean;
begin
  should_guard := new.status = 'Done';
  if should_guard and tg_op = 'UPDATE' then
    should_guard := old.status is distinct from new.status;
  end if;

  if should_guard then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.project_id::pg_catalog.text || ':' ||
        new.system_id::pg_catalog.text || ':' ||
        new.station_id::pg_catalog.text || ':' ||
        new.item_id::pg_catalog.text,
        0
      )
    );

    if exists (
      select 1
      from workspace.issues as issues
      where issues.project_id = new.project_id
        and issues.system_id = new.system_id
        and issues.station_id = new.station_id
        and issues.test_item_id = new.item_id
        and issues.status in ('open', 'in_progress')
    ) then
      raise exception using
        errcode = 'P0001',
        message = '尚有問題未被解決';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_test_progress_completion on workspace.test_progress;
create trigger guard_test_progress_completion
before insert or update of status
on workspace.test_progress
for each row
execute function workspace.guard_test_progress_completion();

revoke all on function workspace.lock_issue_test_progress_link() from public;
revoke all on function workspace.lock_issue_test_progress_link() from anon, authenticated, service_role;
revoke all on function workspace.guard_test_progress_completion() from public;
revoke all on function workspace.guard_test_progress_completion() from anon, authenticated, service_role;

-- Limit the summary and its start-time fallback to the system's current flow.
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
    select stations.id, stations.station_name, stations.station_order
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
    current_station = coalesce(summary.first_incomplete_station, summary.final_station, systems.current_station),
    status = case
      when summary.station_count > 0 and summary.completed_stations = summary.station_count then 'Done'
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
            join workspace.test_flow_items as items
              on progress.item_id = items.id
              and items.project_id = system_project_id
              and items.flow_version_id is not distinct from system_flow_version_id
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

notify pgrst, 'reload schema';
