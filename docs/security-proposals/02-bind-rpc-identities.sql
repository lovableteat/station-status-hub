-- PREPARED ONLY. No data-changing RPC is invoked by this script.
-- HISTORICAL REGRESSION INPUT, NOT THE NEW PROMOTION PATH. After the twelve-RPC
-- PCB candidate and stage 01, use 02-bind-station-delete-identities-after-pcb.sql.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '20s';

-- The independent twelve-RPC candidate preserves the existing lock/save bodies.
-- These older four PCB replacements are not a valid successor to that cutover.
-- Detect a verified-system-actor dependency before ANY replacement. A reviewed
-- station-only rebase must retain all twelve guarded definitions/ACLs unchanged.
do $pcb_rpc_sequence_preflight$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'workspace' and p.proname like '%pcb_designer%'
      and p.prosrc ~ 'current_system_user_id[[:space:]]*\('
  ) then
    raise exception 'PCB RPC sequence conflict: rebase stage 02 without its four PCB replacements; preserve all twelve verified-actor guards';
  end if;
end;
$pcb_rpc_sequence_preflight$;

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
do $preflight$
declare signature text;
begin
  foreach signature in array array[
    'workspace.pcb_designer_can_view(uuid)',
    'workspace.pcb_designer_can_edit(uuid)',
    'workspace.release_pcb_designer_project_lock(uuid,text,text)',
    'workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)',
    'workspace.current_user_can_workspace(text,text)',
    'workspace.save_pcb_designer_workspace_shared(uuid,jsonb)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Security proposal prerequisite missing: %', signature;
    end if;
  end loop;
end;
$preflight$;

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

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_view(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.auth_user_id = (SELECT auth.uid())
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) IN ('view', 'edit')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_edit(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.auth_user_id = (SELECT auth.uid())
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) = 'edit'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION workspace.release_pcb_designer_project_lock(p_user_id uuid, p_project_id text, p_editor_client_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  released boolean;
BEGIN
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied' USING ERRCODE = '42501';
  END IF;

  WITH removed AS (
    DELETE FROM workspace.pcb_designer_project_locks
    WHERE project_id = p_project_id
      AND editor_user_id = p_user_id
      AND editor_client_id = p_editor_client_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed) INTO released;
  RETURN released;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace_locked(p_user_id uuid, p_project_id text, p_editor_client_id text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  active_project jsonb;
  scoped_payload jsonb;
  scoped_deletions jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied' USING ERRCODE = '42501';
  END IF;

  IF p_payload ->> 'activeProjectId' IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'PCB active project does not match edit lock';
  END IF;

  PERFORM 1
  FROM workspace.pcb_designer_project_locks AS project_lock
  WHERE project_lock.project_id = p_project_id
    AND project_lock.editor_user_id = p_user_id
    AND project_lock.editor_client_id = p_editor_client_id
    AND project_lock.lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PCB project edit lock required';
  END IF;

  SELECT project_item.value
  INTO active_project
  FROM jsonb_array_elements(COALESCE(p_payload -> 'projects', '[]'::jsonb)) AS project_item(value)
  WHERE project_item.value ->> 'id' = p_project_id
  LIMIT 1;

  IF active_project IS NULL THEN
    RAISE EXCEPTION 'PCB locked project is missing from payload';
  END IF;

  scoped_payload := jsonb_set(p_payload, '{projects}', jsonb_build_array(active_project), true);
  scoped_deletions := COALESCE(scoped_payload -> 'remoteDeletions', '{}'::jsonb)
    || jsonb_build_object('projects', '[]'::jsonb);
  scoped_payload := jsonb_set(scoped_payload, '{remoteDeletions}', scoped_deletions, true);

  UPDATE workspace.pcb_designer_project_locks
  SET
    heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + interval '30 seconds'
  WHERE project_id = p_project_id;

  PERFORM workspace.save_pcb_designer_workspace_shared(p_user_id, scoped_payload);
END;
$function$;

-- Other browser RPC replacements must not retain anonymous EXECUTE.
-- The two delete aliases retain their already-applied ACLs unchanged above.
revoke execute on function workspace.pcb_designer_can_view(uuid),
  workspace.pcb_designer_can_edit(uuid),
  workspace.release_pcb_designer_project_lock(uuid, text, text),
  workspace.save_pcb_designer_workspace_locked(uuid, text, text, jsonb)
from public, anon;

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

notify pgrst, 'reload schema';
commit;
