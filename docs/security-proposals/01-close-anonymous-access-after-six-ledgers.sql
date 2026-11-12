-- PENDING v2: current six-ledger successor to 01-close-anonymous-access.sql.
-- Historical v1 SHA256: 590bb246a0e1ef0c4b6ed6bdbb1f2bdebfca1d52ddb93ac1ff32ec16e0f9cf31
-- Requires applied protected APIs, twelve guarded PCB RPCs and raw-column enforcement.
-- No source-data mutation or replay of an already-applied containment migration.
-- RUNNER-OWNED TRANSACTION REQUIRED: this payload has no BEGIN/COMMIT.
-- Keep payload and new ledger write in one transaction; rollback/close on error.
-- All client/Realtime/Storage/recovery gates still apply; this is not apply-ready.
set local lock_timeout = '1s';
set local statement_timeout = '20s';

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

DO $six_ledger_pcb_preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='79a9d13c088e503a9c8658222ca3d611' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='eacd1b11f642cfbe7a99148085610450' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='00cbfb987e1ebc1fd52f7c1b6c6f31c1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='d501033b71b49134522c5cd377cec0b9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='f6a0e6c6e0bf3a4db56702f86fce5eee' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='10ad95ff35662de30f23873ba2e5d7fe' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='715560809078e631886810264d68d704' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='6e9ced322200cce2e64f850ac3ab034b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='73946309b1a685c2f7c85e0d6f12e829' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='aa958078a56c205b4a3707afd0795a9b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='6d9168d17709b75c19c69b4475899a2c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='cf2f4a873566142d01186fc07da94d8d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: API role inheritance'; END IF;
END $six_ledger_pcb_preflight$;
DO $six_ledger_raw_prerequisite$
BEGIN
 IF has_column_privilege('authenticated','workspace.system_users','permissions','SELECT')
  OR has_column_privilege('anon','workspace.system_users','permissions','SELECT') THEN
  RAISE EXCEPTION 'Six-ledger stage 01 requires prior protected raw-column enforcement';
 END IF;
END;
$six_ledger_raw_prerequisite$;

-- Exact postconditions of immutable records are prerequisites, not fresh repairs.
do $applied_progress_audit_preflight$
begin
  if not exists (select 1 from pg_class c where c.oid='workspace.test_progress_audit'::regclass
    and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[]
    and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='45aea7988cfc4f1244dc48f55c3a3941') then
    raise exception 'Preflight failed: test_progress_audit ACL, policy, owner or RLS drift';
  end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.test_progress_audit'::regclass and attacl is not null) then
    raise exception 'Preflight failed: unexpected column grant';
  end if;
  if exists(select 1 from pg_auth_members where member='anon'::regrole) then
    raise exception 'Preflight failed: anonymous role membership drift';
  end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468') then raise exception 'Preflight failed: log_test_progress_changes() definition or execution context drift'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2') then raise exception 'Preflight failed: workspace.log_test_progress_changes() definition or execution context drift'; end if;
  if has_table_privilege('anon','workspace.test_progress_audit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege('anon','workspace.test_progress_audit','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Anonymous access remains'; end if;
  if exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='test_progress_audit') then raise exception 'Audit publication drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.test_progress_audit'::regclass and not tgisinternal) or exists(select 1 from pg_constraint where contype='f' and (conrelid='workspace.test_progress_audit'::regclass or confrelid='workspace.test_progress_audit'::regclass)) then raise exception 'Audit trigger/FK dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.test_progress_audit'::regclass) then raise exception 'Audit view dependency drift'; end if;
  if not exists(select 1 from pg_trigger where tgname='log_test_progress_trigger' and tgrelid='workspace.test_progress'::regclass and tgenabled='O' and pg_get_triggerdef(oid)='CREATE TRIGGER log_test_progress_trigger AFTER INSERT OR DELETE OR UPDATE ON workspace.test_progress FOR EACH ROW EXECUTE FUNCTION log_test_progress_changes()') then raise exception 'Audit writer trigger drift'; end if;
  if not exists(select 1 from pg_proc where oid='delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='7f04cca4183be291d0917083a0369337' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: log_test_progress_changes()'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='923d91902c8261ee54e85278006e03c1' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.log_test_progress_changes()'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','workspace') and p.prokind='f' and p.prosrc ilike '%test_progress_audit%' and p.oid not in ('delete_test_system(uuid)'::regprocedure,'log_test_progress_changes()'::regprocedure,'workspace.delete_test_system(uuid)'::regprocedure,'workspace.log_test_progress_changes()'::regprocedure)) then raise exception 'Unexpected audit function dependency'; end if;
end
$applied_progress_audit_preflight$;

do $applied_tasks_preflight$
begin
  if not exists(select 1 from pg_class c where c.oid='workspace.tasks'::regclass and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='853d6eaddeaaed36fb175cd761498a5d') then raise exception 'Tasks ACL/owner/RLS/policy drift'; end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.tasks'::regclass and attacl is not null) or exists(select 1 from pg_auth_members where member='anon'::regrole) then raise exception 'Tasks column grant or role inheritance drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.tasks'::regclass and not tgisinternal) then raise exception 'Tasks business trigger drift'; end if;
  if (select count(*) from pg_constraint where conrelid='workspace.tasks'::regclass and contype<>'n')<>2 or not exists(select 1 from pg_constraint where conrelid='workspace.tasks'::regclass and conname='tasks_column_id_fkey' and pg_get_constraintdef(oid)='FOREIGN KEY (column_id) REFERENCES workspace.columns(id) ON DELETE SET NULL') or exists(select 1 from pg_constraint where confrelid='workspace.tasks'::regclass) then raise exception 'Tasks foreign-key dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.tasks'::regclass) then raise exception 'Tasks view dependency drift'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public') and p.prokind='f' and p.prosrc ~ E'\\mtasks\\M') then raise exception 'Tasks function dependency drift'; end if;
  if (select count(*) from pg_publication_tables where schemaname='workspace' and tablename='tasks')<>1 or not exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='tasks' and pubname='supabase_realtime' and rowfilter is null) then raise exception 'Tasks publication drift'; end if;
  if exists(select 1 from realtime.subscription where entity='workspace.tasks'::regclass and claims_role='anon'::regrole) then raise exception 'Tasks has a current anonymous Realtime subscriber'; end if;
  if has_table_privilege('anon','workspace.tasks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege('anon','workspace.tasks','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Tasks anonymous access remains'; end if;
end
$applied_tasks_preflight$;

DO $six_ledger_table_capture$
BEGIN
 CREATE TEMPORARY TABLE security_proposal_six_table_baseline ON COMMIT DROP AS
 SELECT c.oid AS target,
  (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
   FROM aclexplode(c.relacl) a WHERE NOT(a.grantee='authenticated'::regrole
    AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER'))) AS expected_acl,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('name',attname,'acl',attacl::text) ORDER BY attnum),'[]'::jsonb)
   FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped) AS columns,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,
    'roles',CASE WHEN polroles=ARRAY[0]::oid[] THEN ARRAY['authenticated'::regrole::oid] ELSE polroles END,
    'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb)
   FROM pg_policy WHERE polrelid=c.oid) AS expected_policies
 FROM pg_class c WHERE c.oid IN ('workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass);
 CREATE TEMPORARY TABLE security_proposal_six_dependencies ON COMMIT DROP AS
 SELECT (SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',p.proowner,
   'definer',p.prosecdef,'definition',pg_get_functiondef(p.oid),
   'acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type)
    FROM aclexplode(p.proacl) a WHERE p.prorettype<>'trigger'::regtype OR a.grantee NOT IN(0,'anon'::regrole::oid))) ORDER BY p.oid)
   FROM pg_proc p WHERE p.oid IN ('public.log_test_progress_changes()'::regprocedure,'workspace.log_test_progress_changes()'::regprocedure,'public.delete_test_system(uuid)'::regprocedure,'workspace.delete_test_system(uuid)'::regprocedure)) AS expected_functions,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,
    'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid,tgname),'[]'::jsonb)
   FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('workspace.test_progress'::regclass,
    'workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass)) AS triggers,(SELECT coalesce(jsonb_agg(jsonb_build_object('table',conrelid,'referenced',confrelid,'name',conname,
    'definition',pg_get_constraintdef(oid)) ORDER BY conrelid,conname),'[]'::jsonb)
   FROM pg_constraint WHERE conrelid IN ('workspace.tasks'::regclass,'workspace.columns'::regclass,
    'workspace.test_progress'::regclass,'workspace.test_progress_audit'::regclass)) AS constraints,(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY pubname,schemaname,tablename),'[]'::jsonb)
   FROM pg_publication_tables p WHERE schemaname='workspace'
    AND tablename IN ('tasks','test_progress','test_progress_audit')) AS publications;
END;
$six_ledger_table_capture$;

-- BEGIN UNCHANGED V1 BODY (only applied-table sweep exclusions extended).
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
      and c.oid NOT IN ('workspace.login_audit'::regclass,'workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass)
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
      and c.oid NOT IN ('workspace.login_audit'::regclass,'workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass)
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

-- END UNCHANGED V1 BODY.

-- Independent checks reject reopening even after preflight and baseline capture.
DO $six_ledger_table_postflight$
DECLARE baseline record; dependencies record; actual jsonb;
BEGIN
 FOR baseline IN SELECT * FROM pg_temp.security_proposal_six_table_baseline LOOP
  IF has_table_privilege('anon',baseline.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege('anon',baseline.target,'SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION 'Six-ledger applied anonymous boundary reopened: %',baseline.target::regclass;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=baseline.target AND relkind='r'
   AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN
   RAISE EXCEPTION 'Six-ledger applied table owner/RLS changed';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) INTO actual
   FROM pg_class c,LATERAL aclexplode(c.relacl) a WHERE c.oid=baseline.target;
  IF actual IS DISTINCT FROM baseline.expected_acl THEN RAISE EXCEPTION 'Six-ledger retained table ACL changed'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',attname,'acl',attacl::text) ORDER BY attnum),'[]'::jsonb) INTO actual
   FROM pg_attribute WHERE attrelid=baseline.target AND attnum>0 AND NOT attisdropped;
  IF actual IS DISTINCT FROM baseline.columns THEN RAISE EXCEPTION 'Six-ledger retained column ACL changed'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,
   'roles',polroles,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb) INTO actual
   FROM pg_policy WHERE polrelid=baseline.target AND polname<>'security_active_account_guard';
  IF actual IS DISTINCT FROM baseline.expected_policies THEN RAISE EXCEPTION 'Six-ledger retained policy predicate changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=baseline.target AND polname='security_active_account_guard'
   AND NOT polpermissive AND polcmd='*' AND polroles=ARRAY['authenticated'::regrole::oid]) THEN
   RAISE EXCEPTION 'Six-ledger active account guard missing';
  END IF;
 END LOOP;
 SELECT * INTO STRICT dependencies FROM pg_temp.security_proposal_six_dependencies;
SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',p.proowner,
   'definer',p.prosecdef,'definition',pg_get_functiondef(p.oid),
   'acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type)
    FROM aclexplode(p.proacl) a)) ORDER BY p.oid) INTO actual
   FROM pg_proc p WHERE p.oid IN ('public.log_test_progress_changes()'::regprocedure,'workspace.log_test_progress_changes()'::regprocedure,'public.delete_test_system(uuid)'::regprocedure,'workspace.delete_test_system(uuid)'::regprocedure);
 IF actual IS DISTINCT FROM dependencies.expected_functions THEN RAISE EXCEPTION 'Six-ledger retained audit/cleanup functions changed'; END IF;
SELECT coalesce(jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,
    'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid,tgname),'[]'::jsonb) INTO actual
   FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('workspace.test_progress'::regclass,
    'workspace.test_progress_audit'::regclass,'workspace.tasks'::regclass);
 IF actual IS DISTINCT FROM dependencies.triggers THEN RAISE EXCEPTION 'Six-ledger retained writer trigger changed'; END IF;
SELECT coalesce(jsonb_agg(jsonb_build_object('table',conrelid,'referenced',confrelid,'name',conname,
    'definition',pg_get_constraintdef(oid)) ORDER BY conrelid,conname),'[]'::jsonb) INTO actual
   FROM pg_constraint WHERE conrelid IN ('workspace.tasks'::regclass,'workspace.columns'::regclass,
    'workspace.test_progress'::regclass,'workspace.test_progress_audit'::regclass);
 IF actual IS DISTINCT FROM dependencies.constraints THEN RAISE EXCEPTION 'Six-ledger retained FK/constraints changed'; END IF;
SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY pubname,schemaname,tablename),'[]'::jsonb) INTO actual
   FROM pg_publication_tables p WHERE schemaname='workspace'
    AND tablename IN ('tasks','test_progress','test_progress_audit');
 IF actual IS DISTINCT FROM dependencies.publications THEN RAISE EXCEPTION 'Six-ledger retained publication changed'; END IF;
END;
$six_ledger_table_postflight$;

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

DO $six_ledger_pcb_preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='79a9d13c088e503a9c8658222ca3d611' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='eacd1b11f642cfbe7a99148085610450' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='00cbfb987e1ebc1fd52f7c1b6c6f31c1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='d501033b71b49134522c5cd377cec0b9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='f6a0e6c6e0bf3a4db56702f86fce5eee' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='10ad95ff35662de30f23873ba2e5d7fe' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='715560809078e631886810264d68d704' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='6e9ced322200cce2e64f850ac3ab034b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='73946309b1a685c2f7c85e0d6f12e829' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='aa958078a56c205b4a3707afd0795a9b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='6d9168d17709b75c19c69b4475899a2c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='cf2f4a873566142d01186fc07da94d8d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: API role inheritance'; END IF;
END $six_ledger_pcb_preflight$;
notify pgrst, 'reload schema';
