-- Bring issues that predate the closed-loop trigger into the same state as
-- newly created unresolved issues. This statement is idempotent.

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
select distinct
  issues.project_id,
  issues.system_id,
  issues.station_id,
  issues.test_item_id,
  'Error',
  0,
  null::pg_catalog.timestamptz,
  pg_catalog.now()
from workspace.issues as issues
where issues.status in ('open', 'in_progress')
  and issues.project_id is not null
  and issues.system_id is not null
  and issues.station_id is not null
  and issues.test_item_id is not null
on conflict (system_id, station_id, item_id) do update
set project_id = excluded.project_id,
    status = 'Error',
    progress_percent = 0,
    completed_at = null,
    updated_at = pg_catalog.now();

notify pgrst, 'reload schema';
