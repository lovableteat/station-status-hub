-- Read-only check of the already-applied additive APIs and six immutable ledgers.
-- Not a migration: never submit to apply_migration or use to bypass later gates.
-- Does not read account/PCB content, call either API, or assume raw access closed.
BEGIN READ ONLY;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='10s';
DO $applied_legacy_pcb_ledger$
DECLARE expected record;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'Applied legacy PCB ledger missing';
 END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('20261112001122','restrict_internal_stats_cleanup_execution',3793,'80133f087d07ad6c7766cb8a67f7a9d3'),
  ('20261112013540','restrict_anonymous_delete_test_system_execution',3036,'b8a346e30aaa288e5c053addb576ef3f'),
  ('20261112022029','restrict_anonymous_login_audit_access',4521,'d1340d27f2186395010ffe6f9ba0de58'),
  ('20261112064452','add_protected_profile_and_legacy_pcb_read_apis',42759,'ad9bd1f1d425fed402deee5074f08d8d'),
  ('20261112073038','restrict_anonymous_test_progress_audit_access',12157,'d6874d1241faf8c1b9f0cbf7eed21fab'),
  ('20261112073518','restrict_anonymous_tasks_access',6089,'013553eadb40f0acbf3676dd2908717e')
 ) AS x(version,name,statement_bytes,statement_md5) LOOP
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations m
   WHERE m.version=expected.version AND m.name=expected.name
    AND cardinality(m.statements)=1
    AND octet_length(m.statements[1])=expected.statement_bytes
    AND md5(m.statements[1])=expected.statement_md5)<>1 THEN
   RAISE EXCEPTION 'Applied legacy PCB ledger mismatch: %',expected.version;
  END IF;
 END LOOP;
END;
$applied_legacy_pcb_ledger$;
DO $legacy_api_postflight$
DECLARE target oid; expected record;
BEGIN
 -- Only these exact workspace zero-argument identities may have the API names.
 -- Reject overloads/aliases even when their source does not mention the table.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','workspace')
   AND p.proname IN ('list_system_user_profiles','load_pcb_designer_legacy_workspace')
   AND p.oid NOT IN (coalesce(to_regprocedure('workspace.list_system_user_profiles()'),0::oid),
    coalesce(to_regprocedure('workspace.load_pcb_designer_legacy_workspace()'),0::oid))) THEN
  RAISE EXCEPTION 'Legacy PCB API drift: unexpected name or overload collision';
 END IF;
 FOR expected IN SELECT * FROM jsonb_to_recordset('[{"name":"list_system_user_profiles","body_md5":"fdfdf63dda67901eabef3676ea0cc02c"},{"name":"load_pcb_designer_legacy_workspace","body_md5":"5a2bdec176bd154e5d99bf20ce7b2091"}]'::jsonb) AS x(name text,body_md5 text) LOOP
  target:=to_regprocedure('workspace.'||expected.name||'()');
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=target AND p.proowner='postgres'::regrole
   AND p.prokind='f' AND p.pronargs=0 AND pg_get_function_identity_arguments(p.oid)=''
   AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""']::text[] AND md5(p.prosrc)=expected.body_md5
   AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[])
   OR has_function_privilege('anon',target,'execute') OR has_function_privilege('service_role',target,'execute') THEN
   RAISE EXCEPTION 'Legacy PCB API drift: %',expected.name;
  END IF;
 END LOOP;
END;
$legacy_api_postflight$;
-- Ledger presence is not proof of retained effective authorization boundaries.
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
end;
$login_audit_preflight$;

-- Retained effective boundary, not proof that later release gates passed.
DO $applied_anonymous_table_boundary$
DECLARE target regclass; role_name text; privilege text;
BEGIN
 FOREACH target IN ARRAY ARRAY['workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=target AND relkind='r'
   AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN
   RAISE EXCEPTION 'Applied anonymous table owner/RLS drift: %',target;
  END IF;
  IF has_table_privilege('anon',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege('anon',target,'SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION 'Applied anonymous table boundary reopened: %',target;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['authenticated','service_role','postgres'] LOOP
   IF NOT has_schema_privilege(role_name,'workspace','USAGE') THEN
    RAISE EXCEPTION 'Applied anonymous table caller schema access lost: %',role_name;
   END IF;
   FOREACH privilege IN ARRAY CASE WHEN role_name='authenticated'
    THEN ARRAY['SELECT','INSERT','UPDATE','DELETE','MAINTAIN']
    ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] END LOOP
    IF NOT has_table_privilege(role_name,target,privilege) THEN
     RAISE EXCEPTION 'Applied anonymous table retained privilege lost: % % %',target,role_name,privilege;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END;
$applied_anonymous_table_boundary$;
SELECT 'applied_six_ledger_baseline_verified' AS status;
COMMIT;
