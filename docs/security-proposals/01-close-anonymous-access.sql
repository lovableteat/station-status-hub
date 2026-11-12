-- PREPARED ONLY. This is deliberately outside supabase/migrations.
-- Do not run while the owner is working. Follow the staged rollout checklist.
-- Metadata-only: no application rows, audit history, files or passwords are changed.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '20s';

-- Already applied by 20261112001122_restrict_internal_stats_cleanup_execution.
-- Read metadata only: never invoke, redefine or repair these internal RPCs here.
-- Drift requires separate review, not an implicit grant/revoke in this proposal.
do $internal_rpc_preflight$
declare
  signature text;
  target oid;
begin
  foreach signature in array array[
    'public.calculate_daily_production_stats()',
    'workspace.calculate_daily_production_stats()',
    'public.cleanup_old_notifications()',
    'workspace.cleanup_old_notifications()'
  ] loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'Applied internal RPC baseline missing: %', signature;
    end if;
    if has_function_privilege('anon', target, 'execute')
      or has_function_privilege('authenticated', target, 'execute')
      or exists (
        select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where p.oid = target and permission.grantee = 0
          and permission.privilege_type = 'EXECUTE'
      ) then
      raise exception 'Applied internal RPC baseline drift: browser EXECUTE: %', signature;
    end if;
    if not has_function_privilege('service_role', target, 'execute')
      or not has_function_privilege('postgres', target, 'execute')
      or not (select has_schema_privilege('service_role', p.pronamespace, 'usage')
        and has_schema_privilege('postgres', p.pronamespace, 'usage')
        from pg_proc p where p.oid = target) then
      raise exception 'Applied internal RPC baseline drift: maintenance access missing: %', signature;
    end if;
  end loop;
end;
$internal_rpc_preflight$;

-- Already applied by 20261112013540_restrict_anonymous_delete_test_system_execution.
-- The anonymous ACL closure is a prerequisite, not a repair in either proposal.
-- Read metadata only. Authenticated per-user authorization still requires stage 02.
do $delete_rpc_preflight$
declare
  signature text;
  target oid;
begin
  foreach signature in array array[
    'public.delete_test_system(uuid)',
    'workspace.delete_test_system(uuid)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'Applied delete RPC baseline missing: %', signature;
    end if;
    if not exists (
      select 1 from pg_proc p where p.oid = target
        and p.proowner = 'postgres'::regrole and p.prosecdef
    ) then
      raise exception 'Applied delete RPC baseline drift: owner or SECURITY DEFINER: %', signature;
    end if;
    if has_function_privilege('anon', target, 'execute')
      or exists (
        select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where p.oid = target and permission.grantee = 0
          and permission.privilege_type = 'EXECUTE'
      ) then
      raise exception 'Applied delete RPC baseline drift: anonymous EXECUTE: %', signature;
    end if;
    if not has_function_privilege('authenticated', target, 'execute')
      or not has_function_privilege('service_role', target, 'execute')
      or not has_function_privilege('postgres', target, 'execute')
      or not (select has_schema_privilege('authenticated', p.pronamespace, 'usage')
        and has_schema_privilege('service_role', p.pronamespace, 'usage')
        and has_schema_privilege('postgres', p.pronamespace, 'usage')
        from pg_proc p where p.oid = target) then
      raise exception 'Applied delete RPC baseline drift: existing caller access missing: %', signature;
    end if;
  end loop;
end;
$delete_rpc_preflight$;

-- Fail closed on dependency/configuration drift before changing any grants.
do $preflight$
declare target record;
begin
  if to_regprocedure('workspace.current_system_user_id()') is null
    or to_regprocedure('workspace.can_manage_system_users()') is null then
    raise exception 'Security proposal prerequisite missing: approved identity helpers';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workspace' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ) then
    raise exception 'Security proposal prerequisite drift: workspace table without RLS';
  end if;
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    where p.oid in (to_regprocedure('workspace.current_system_user_id()'), to_regprocedure('workspace.can_manage_system_users()'))
      and not pg_has_role('authenticated', p.proowner, 'usage')
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where permission.privilege_type = 'EXECUTE'
          and case when permission.grantee in (0, (select oid from pg_roles where rolname = 'anon')) then false
            else pg_has_role('authenticated', permission.grantee, 'usage') end
      )
  loop
    raise exception 'Security proposal prerequisite drift: required helper lacks authenticated EXECUTE: %', target.signature;
  end loop;
  -- Removing PUBLIC must not accidentally remove a legitimate browser RPC's
  -- only effective EXECUTE grant. Trigger-only routines are not browser APIs.
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('workspace', 'public') and p.prokind = 'f'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not pg_has_role('authenticated', p.proowner, 'usage')
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where permission.privilege_type = 'EXECUTE'
          and case when permission.grantee in (0, (select oid from pg_roles where rolname = 'anon')) then false
            else pg_has_role('authenticated', permission.grantee, 'usage') end
      )
      and not (
        (p.proname = 'authenticate_user' and pg_get_function_identity_arguments(p.oid) = 'username_input text, password_input text')
        or (p.proname = 'register_system_user' and pg_get_function_identity_arguments(p.oid) = 'username_input text, password_input text, display_name_input text')
        or (n.nspname = 'public' and p.proname = 'database_healthcheck' and p.pronargs = 0)
      )
  loop
    raise exception 'Security proposal prerequisite drift: authenticated RPC depends only on PUBLIC: %', target.signature;
  end loop;
end;
$preflight$;

-- Reviewed creator/schema-specific anon defaults otherwise reopen future tables
-- and sequences. This does NOT change PostgreSQL's global PUBLIC EXECUTE default:
-- every future function migration still needs an explicit REVOKE/GRANT in the
-- same transaction. Do not apply a global default change to unrelated schemas.
alter default privileges for role postgres in schema workspace, public
  revoke all privileges on tables from public, anon;
alter default privileges for role postgres in schema workspace, public
  revoke all privileges on sequences from public, anon;
alter default privileges for role postgres in schema workspace, public
  revoke all privileges on functions from anon;

-- Both exposed schemas must be covered. Preserve all explicit authenticated
-- grants and all existing RLS predicates; this phase closes the anonymous path.
revoke all privileges on all tables in schema workspace, public from public, anon;
revoke all privileges on all sequences in schema workspace, public from public, anon;
-- Browser roles need row operations, never TRUNCATE (which bypasses RLS).
revoke truncate, references, trigger on all tables in schema workspace, public
  from authenticated;

-- Table-level REVOKE does not remove per-column grants.
do $block$
declare target record;
begin
  for target in
    select n.nspname, c.relname, a.attname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('workspace', 'public')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and a.attnum > 0 and not a.attisdropped and a.attacl is not null
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table %2$I.%3$I from public, anon',
      target.attname, target.nspname, target.relname
    );
  end loop;
end;
$block$;

-- Explicit authenticated grants are intentionally not removed. These existing
-- public policies become signed-in policies without weakening their predicates.
do $block$
declare target record;
begin
  for target in select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'workspace'
      and roles = array['public']::name[]
  loop
    execute format('alter policy %I on %I.%I to authenticated',
      target.policyname, target.schemaname, target.tablename);
  end loop;
end;
$block$;

-- Supabase Auth alone is not an approved application account. Anonymous Auth
-- sign-ins and unrelated, disabled or revoked accounts must not inherit legacy
-- USING(true) policies. Service-role/owner maintenance keeps its existing bypass.
do $block$
declare target record;
begin
  for target in select tablename from pg_tables where schemaname = 'workspace'
  loop
    execute format(
      'create policy security_active_account_guard on workspace.%I as restrictive for all to authenticated using ((select workspace.current_system_user_id()) is not null) with check ((select workspace.current_system_user_id()) is not null)',
      target.tablename
    );
  end loop;
end;
$block$;

-- Most old RPCs inherited EXECUTE from PUBLIC. Leave only intentionally public
-- login, pending registration and constant-only health-check endpoints.
do $block$
declare target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('workspace', 'public') and p.prokind = 'f'
      -- Preserve the already-applied internal and delete RPC ACLs exactly.
      and p.oid not in (
        'public.calculate_daily_production_stats()'::regprocedure,
        'workspace.calculate_daily_production_stats()'::regprocedure,
        'public.cleanup_old_notifications()'::regprocedure,
        'workspace.cleanup_old_notifications()'::regprocedure,
        'public.delete_test_system(uuid)'::regprocedure,
        'workspace.delete_test_system(uuid)'::regprocedure
      )
      and not (
        (p.proname = 'authenticate_user' and pg_get_function_identity_arguments(p.oid) = 'username_input text, password_input text')
        or (p.proname = 'register_system_user' and pg_get_function_identity_arguments(p.oid) = 'username_input text, password_input text, display_name_input text')
        or (n.nspname = 'public' and p.proname = 'database_healthcheck' and p.pronargs = 0)
      )
  loop
    execute format('revoke execute on function %s from public, anon', target.signature);
  end loop;
end;
$block$;

-- Legacy credentials are not a browser-readable directory.
revoke all privileges on table workspace.users from authenticated;
-- Login audit writes are performed by the credential-verifying definer RPC.
-- Keep records intact; client code cannot forge or remove audit events.
revoke insert, update, delete, truncate, references, trigger
  on workspace.login_audit from authenticated;

-- Role editing and audit visibility have explicit server-derived identities.
create policy security_guard_user_roles on workspace.user_roles
as restrictive for all to authenticated
using ((select workspace.can_manage_system_users()))
with check ((select workspace.can_manage_system_users()));

create policy security_guard_login_audit on workspace.login_audit
as restrictive for select to authenticated
using (user_id = (select workspace.current_system_user_id())
  or (select workspace.can_manage_system_users()));

notify pgrst, 'reload schema';
commit;
