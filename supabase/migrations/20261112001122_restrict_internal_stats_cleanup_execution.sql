-- PREPARED ONLY. This standalone proposal has NOT been applied to production.
-- No function invocation, function replacement, row mutation, credential or cron change.
-- Execute only after the release gate in this folder's README has been satisfied.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
do $guard$
declare target record; actual record;
begin
  if current_user <> 'postgres' then
    raise exception 'Apply only as the captured postgres grantor';
  end if;
  for target in select * from (values
      ('public.calculate_daily_production_stats()', 'a95e0a8fd3737e3b52835e46dbdd350a'),
      ('public.cleanup_old_notifications()', 'df7214c3ccd0b0229fa19a2aa55fa62e'),
      ('workspace.calculate_daily_production_stats()', '07a141e0be283a94321b7640ebe775ad'),
      ('workspace.cleanup_old_notifications()', '123d89f4dd2216d607863e0d8ba193ee')
  ) as expected(signature, definition_md5)
  loop
    select p.proowner::regrole::text as owner, p.proacl, p.prosecdef,
           md5(pg_get_functiondef(p.oid)) as definition_md5,
           has_function_privilege('service_role', p.oid, 'execute') as service_execute
      into actual from pg_proc p where p.oid = to_regprocedure(target.signature);
    if not found then raise exception 'Missing function: %', target.signature; end if;
    if actual.owner <> 'postgres' or not actual.prosecdef
       or actual.definition_md5 <> target.definition_md5 or not actual.service_execute
       or actual.proacl is null
       or not (actual.proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]
               and '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] @> actual.proacl) then
      raise exception 'Metadata drift: %; stop and recapture before changing anything', target.signature;
    end if;
  end loop;
end;
$guard$;

revoke execute on function public.calculate_daily_production_stats(),
  public.cleanup_old_notifications(),
  workspace.calculate_daily_production_stats(),
  workspace.cleanup_old_notifications()
from public, anon, authenticated;

-- Keep existing postgres ownership and explicit service_role EXECUTE untouched.
do $guard$
declare target record; actual record;
begin
  if current_user <> 'postgres' then
    raise exception 'Apply only as the captured postgres grantor';
  end if;
  for target in select * from (values
      ('public.calculate_daily_production_stats()', 'a95e0a8fd3737e3b52835e46dbdd350a'),
      ('public.cleanup_old_notifications()', 'df7214c3ccd0b0229fa19a2aa55fa62e'),
      ('workspace.calculate_daily_production_stats()', '07a141e0be283a94321b7640ebe775ad'),
      ('workspace.cleanup_old_notifications()', '123d89f4dd2216d607863e0d8ba193ee')
  ) as expected(signature, definition_md5)
  loop
    select p.proowner::regrole::text as owner, p.proacl, p.prosecdef,
           md5(pg_get_functiondef(p.oid)) as definition_md5,
           has_function_privilege('service_role', p.oid, 'execute') as service_execute
      into actual from pg_proc p where p.oid = to_regprocedure(target.signature);
    if not found then raise exception 'Missing function: %', target.signature; end if;
    if actual.owner <> 'postgres' or not actual.prosecdef
       or actual.definition_md5 <> target.definition_md5 or not actual.service_execute
       or actual.proacl is null
       or not (actual.proacl @> '{postgres=X/postgres,service_role=X/postgres}'::aclitem[]
               and '{postgres=X/postgres,service_role=X/postgres}'::aclitem[] @> actual.proacl) then
      raise exception 'Metadata drift: %; stop and recapture before changing anything', target.signature;
    end if;
  end loop;
end;
$guard$;
notify pgrst, 'reload schema';
commit;
