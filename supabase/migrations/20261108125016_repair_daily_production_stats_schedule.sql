begin;
set local lock_timeout = '5s';

-- Preserve the existing global, server-date calculation and RPC signature.
create or replace function workspace.calculate_daily_production_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stats_date date := current_date;
  completed_count integer;
  target_count integer;
begin
  select count(*) into completed_count
  from workspace.test_systems ts
  where ts.status = 'Done' and date(ts.updated_at) = stats_date;

  select coalesce((
    select (settings->>'daily_production_target')::integer
    from workspace.system_settings where category = 'work_time'
  ), 5) into target_count;

  insert into workspace.daily_production_stats (date, completed_systems, target_systems, work_day)
  values (stats_date, completed_count, target_count, extract(dow from stats_date) between 1 and 5)
  on conflict (date) do update set
    completed_systems = excluded.completed_systems,
    target_systems = excluded.target_systems,
    work_day = excluded.work_day,
    updated_at = now();
end;
$$;

-- 23:00 GMT is 07:00 Asia/Taipei. Keep the job identity, schedule and active state.
-- The Edge Function only called this RPC; no HTTP extension, URL or key is needed.
do $$
declare
  stats_job_id bigint;
begin
  select jobid into strict stats_job_id from cron.job
  where jobname = 'daily-production-stats' and database = current_database();
  perform cron.alter_job(stats_job_id, command := 'SELECT workspace.calculate_daily_production_stats();');
end;
$$;

commit;
