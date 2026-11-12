-- LOCAL CANDIDATE ONLY. NOT APPLIED TO PRODUCTION.
-- Requires compatible authenticated client and separate legacy-snapshot exposure work.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at current_system_user_id'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='101a32af6f38ba67698b02eec1cf5525' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='7e15454a9baf03d6b36072f81b036bf1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='c6cdae1ee97781938880b9f0fa9c579b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='812c0f8e84f724d187275a70796d592d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='307e85b1f4a3946d746f6247d146a8cc' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='904427ec2e21e7626f077e4fcb2d15c7' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='02e24124360ac65a377fbb980acdb28c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='f8411106659837ebb1caf667c5e5146c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='48c4657c26ddbaae861be9790a753168' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='9a133b255a7e451e927439456f33bfab' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='e0afd5cb9bd40aeae99c062ead17e2cc' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='d5dce6e0d0ec2e3ddf326c2c99cedd6b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Preflight failed: API role inheritance'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION workspace.acquire_pcb_designer_project_lock(p_user_id uuid, p_project_id text, p_project_name text, p_editor_client_id text, p_lease_seconds integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  lease_seconds integer;
  current_lock record;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF NULLIF(btrim(p_project_id), '') IS NULL
    OR char_length(p_project_id) > 200
    OR NULLIF(btrim(p_editor_client_id), '') IS NULL
    OR char_length(p_editor_client_id) > 200 THEN
    RAISE EXCEPTION 'Invalid PCB project lock request';
  END IF;

  lease_seconds := LEAST(120, GREATEST(10, COALESCE(p_lease_seconds, 30)));

  INSERT INTO workspace.pcb_designer_project_locks (
    project_id,
    project_name,
    editor_user_id,
    editor_client_id,
    heartbeat_at,
    lease_expires_at
  )
  VALUES (
    p_project_id,
    left(COALESCE(p_project_name, ''), 300),
    p_user_id,
    p_editor_client_id,
    clock_timestamp(),
    clock_timestamp() + make_interval(secs => lease_seconds)
  )
  ON CONFLICT (project_id) DO UPDATE
  SET
    project_name = EXCLUDED.project_name,
    editor_user_id = EXCLUDED.editor_user_id,
    editor_client_id = EXCLUDED.editor_client_id,
    heartbeat_at = EXCLUDED.heartbeat_at,
    lease_expires_at = EXCLUDED.lease_expires_at
  WHERE workspace.pcb_designer_project_locks.lease_expires_at <= clock_timestamp()
    OR (
      workspace.pcb_designer_project_locks.editor_user_id = EXCLUDED.editor_user_id
      AND workspace.pcb_designer_project_locks.editor_client_id = EXCLUDED.editor_client_id
    );

  SELECT
    project_lock.project_id,
    project_lock.project_name,
    project_lock.editor_user_id,
    project_lock.editor_client_id,
    project_lock.heartbeat_at,
    project_lock.lease_expires_at,
    account.username,
    COALESCE(account.display_name, account.username) AS display_name
  INTO current_lock
  FROM workspace.pcb_designer_project_locks AS project_lock
  JOIN workspace.system_users AS account ON account.id = project_lock.editor_user_id
  WHERE project_lock.project_id = p_project_id;

  RETURN jsonb_build_object(
    'available', true,
    'acquired', current_lock.editor_user_id = p_user_id
      AND current_lock.editor_client_id = p_editor_client_id,
    'lock', jsonb_build_object(
      'projectId', current_lock.project_id,
      'projectName', current_lock.project_name,
      'editorUserId', current_lock.editor_user_id::text,
      'editorClientId', current_lock.editor_client_id,
      'editorUsername', current_lock.username,
      'editorDisplayName', current_lock.display_name,
      'heartbeatAt', current_lock.heartbeat_at::text,
      'leaseExpiresAt', current_lock.lease_expires_at::text
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.delete_pcb_designer_project_locked(p_user_id uuid, p_project_id text, p_editor_client_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
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

  INSERT INTO workspace.pcb_designer_shared_projects (
    id,
    payload,
    project_updated_at,
    updated_by,
    deleted_at
  )
  VALUES (
    p_project_id,
    NULL,
    NULL,
    p_user_id,
    clock_timestamp()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    payload = NULL,
    project_updated_at = NULL,
    updated_by = EXCLUDED.updated_by,
    deleted_at = EXCLUDED.deleted_at;

  DELETE FROM workspace.pcb_designer_project_locks
  WHERE project_id = p_project_id
    AND editor_user_id = p_user_id
    AND editor_client_id = p_editor_client_id;

  RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.list_pcb_designer_model_assets(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(asset.metadata ORDER BY asset.updated_at DESC), '[]'::jsonb)
  INTO result
  FROM workspace.pcb_designer_model_assets AS asset;

  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_model_asset(p_user_id uuid, p_asset_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT jsonb_build_object(
    'metadata', asset.metadata,
    'payloadBase64', replace(encode(asset.compressed_payload, 'base64'), E'\n', '')
  )
  INTO result
  FROM workspace.pcb_designer_model_assets AS asset
  WHERE asset.id = p_asset_id;

  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_project_lock(p_user_id uuid, p_project_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  current_lock record;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  DELETE FROM workspace.pcb_designer_project_locks
  WHERE project_id = p_project_id
    AND lease_expires_at <= clock_timestamp();

  SELECT
    project_lock.project_id,
    project_lock.project_name,
    project_lock.editor_user_id,
    project_lock.editor_client_id,
    project_lock.heartbeat_at,
    project_lock.lease_expires_at,
    account.username,
    COALESCE(account.display_name, account.username) AS display_name
  INTO current_lock
  FROM workspace.pcb_designer_project_locks AS project_lock
  JOIN workspace.system_users AS account ON account.id = project_lock.editor_user_id
  WHERE project_lock.project_id = p_project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', true, 'acquired', false, 'lock', NULL);
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'acquired', false,
    'lock', jsonb_build_object(
      'projectId', current_lock.project_id,
      'projectName', current_lock.project_name,
      'editorUserId', current_lock.editor_user_id::text,
      'editorClientId', current_lock.editor_client_id,
      'editorUsername', current_lock.username,
      'editorDisplayName', current_lock.display_name,
      'heartbeatAt', current_lock.heartbeat_at::text,
      'leaseExpiresAt', current_lock.lease_expires_at::text
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_workspace(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  personal_payload jsonb;
  shared_projects jsonb;
  deleted_project_ids jsonb;
  shared_revision timestamptz;
  personal_revision timestamptz;
  combined_revision timestamptz;
  active_project_id text;
  result jsonb;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT account_workspace.payload
  INTO personal_payload
  FROM workspace.pcb_designer_workspaces AS account_workspace
  WHERE account_workspace.owner_id = p_user_id;

  personal_payload := COALESCE(
    personal_payload,
    jsonb_build_object(
      'projects', '[]'::jsonb,
      'templates', '[]'::jsonb,
      'library', '[]'::jsonb,
      'activeProjectId', NULL,
      'modelAssets', '{}'::jsonb,
      'pendingPlacementsByProject', '{}'::jsonb,
      'remoteDeletions', jsonb_build_object(
        'projects', '[]'::jsonb,
        'templates', '[]'::jsonb,
        'library', '[]'::jsonb
      ),
      'updatedAt', '1970-01-01T00:00:00.000Z'
    )
  );

  SELECT
    COALESCE(
      jsonb_agg(shared.payload ORDER BY shared.project_updated_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NULL),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(to_jsonb(shared.id) ORDER BY shared.deleted_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NOT NULL),
      '[]'::jsonb
    ),
    MAX(COALESCE(shared.deleted_at, shared.project_updated_at))
  INTO shared_projects, deleted_project_ids, shared_revision
  FROM workspace.pcb_designer_shared_projects AS shared;

  active_project_id := personal_payload ->> 'activeProjectId';
  IF active_project_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(shared_projects) AS project(payload)
    WHERE project.payload ->> 'id' = active_project_id
  ) THEN
    active_project_id := shared_projects -> 0 ->> 'id';
  END IF;

  personal_revision := workspace.pcb_designer_project_revision(
    personal_payload,
    '1970-01-01 00:00:00+00'::timestamptz
  );
  combined_revision := GREATEST(
    personal_revision,
    COALESCE(shared_revision, '1970-01-01 00:00:00+00'::timestamptz)
  );

  result := jsonb_set(personal_payload, '{projects}', shared_projects, true);
  result := jsonb_set(
    result,
    '{activeProjectId}',
    COALESCE(to_jsonb(active_project_id), 'null'::jsonb),
    true
  );
  result := jsonb_set(
    result,
    '{remoteDeletions}',
    COALESCE(result -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', deleted_project_ids),
    true
  );
  result := jsonb_set(result, '{updatedAt}', to_jsonb(combined_revision::text), true);
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_workspace_shared(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  shared_library jsonb;
  deleted_library_ids jsonb;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  result := workspace.load_pcb_designer_workspace(p_user_id);
  SELECT
    COALESCE(
      jsonb_agg(shared.payload ORDER BY shared.component_updated_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NULL),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(to_jsonb(shared.id) ORDER BY shared.deleted_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NOT NULL),
      '[]'::jsonb
    )
  INTO shared_library, deleted_library_ids
  FROM workspace.pcb_designer_shared_library AS shared;

  result := jsonb_set(result, '{library}', shared_library, true);
  result := jsonb_set(
    result,
    '{remoteDeletions}',
    COALESCE(result -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('library', deleted_library_ids),
    true
  );
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.release_pcb_designer_project_lock(p_user_id uuid, p_project_id text, p_editor_client_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  released boolean;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
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
$function$
;
CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_model_asset(p_user_id uuid, p_asset_id text, p_metadata jsonb, p_payload_base64 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  decoded_payload bytea;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF NULLIF(trim(p_asset_id), '') IS NULL
    OR length(p_asset_id) > 200
    OR jsonb_typeof(p_metadata) <> 'object'
    OR NULLIF(p_payload_base64, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid PCB model asset';
  END IF;

  decoded_payload := decode(regexp_replace(p_payload_base64, '\s', '', 'g'), 'base64');
  IF octet_length(decoded_payload) NOT BETWEEN 1 AND 67108864 THEN
    RAISE EXCEPTION 'PCB model asset exceeds the 64 MB compressed limit';
  END IF;

  INSERT INTO workspace.pcb_designer_model_assets (
    id,
    metadata,
    compressed_payload,
    updated_by
  )
  VALUES (
    p_asset_id,
    p_metadata,
    decoded_payload,
    p_user_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    metadata = EXCLUDED.metadata,
    compressed_payload = EXCLUDED.compressed_payload,
    updated_by = EXCLUDED.updated_by;
  RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace(p_user_id uuid, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  project_payload jsonb;
  project_id text;
  project_revision timestamptz;
  deleted_project_id text;
  personal_payload jsonb;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload -> 'projects') <> 'array'
    OR jsonb_typeof(p_payload -> 'templates') <> 'array'
    OR jsonb_typeof(p_payload -> 'library') <> 'array'
    OR octet_length(p_payload::text) > 20 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Invalid or oversized PCB workspace payload';
  END IF;

  FOR deleted_project_id IN
    SELECT deleted_id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_payload #> '{remoteDeletions,projects}') = 'array'
          THEN p_payload #> '{remoteDeletions,projects}'
        ELSE '[]'::jsonb
      END
    ) AS deleted(deleted_id)
    WHERE NULLIF(deleted_id, '') IS NOT NULL
  LOOP
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by, deleted_at
    )
    VALUES (deleted_project_id, NULL, NULL, p_user_id, clock_timestamp())
    ON CONFLICT (id) DO UPDATE
    SET
      payload = NULL,
      project_updated_at = NULL,
      updated_by = EXCLUDED.updated_by,
      deleted_at = EXCLUDED.deleted_at;
  END LOOP;

  FOR project_payload IN
    SELECT project.value
    FROM jsonb_array_elements(p_payload -> 'projects') AS project(value)
  LOOP
    project_id := NULLIF(project_payload ->> 'id', '');
    IF project_id IS NULL OR jsonb_typeof(project_payload) <> 'object' THEN
      RAISE EXCEPTION 'Invalid PCB project payload';
    END IF;
    project_revision := workspace.pcb_designer_project_revision(
      project_payload,
      clock_timestamp()
    );
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by
    )
    VALUES (project_id, project_payload, project_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      project_updated_at = EXCLUDED.project_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE workspace.pcb_designer_shared_projects.deleted_at IS NULL
      AND workspace.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;
  END LOOP;

  personal_payload := jsonb_set(p_payload, '{projects}', '[]'::jsonb, true);
  personal_payload := jsonb_set(
    personal_payload,
    '{remoteDeletions}',
    COALESCE(personal_payload -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', '[]'::jsonb),
    true
  );
  INSERT INTO workspace.pcb_designer_workspaces (owner_id, payload)
  VALUES (p_user_id, personal_payload)
  ON CONFLICT (owner_id) DO UPDATE
  SET payload = EXCLUDED.payload;
END;
$function$
;
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
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
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
$function$
;
CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace_shared(p_user_id uuid, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  component_payload jsonb;
  component_id text;
  component_revision timestamptz;
  deleted_component_id text;
BEGIN
  -- Derive the actor from verified Supabase Auth, never a supplied account ID.
  IF p_user_id IS NULL
    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';
  END IF;
  PERFORM workspace.save_pcb_designer_workspace(p_user_id, p_payload);
  component_revision := workspace.pcb_designer_project_revision(
    p_payload,
    clock_timestamp()
  );

  FOR deleted_component_id IN
    SELECT deleted_id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_payload #> '{remoteDeletions,library}') = 'array'
          THEN p_payload #> '{remoteDeletions,library}'
        ELSE '[]'::jsonb
      END
    ) AS deleted(deleted_id)
    WHERE NULLIF(deleted_id, '') IS NOT NULL
  LOOP
    INSERT INTO workspace.pcb_designer_shared_library (
      id, payload, component_updated_at, updated_by, deleted_at
    )
    VALUES (deleted_component_id, NULL, NULL, p_user_id, clock_timestamp())
    ON CONFLICT (id) DO UPDATE
    SET
      payload = NULL,
      component_updated_at = NULL,
      updated_by = EXCLUDED.updated_by,
      deleted_at = EXCLUDED.deleted_at;
  END LOOP;

  FOR component_payload IN
    SELECT component.value
    FROM jsonb_array_elements(p_payload -> 'library') AS component(value)
    WHERE COALESCE(component.value ->> 'source', '') <> 'built-in'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(p_payload #> '{remoteDeletions,library}') = 'array'
              THEN p_payload #> '{remoteDeletions,library}'
            ELSE '[]'::jsonb
          END
        ) AS deleted(deleted_id)
        WHERE deleted.deleted_id = component.value ->> 'id'
      )
  LOOP
    component_id := NULLIF(component_payload ->> 'id', '');
    IF component_id IS NULL OR jsonb_typeof(component_payload) <> 'object' THEN
      RAISE EXCEPTION 'Invalid PCB library component payload';
    END IF;
    INSERT INTO workspace.pcb_designer_shared_library (
      id, payload, component_updated_at, updated_by
    )
    VALUES (component_id, component_payload, component_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      component_updated_at = EXCLUDED.component_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE workspace.pcb_designer_shared_library.deleted_at IS NULL
      AND workspace.pcb_designer_shared_library.component_updated_at <= EXCLUDED.component_updated_at;
  END LOOP;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.delete_pcb_designer_project_locked(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.list_pcb_designer_model_assets(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.load_pcb_designer_model_asset(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.load_pcb_designer_project_lock(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.load_pcb_designer_workspace(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.load_pcb_designer_workspace_shared(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.release_pcb_designer_project_lock(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace_shared(uuid,jsonb) FROM PUBLIC, anon;
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at current_system_user_id'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='79a9d13c088e503a9c8658222ca3d611' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='eacd1b11f642cfbe7a99148085610450' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='00cbfb987e1ebc1fd52f7c1b6c6f31c1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='d501033b71b49134522c5cd377cec0b9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='f6a0e6c6e0bf3a4db56702f86fce5eee' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='10ad95ff35662de30f23873ba2e5d7fe' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='715560809078e631886810264d68d704' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='6e9ced322200cce2e64f850ac3ab034b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='73946309b1a685c2f7c85e0d6f12e829' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='aa958078a56c205b4a3707afd0795a9b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='6d9168d17709b75c19c69b4475899a2c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='cf2f4a873566142d01186fc07da94d8d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Preflight failed: API role inheritance'; END IF;
END $preflight$;
COMMIT;
