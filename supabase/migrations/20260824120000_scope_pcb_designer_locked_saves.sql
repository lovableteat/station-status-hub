-- A project lock must protect exactly one shared board. Keep global component
-- catalog updates shared, but never replay stale copies of other projects.
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
DECLARE
  active_project jsonb;
  scoped_payload jsonb;
  scoped_deletions jsonb;
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
$$;

CREATE OR REPLACE FUNCTION workspace.delete_pcb_designer_project_locked(
  p_user_id uuid,
  p_project_id text,
  p_editor_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
BEGIN
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
$$;

REVOKE ALL ON FUNCTION workspace.delete_pcb_designer_project_locked(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.delete_pcb_designer_project_locked(uuid, text, text)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
