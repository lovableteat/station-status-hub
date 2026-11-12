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

-- Already applied by 20261112022029_restrict_anonymous_login_audit_access.
-- Anonymous table/column/PUBLIC/inherited access must already be closed. This
-- stage narrows authenticated audit access; it must never silently redo the
-- applied anonymous fix. Snapshot metadata only, not audit rows or credentials.
do $login_audit_preflight$
declare
  target oid := to_regclass('workspace.login_audit');
  signature text;
  role_name text;
begin
  if target is null then
    raise exception 'Applied login audit baseline missing: workspace.login_audit';
  end if;
  if not exists (select 1 from pg_class where oid = target and relkind = 'r'
    and relowner = 'postgres'::regrole and relrowsecurity and not relforcerowsecurity) then
    raise exception 'Applied login audit baseline drift: owner or RLS';
  end if;
  if has_table_privilege('anon', target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege('anon', target, 'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'Applied login audit baseline drift: anonymous table or column access';
  end if;
  -- Signed-in SELECT remains; the pending proposal intentionally removes writes.
  -- Do not require authenticated to retain the old full table ACL after stage 01.
  if not has_table_privilege('authenticated', target, 'SELECT')
    or not has_schema_privilege('authenticated', 'workspace', 'USAGE') then
    raise exception 'Applied login audit baseline drift: authenticated read access missing';
  end if;
  foreach role_name in array array['service_role', 'postgres'] loop
    if not has_schema_privilege(role_name, 'workspace', 'USAGE') or exists (
      select 1 from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) privilege
      where not has_table_privilege(role_name, target, privilege)
    ) then
      raise exception 'Applied login audit baseline drift: maintenance access missing';
    end if;
  end loop;
  foreach signature in array array[
    'public.authenticate_user(text,text)', 'workspace.authenticate_user(text,text)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Applied login audit baseline missing: %', signature;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(signature)
      and proowner = 'postgres'::regrole and prosecdef) then
      raise exception 'Applied login audit baseline drift: login owner or SECURITY DEFINER';
    end if;
    foreach role_name in array array['anon', 'authenticated', 'service_role', 'postgres'] loop
      if not has_function_privilege(role_name, signature, 'EXECUTE')
        or not (select has_schema_privilege(role_name, pronamespace, 'USAGE')
          from pg_proc where oid = to_regprocedure(signature)) then
        raise exception 'Applied login audit baseline drift: login caller access missing';
      end if;
    end loop;
  end loop;
  create temporary table security_proposal_login_audit_baseline on commit drop as
  select
    (select jsonb_agg(jsonb_build_object('signature', p.oid::regprocedure::text,
      'owner', p.proowner, 'definer', p.prosecdef, 'acl', p.proacl,
      'definition', pg_get_functiondef(p.oid)) order by p.oid)
      from pg_proc p where p.oid in ('public.authenticate_user(text,text)'::regprocedure,
        'workspace.authenticate_user(text,text)'::regprocedure)) as login,
    -- Preserve non-browser grants and authenticated SELECT/MAINTAIN exactly,
    -- including grantor/grant options. Only browser write ACLs narrow here;
    -- anonymous/PUBLIC must stay absent.
    (select coalesce(jsonb_agg(to_jsonb(permission) order by permission.grantor,
      permission.grantee, permission.privilege_type), '[]'::jsonb)
      from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) permission
      where c.oid = target and (permission.grantee not in
        (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
        or (permission.grantee = 'authenticated'::regrole
          and permission.privilege_type in ('SELECT', 'MAINTAIN')))) as retained_acl,
    (select coalesce(jsonb_agg(jsonb_build_object('column', a.attname, 'permission', to_jsonb(permission))
      order by a.attnum, permission.grantor, permission.grantee, permission.privilege_type), '[]'::jsonb)
      from pg_attribute a, lateral aclexplode(a.attacl) permission
      where a.attrelid = target and a.attnum > 0 and not a.attisdropped
        and (permission.grantee <> 'authenticated'::regrole or permission.privilege_type = 'SELECT')) as retained_column_acl,
    (select coalesce(jsonb_agg(jsonb_build_object('name', polname,
      'command', polcmd, 'permissive', polpermissive,
      'roles', case when polroles = array[0]::oid[] then array['authenticated'::regrole::oid] else polroles end,
      'using', pg_get_expr(polqual, polrelid), 'check', pg_get_expr(polwithcheck, polrelid)) order by polname), '[]'::jsonb)
      from pg_policy where polrelid = target) as expected_legacy_policies;
end;
$login_audit_preflight$;

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
-- Exclude the applied audit boundary, including from the column sweep below.
-- A newly reopened audit grant must fail postflight, not be silently repaired.
do $anonymous_table_grants$
declare target record;
begin
  for target in select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('workspace', 'public') and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and c.oid <> 'workspace.login_audit'::regclass
  loop
    execute format('revoke all privileges on table %I.%I from public, anon', target.nspname, target.relname);
  end loop;
end;
$anonymous_table_grants$;
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
      and c.oid <> 'workspace.login_audit'::regclass
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
-- MAINTAIN is unchanged by this reviewed proposal; it is not a row-write grant.
revoke insert, update, delete, truncate, references, trigger
  on workspace.login_audit from authenticated;
-- Column-level writes are independent of table ACLs. Do not remove SELECT or
-- alter grants belonging to service/owner/other roles.
do $audit_column_writes$
declare target record;
begin
  for target in select attname from pg_attribute
    where attrelid = 'workspace.login_audit'::regclass
      and attnum > 0 and not attisdropped and attacl is not null
  loop
    execute format('revoke insert (%1$I), update (%1$I), references (%1$I) on workspace.login_audit from authenticated', target.attname);
  end loop;
end;
$audit_column_writes$;

-- Role editing and audit visibility have explicit server-derived identities.
create policy security_guard_user_roles on workspace.user_roles
as restrictive for all to authenticated
using ((select workspace.can_manage_system_users()))
with check ((select workspace.can_manage_system_users()));

create policy security_guard_login_audit on workspace.login_audit
as restrictive for select to authenticated
using (user_id = (select workspace.current_system_user_id())
  or (select workspace.can_manage_system_users()));

-- Independent semantic checks reject drift even after preflight/capture. An
-- old rollback granting anonymous access cannot commit as part of this stage.
-- The permitted differences are authenticated write revocation, legacy PUBLIC
-- policy roles becoming authenticated, and the two reviewed restrictive guards.
do $login_audit_postflight$
declare
  target oid := to_regclass('workspace.login_audit');
  role_name text;
  signature text;
  actual jsonb;
  baseline record;
begin
  if target is null then
    raise exception 'Applied login audit postflight missing: workspace.login_audit';
  end if;
  if not exists (select 1 from pg_class where oid = target and relkind = 'r'
    and relowner = 'postgres'::regrole and relrowsecurity and not relforcerowsecurity) then
    raise exception 'Applied login audit postflight drift: owner or RLS';
  end if;
  if has_table_privilege('anon', target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege('anon', target, 'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'Applied login audit postflight drift: anonymous table or column access';
  end if;
  if not has_table_privilege('authenticated', target, 'SELECT')
    or not has_schema_privilege('authenticated', 'workspace', 'USAGE') then
    raise exception 'Applied login audit postflight drift: authenticated read access missing';
  end if;
  if has_table_privilege('authenticated', target, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege('authenticated', target, 'INSERT,UPDATE,REFERENCES') then
    raise exception 'Login audit postflight drift: authenticated write access remains';
  end if;
  foreach role_name in array array['service_role', 'postgres'] loop
    if not has_schema_privilege(role_name, 'workspace', 'USAGE') or exists (
      select 1 from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) privilege
      where not has_table_privilege(role_name, target, privilege)
    ) then
      raise exception 'Applied login audit postflight drift: maintenance access missing';
    end if;
  end loop;
  foreach signature in array array[
    'public.authenticate_user(text,text)', 'workspace.authenticate_user(text,text)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Applied login audit postflight missing: %', signature;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(signature)
      and proowner = 'postgres'::regrole and prosecdef) then
      raise exception 'Applied login audit postflight drift: login owner or SECURITY DEFINER';
    end if;
    foreach role_name in array array['anon', 'authenticated', 'service_role', 'postgres'] loop
      if not has_function_privilege(role_name, signature, 'EXECUTE')
        or not (select has_schema_privilege(role_name, pronamespace, 'USAGE')
          from pg_proc where oid = to_regprocedure(signature)) then
        raise exception 'Applied login audit postflight drift: login caller access missing';
      end if;
    end loop;
  end loop;
  select * into strict baseline from pg_temp.security_proposal_login_audit_baseline;
  select jsonb_agg(jsonb_build_object('signature', p.oid::regprocedure::text,
    'owner', p.proowner, 'definer', p.prosecdef, 'acl', p.proacl,
    'definition', pg_get_functiondef(p.oid)) order by p.oid) into actual
    from pg_proc p where p.oid in ('public.authenticate_user(text,text)'::regprocedure,
      'workspace.authenticate_user(text,text)'::regprocedure);
  if actual is distinct from baseline.login then
    raise exception 'Applied login audit baseline changed: login metadata or definition';
  end if;
  select coalesce(jsonb_agg(to_jsonb(permission) order by permission.grantor,
    permission.grantee, permission.privilege_type), '[]'::jsonb) into actual
    from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) permission
    where c.oid = target and (permission.grantee not in
      (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      or (permission.grantee = 'authenticated'::regrole
        and permission.privilege_type in ('SELECT', 'MAINTAIN')));
  if actual is distinct from baseline.retained_acl then
    raise exception 'Applied login audit baseline changed: retained table ACL';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('column', a.attname, 'permission', to_jsonb(permission))
    order by a.attnum, permission.grantor, permission.grantee, permission.privilege_type), '[]'::jsonb) into actual
    from pg_attribute a, lateral aclexplode(a.attacl) permission
    where a.attrelid = target and a.attnum > 0 and not a.attisdropped
      and (permission.grantee <> 'authenticated'::regrole or permission.privilege_type = 'SELECT');
  if actual is distinct from baseline.retained_column_acl then
    raise exception 'Applied login audit baseline changed: retained column ACL';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', polname,
    'command', polcmd, 'permissive', polpermissive, 'roles', polroles,
    'using', pg_get_expr(polqual, polrelid), 'check', pg_get_expr(polwithcheck, polrelid)) order by polname), '[]'::jsonb)
    into actual from pg_policy where polrelid = target
      and polname not in ('security_active_account_guard', 'security_guard_login_audit');
  if actual is distinct from baseline.expected_legacy_policies then
    raise exception 'Applied login audit baseline changed: legacy policy predicates';
  end if;
end;
$login_audit_postflight$;

notify pgrst, 'reload schema';
commit;
