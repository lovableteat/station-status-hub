-- PCB projects are shared production documents. A short lease keeps one
-- browser authoritative while every other open client remains a live viewer.
CREATE TABLE IF NOT EXISTS workspace.pcb_designer_project_locks (
  project_id text PRIMARY KEY,
  project_name text NOT NULL DEFAULT '',
  editor_user_id uuid NOT NULL REFERENCES workspace.system_users(id) ON DELETE CASCADE,
  editor_client_id text NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS pcb_designer_project_locks_lease_idx
ON workspace.pcb_designer_project_locks (lease_expires_at);

ALTER TABLE workspace.pcb_designer_project_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE workspace.pcb_designer_project_locks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION workspace.acquire_pcb_designer_project_lock(
  p_user_id uuid,
  p_project_id text,
  p_project_name text,
  p_editor_client_id text,
  p_lease_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  lease_seconds integer;
  current_lock record;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_project_lock(
  p_user_id uuid,
  p_project_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  current_lock record;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION workspace.release_pcb_designer_project_lock(
  p_user_id uuid,
  p_project_id text,
  p_editor_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  released boolean;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace_locked(
  p_user_id uuid,
  p_project_id text,
  p_editor_client_id text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
BEGIN
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

  UPDATE workspace.pcb_designer_project_locks
  SET
    heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + interval '30 seconds'
  WHERE project_id = p_project_id;

  PERFORM workspace.save_pcb_designer_workspace_shared(p_user_id, p_payload);
END;
$$;

REVOKE ALL ON FUNCTION workspace.acquire_pcb_designer_project_lock(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.load_pcb_designer_project_lock(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.release_pcb_designer_project_lock(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.save_pcb_designer_workspace_locked(uuid, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION workspace.acquire_pcb_designer_project_lock(uuid, text, text, text, integer)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.load_pcb_designer_project_lock(uuid, text)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.release_pcb_designer_project_lock(uuid, text, text)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace_locked(uuid, text, text, jsonb)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
