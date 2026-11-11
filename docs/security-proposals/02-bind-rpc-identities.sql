-- PREPARED ONLY. No data-changing RPC is invoked by this script.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '20s';

-- These are replacements for reviewed APIs, never silently created new APIs.
do $preflight$
declare signature text;
begin
  foreach signature in array array[
    'public.delete_test_system(uuid)',
    'workspace.delete_test_system(uuid)',
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

-- Internal scheduler/maintenance RPCs are not browser operations.
-- Be explicit even when existing ACLs or creator defaults drift between stages.
revoke execute on function public.delete_test_system(uuid),
  workspace.delete_test_system(uuid),
  workspace.pcb_designer_can_view(uuid),
  workspace.pcb_designer_can_edit(uuid),
  workspace.release_pcb_designer_project_lock(uuid, text, text),
  workspace.save_pcb_designer_workspace_locked(uuid, text, text, jsonb)
from public, anon;

-- Cron executes as postgres; its schedule and command are unchanged.
revoke execute on function public.cleanup_old_notifications(),
  workspace.cleanup_old_notifications(),
  public.calculate_daily_production_stats(),
  workspace.calculate_daily_production_stats()
from public, anon, authenticated;

grant execute on function public.cleanup_old_notifications(),
  workspace.cleanup_old_notifications(),
  public.calculate_daily_production_stats(),
  workspace.calculate_daily_production_stats()
to service_role;

notify pgrst, 'reload schema';
commit;
