begin;

-- These legacy public views must use the caller's existing table/RLS boundary.
-- Preserve their definitions and authenticated grants; do not copy notification
-- predicates into a second authorization implementation.
alter view public.active_notifications set (security_invoker = true);
alter view public.issue_details set (security_invoker = true);

revoke all privileges on table public.active_notifications, public.issue_details
  from public, anon;

-- The issue view's backing tables are also directly exposed through PostgREST.
-- Preserve the existing signed-in CRUD contract and service-role maintenance.
revoke all privileges on table workspace.issues, workspace.test_systems,
  workspace.test_flow_stations, workspace.test_flow_items from public, anon;

alter policy "Allow anonymous access to issues" on workspace.issues
  to authenticated;
alter policy "Allow anonymous access to test_systems" on workspace.test_systems
  to authenticated;
alter policy "Allow anonymous access to test_flow_stations" on workspace.test_flow_stations
  to authenticated;
alter policy "Allow anonymous access to test_flow_items" on workspace.test_flow_items
  to authenticated;

-- The scheduled keep-alive now uses the constant-only RPC below. No browser
-- role needs the historical table. Keep its contents and service-role grants.
alter table workspace.keep_alive_check enable row level security;
revoke all privileges on table workspace.keep_alive_check
  from public, anon, authenticated;

-- Table-level REVOKE does not remove column grants. Close any legacy column
-- grants as well, without changing authenticated access to application data.
do $migration$
declare
  target record;
begin
  for target in
    select n.nspname, c.relname, a.attname,
      case when n.nspname = 'workspace' and c.relname = 'keep_alive_check'
        then 'public, anon, authenticated' else 'public, anon' end as denied_roles
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where a.attnum > 0 and not a.attisdropped and a.attacl is not null
      and ((n.nspname = 'public' and c.relname in ('active_notifications', 'issue_details'))
        or (n.nspname = 'workspace' and c.relname in (
          'issues', 'test_systems', 'test_flow_stations', 'test_flow_items', 'keep_alive_check')))
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table %2$I.%3$I from %4$s',
      target.attname, target.nspname, target.relname, target.denied_roles
    );
  end loop;
end;
$migration$;

-- A safe database round trip for the existing scheduled anon-key health check.
-- No table reads, writes, SECURITY DEFINER privileges, or new credentials.
create or replace function public.database_healthcheck()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select true;
$function$;
revoke all privileges on function public.database_healthcheck() from public;
grant execute on function public.database_healthcheck() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
