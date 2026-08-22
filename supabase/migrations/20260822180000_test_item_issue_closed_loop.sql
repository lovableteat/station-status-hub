-- Keep linked test progress in an error state while an issue is unresolved,
-- and serialize issue changes with guarded progress status writes.

create index if not exists idx_issues_test_item_closed_loop
  on workspace.issues(project_id, system_id, station_id, test_item_id, status);

create or replace function workspace.sync_unresolved_issue_to_test_progress()
returns trigger
language plpgsql
security invoker
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
        updated_at = pg_catalog.now();
  elsif tg_op = 'UPDATE'
    and new.status in ('resolved', 'closed')
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

    if not exists (
      select 1
      from workspace.issues as issues
      where issues.project_id = new.project_id
        and issues.system_id = new.system_id
        and issues.station_id = new.station_id
        and issues.test_item_id = new.test_item_id
        and issues.status in ('open', 'in_progress')
    ) then
      update workspace.test_progress as progress
      set status = 'On-going',
          updated_at = pg_catalog.now()
      where progress.project_id = new.project_id
        and progress.system_id = new.system_id
        and progress.station_id = new.station_id
        and progress.item_id = new.test_item_id
        and progress.status = 'Error';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_unresolved_issue_to_test_progress on workspace.issues;
create trigger sync_unresolved_issue_to_test_progress
after insert or update of status, project_id, system_id, station_id, test_item_id
on workspace.issues
for each row
execute function workspace.sync_unresolved_issue_to_test_progress();

drop function if exists workspace.set_test_progress_status(uuid, uuid, uuid, uuid, text);

create or replace function workspace.set_test_progress_status(
  p_project_id uuid,
  p_system_id uuid,
  p_station_id uuid,
  p_test_item_id uuid,
  p_status text,
  p_updates jsonb default '{}'::jsonb
)
returns workspace.test_progress
language plpgsql
security invoker
set search_path = ''
as $$
declare
  progress_row workspace.test_progress;
  payload_notes pg_catalog.text;
  payload_progress_percent pg_catalog.int4;
  payload_started_at pg_catalog.timestamptz;
  payload_completed_at pg_catalog.timestamptz;
  payload_actual_hours pg_catalog.numeric;
  payload_assigned_to pg_catalog.text;
begin
  if p_project_id is null
    or p_system_id is null
    or p_station_id is null
    or p_test_item_id is null
    or p_status is null
  then
    raise exception using
      errcode = '22004',
      message = 'Progress link identifiers and status are required';
  end if;

  if p_updates is null then
    p_updates := '{}'::jsonb;
  end if;

  if pg_catalog.jsonb_typeof(p_updates) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'p_updates must be a JSON object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_project_id::pg_catalog.text || ':' ||
      p_system_id::pg_catalog.text || ':' ||
      p_station_id::pg_catalog.text || ':' ||
      p_test_item_id::pg_catalog.text,
      0
    )
  );

  if p_status = 'Done' and exists (
    select 1
    from workspace.issues as issues
    where issues.project_id = p_project_id
      and issues.system_id = p_system_id
      and issues.station_id = p_station_id
      and issues.test_item_id = p_test_item_id
      and issues.status in ('open', 'in_progress')
  ) then
    raise exception using
      errcode = 'P0001',
      message = '尚有問題未被解決';
  end if;

  if p_updates ? 'notes' then
    payload_notes := p_updates ->> 'notes';
  end if;

  if p_updates ? 'progress_percent'
    and p_updates ->> 'progress_percent' is not null
    and p_updates ->> 'progress_percent' <> ''
  then
    payload_progress_percent := (p_updates ->> 'progress_percent')::pg_catalog.int4;
  end if;

  if p_updates ? 'started_at'
    and p_updates ->> 'started_at' is not null
    and p_updates ->> 'started_at' <> ''
  then
    payload_started_at := (p_updates ->> 'started_at')::pg_catalog.timestamptz;
  end if;

  if p_updates ? 'completed_at'
    and p_updates ->> 'completed_at' is not null
    and p_updates ->> 'completed_at' <> ''
  then
    payload_completed_at := (p_updates ->> 'completed_at')::pg_catalog.timestamptz;
  end if;

  if p_updates ? 'actual_hours'
    and p_updates ->> 'actual_hours' is not null
    and p_updates ->> 'actual_hours' <> ''
  then
    payload_actual_hours := (p_updates ->> 'actual_hours')::pg_catalog.numeric;
  end if;

  if p_updates ? 'assigned_to' then
    payload_assigned_to := p_updates ->> 'assigned_to';
  end if;

  insert into workspace.test_progress as progress (
    project_id,
    system_id,
    station_id,
    item_id,
    status,
    notes,
    progress_percent,
    started_at,
    completed_at,
    actual_hours,
    assigned_to,
    updated_at
  )
  values (
    p_project_id,
    p_system_id,
    p_station_id,
    p_test_item_id,
    p_status,
    case when p_updates ? 'notes' then payload_notes else null end,
    case
      when p_status = 'Done' then 100
      when p_updates ? 'progress_percent' then payload_progress_percent
      else 0
    end,
    case when p_updates ? 'started_at' then payload_started_at else null end,
    case
      when p_status = 'Done' and payload_completed_at is not null
        then payload_completed_at
      when p_status = 'Done' then pg_catalog.now()
      when p_updates ? 'completed_at' then payload_completed_at
      else null
    end,
    case when p_updates ? 'actual_hours' then payload_actual_hours else null end,
    case when p_updates ? 'assigned_to' then payload_assigned_to else null end,
    pg_catalog.now()
  )
  on conflict (system_id, station_id, item_id) do update
  set project_id = excluded.project_id,
      status = excluded.status,
      notes = case
        when p_updates ? 'notes' then payload_notes
        else progress.notes
      end,
      progress_percent = case
        when excluded.status = 'Done' then 100
        when p_updates ? 'progress_percent' then payload_progress_percent
        else progress.progress_percent
      end,
      started_at = case
        when p_updates ? 'started_at' then payload_started_at
        else progress.started_at
      end,
      completed_at = case
        when excluded.status = 'Done' and payload_completed_at is not null
          then payload_completed_at
        when excluded.status = 'Done' and progress.completed_at is not null
          then progress.completed_at
        when excluded.status = 'Done' then pg_catalog.now()
        when p_updates ? 'completed_at' then payload_completed_at
        else progress.completed_at
      end,
      actual_hours = case
        when p_updates ? 'actual_hours' then payload_actual_hours
        else progress.actual_hours
      end,
      assigned_to = case
        when p_updates ? 'assigned_to' then payload_assigned_to
        else progress.assigned_to
      end,
      updated_at = pg_catalog.now()
  returning progress.* into progress_row;

  return progress_row;
end;
$$;

revoke all on function workspace.sync_unresolved_issue_to_test_progress() from public;
revoke all on function workspace.sync_unresolved_issue_to_test_progress()
  from anon, authenticated, service_role;

revoke all on function workspace.set_test_progress_status(uuid, uuid, uuid, uuid, text, jsonb)
  from public;
revoke all on function workspace.set_test_progress_status(uuid, uuid, uuid, uuid, text, jsonb)
  from anon, authenticated, service_role;
grant execute on function workspace.set_test_progress_status(uuid, uuid, uuid, uuid, text, jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';
