-- Run after the repair with a database-administrator connection; all writes roll back.
begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local time zone 'UTC';

do $probe$
declare
  report_day date := current_date;
  expected_completed integer;
  expected_target integer;
  expected_work_day boolean;
  other_dates_before text;
  other_dates_after text;
  first_result workspace.daily_production_stats%rowtype;
  second_result workspace.daily_production_stats%rowtype;
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'daily-production-stats' and database = current_database()
      and active and schedule = '0 23 * * *'
      and command ~* '^[[:space:]]*select[[:space:]]+workspace[.]calculate_daily_production_stats[(][)][;]?[[:space:]]*$'
  ) then
    raise exception 'Daily production cron must be active at 23:00 UTC and call the workspace function directly';
  end if;

  select count(*) into expected_completed
  from workspace.test_systems
  where status = 'Done' and updated_at::date = report_day;
  select coalesce((
    select (settings->>'daily_production_target')::integer
    from workspace.system_settings where category = 'work_time'
  ), 5) into expected_target;
  expected_work_day := extract(isodow from report_day) between 1 and 5;
  select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.date, s.id)::text, '[]'))
    into other_dates_before
  from workspace.daily_production_stats s where s.date <> report_day;

  perform workspace.calculate_daily_production_stats();
  select * into strict first_result
  from workspace.daily_production_stats where date = report_day;
  if first_result.completed_systems is distinct from expected_completed
    or first_result.target_systems is distinct from expected_target
    or first_result.work_day is distinct from expected_work_day then
    raise exception 'Daily production values differ from the source systems, work-time setting or weekday';
  end if;

  perform workspace.calculate_daily_production_stats();
  select * into strict second_result
  from workspace.daily_production_stats where date = report_day;
  if second_result.id is distinct from first_result.id
    or (select count(*) from workspace.daily_production_stats where date = report_day) <> 1
    or second_result.completed_systems is distinct from expected_completed
    or second_result.target_systems is distinct from expected_target
    or second_result.work_day is distinct from expected_work_day then
    raise exception 'Repeated execution duplicated or changed the daily result';
  end if;

  select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.date, s.id)::text, '[]'))
    into other_dates_after
  from workspace.daily_production_stats s where s.date <> report_day;
  if other_dates_after is distinct from other_dates_before then
    raise exception 'Daily production calculation changed another date';
  end if;
  raise notice 'Daily production rollback probe passed: direct cron, source values, repeated upsert and unchanged history';
end;
$probe$;
rollback;
