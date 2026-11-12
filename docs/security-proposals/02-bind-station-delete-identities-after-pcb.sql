-- PREPARED ONLY. No data-changing RPC is called by this proposal.
-- Sole supported order: twelve-RPC PCB candidate -> stage 01 -> this file -> stage 03.
-- This supersedes stage 02's four PCB replacements for the narrow-cutover route.
-- All twelve PCB definitions and ACLs remain unchanged; only the two machine-delete
-- bodies gain their reviewed station-edit check. No grants or data are changed.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '20s';

-- Exact PCB post-cutover baseline plus stage 01's narrowed mapping-function ACL.
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at current_system_user_id'; END IF;
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
END $preflight$;

do $stage01_prerequisite$
begin
  if not exists (select 1 from pg_policy where polrelid = 'workspace.system_users'::regclass
      and polname = 'security_active_account_guard' and not polpermissive)
    or not exists (select 1 from pg_policy where polrelid = 'workspace.login_audit'::regclass
      and polname = 'security_guard_login_audit' and not polpermissive)
    or to_regprocedure('workspace.current_user_can_workspace(text,text)') is null then
    raise exception 'Stage 01 prerequisite missing before station-only identity proposal';
  end if;
end;
$stage01_prerequisite$;

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

-- These are replacements for reviewed APIs, never silently created new APIs.
-- CREATE OR REPLACE retains existing ACLs even under broad function defaults.
-- Keep both reviewed identity guards, and assert that the applied ACLs, owners
-- and SECURITY DEFINER flags survive without granting or revoking anything.
do $delete_rpc_replacements$
declare
  before_metadata jsonb;
  after_metadata jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text, 'acl', p.proacl::text,
    'owner', p.proowner, 'security_definer', p.prosecdef
  ) order by p.oid) into before_metadata
  from pg_proc p where p.oid in (
    'public.delete_test_system(uuid)'::regprocedure,
    'workspace.delete_test_system(uuid)'::regprocedure
  );

CREATE OR REPLACE FUNCTION public.delete_test_system(p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'auth', 'storage', 'realtime', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT coalesce(workspace.current_user_can_workspace('station-status', 'edit'), false) THEN
    RAISE EXCEPTION 'Station edit access denied' USING ERRCODE = '42501';
  END IF;

  -- Verify the system exists
  SELECT EXISTS(
    SELECT 1 FROM workspace.test_systems WHERE id = p_system_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'no_data_found';
  END IF;

  -- 清理station_time_analytics表（如果存在）
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
    DELETE FROM workspace.station_time_analytics WHERE system_id = p_system_id;
  END IF;

  -- 1) Issues and attachments linked to this system
  DELETE FROM workspace.issue_attachments ia
  USING workspace.issues i
  WHERE ia.issue_id = i.id
    AND i.system_id = p_system_id;

  DELETE FROM workspace.issues i
  WHERE i.system_id = p_system_id;

  -- 2) Dashboard exclusions
  DELETE FROM workspace.dashboard_item_exclusions die
  WHERE die.system_id = p_system_id;

  -- 3) Test progress audit and records
  DELETE FROM workspace.test_progress_audit tpa
  WHERE tpa.system_id = p_system_id;

  DELETE FROM workspace.test_progress tp
  WHERE tp.system_id = p_system_id;

  -- 4) Station timing records/settings
  DELETE FROM workspace.station_time_records str
  WHERE str.system_id = p_system_id;

  DELETE FROM workspace.station_time_settings sts
  WHERE sts.system_id = p_system_id;

  -- 5) Finally delete the system itself
  DELETE FROM workspace.test_systems ts
  WHERE ts.id = p_system_id;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.delete_test_system(p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT coalesce(workspace.current_user_can_workspace('station-status', 'edit'), false) THEN
    RAISE EXCEPTION 'Station edit access denied' USING ERRCODE = '42501';
  END IF;

  -- Verify the system exists
  SELECT EXISTS(
    SELECT 1 FROM workspace.test_systems WHERE id = p_system_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'no_data_found';
  END IF;

  -- 清理station_time_analytics表（如果存在）
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
    DELETE FROM workspace.station_time_analytics WHERE system_id = p_system_id;
  END IF;

  -- 1) Issues and attachments linked to this system
  DELETE FROM workspace.issue_attachments ia
  USING workspace.issues i
  WHERE ia.issue_id = i.id
    AND i.system_id = p_system_id;

  DELETE FROM workspace.issues i
  WHERE i.system_id = p_system_id;

  -- 2) Dashboard exclusions
  DELETE FROM workspace.dashboard_item_exclusions die
  WHERE die.system_id = p_system_id;

  -- 3) Test progress audit and records
  DELETE FROM workspace.test_progress_audit tpa
  WHERE tpa.system_id = p_system_id;

  DELETE FROM workspace.test_progress tp
  WHERE tp.system_id = p_system_id;

  -- 4) Station timing records/settings
  DELETE FROM workspace.station_time_records str
  WHERE str.system_id = p_system_id;

  DELETE FROM workspace.station_time_settings sts
  WHERE sts.system_id = p_system_id;

  -- 5) Finally delete the system itself
  DELETE FROM workspace.test_systems ts
  WHERE ts.id = p_system_id;
END;
$function$;

  select jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text, 'acl', p.proacl::text,
    'owner', p.proowner, 'security_definer', p.prosecdef
  ) order by p.oid) into after_metadata
  from pg_proc p where p.oid in (
    'public.delete_test_system(uuid)'::regprocedure,
    'workspace.delete_test_system(uuid)'::regprocedure
  );
  if after_metadata is distinct from before_metadata then
    raise exception 'Applied delete RPC baseline changed during identity replacement';
  end if;
end;
$delete_rpc_replacements$;

-- Equality with the captured metadata is not enough: drift after the early
-- preflight but before capture could otherwise become the accepted baseline.
-- Recheck the required access and owner/definer semantics before committing.
-- Read only, fail closed, and never repair the already-applied ACLs here.
do $delete_rpc_postflight$
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
      raise exception 'Applied delete RPC postflight missing: %', signature;
    end if;
    if not exists (
      select 1 from pg_proc p where p.oid = target
        and p.proowner = 'postgres'::regrole and p.prosecdef
    ) then
      raise exception 'Applied delete RPC postflight drift: owner or SECURITY DEFINER: %', signature;
    end if;
    if has_function_privilege('anon', target, 'execute')
      or exists (
        select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where p.oid = target and permission.grantee = 0
          and permission.privilege_type = 'EXECUTE'
      ) then
      raise exception 'Applied delete RPC postflight drift: anonymous EXECUTE: %', signature;
    end if;
    if not has_function_privilege('authenticated', target, 'execute')
      or not has_function_privilege('service_role', target, 'execute')
      or not has_function_privilege('postgres', target, 'execute')
      or not (select has_schema_privilege('authenticated', p.pronamespace, 'usage')
        and has_schema_privilege('service_role', p.pronamespace, 'usage')
        and has_schema_privilege('postgres', p.pronamespace, 'usage')
        from pg_proc p where p.oid = target) then
      raise exception 'Applied delete RPC postflight drift: existing caller access missing: %', signature;
    end if;
  end loop;
end;
$delete_rpc_postflight$;

DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Hardened PCB baseline drift: function definition, owner or ACL drift at current_system_user_id'; END IF;
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
END $preflight$;

notify pgrst, 'reload schema';
commit;
