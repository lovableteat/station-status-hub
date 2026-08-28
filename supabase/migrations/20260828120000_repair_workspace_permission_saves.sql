-- `system_users` became read-only for authenticated clients when the app data
-- moved into the `workspace` schema. The old workspace RPC was copied as a
-- SECURITY INVOKER function, so a legitimate administrator could read an
-- account but could not persist its permissions. Keep the write atomic while
-- granting it only through an explicit user-management authorization check.

CREATE OR REPLACE FUNCTION workspace.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role'
     AND NOT workspace.current_user_can_workspace('user-management', 'edit') THEN
    RAISE EXCEPTION 'User management edit access required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workspace.system_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown system user: %', p_user_id;
  END IF;

  IF jsonb_typeof(p_workspace_access) <> 'object'
     OR NOT (p_workspace_access ?& ARRAY[
       'station-status',
       'material-requests',
       'data-center'
     ])
     OR EXISTS (
       SELECT 1
       FROM jsonb_each_text(p_workspace_access) AS access(key, value)
       WHERE key NOT IN (
         'station-status',
         'material-requests',
         'data-center',
         'pcb-designer',
         'user-management',
         'ai-chat',
         'performance'
       )
          OR value NOT IN ('none', 'view', 'edit')
     ) THEN
    RAISE EXCEPTION 'Invalid workspace access payload';
  END IF;

  DELETE FROM workspace.user_page_permissions
  WHERE user_id = p_user_id;

  INSERT INTO workspace.user_page_permissions (user_id, permission, granted_by)
  SELECT p_user_id, permission, NULLIF(p_granted_by, '')
  FROM unnest(
    COALESCE(p_permissions, ARRAY[]::public.page_permission[])
  ) AS permission
  ON CONFLICT (user_id, permission) DO NOTHING;

  UPDATE workspace.system_users
  SET permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object('workspaceAccess', p_workspace_access)
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION workspace.set_user_access_permissions(
  uuid,
  public.page_permission[],
  jsonb,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION workspace.set_user_access_permissions(
  uuid,
  public.page_permission[],
  jsonb,
  text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
