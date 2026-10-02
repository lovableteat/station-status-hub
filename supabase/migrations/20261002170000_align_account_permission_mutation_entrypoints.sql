-- Prepare only: account mutations must use the same effective authorization as
-- account administration. Preserve role exceptions and service-only permissions RPC.
begin;

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
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
     AND NOT workspace.can_manage_system_users() THEN
    RAISE EXCEPTION 'User management edit access required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workspace.system_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown system user: %', p_user_id;
  END IF;

  IF jsonb_typeof(p_workspace_access) IS DISTINCT FROM 'object'
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
          OR value IS NULL
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
    || jsonb_build_object(
      'workspaceAccess', p_workspace_access,
      'pagePermissions', to_jsonb(COALESCE(p_permissions, ARRAY[]::public.page_permission[]))
    )
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


CREATE OR REPLACE FUNCTION public.set_user_access_permissions(
  p_user_id uuid, p_permissions public.page_permission[], p_workspace_access jsonb,
  p_granted_by text DEFAULT 'admin'
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT workspace.set_user_access_permissions(p_user_id, p_permissions, p_workspace_access, p_granted_by);
$$;
REVOKE ALL ON FUNCTION public.set_user_access_permissions(uuid, public.page_permission[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_access_permissions(uuid, public.page_permission[], jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION workspace.approve_system_user(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE administrator_id uuid := workspace.current_system_user_id();
BEGIN
  IF administrator_id IS NULL OR NOT workspace.can_manage_system_users() THEN
    RAISE EXCEPTION 'Administrator permission required' USING ERRCODE = '42501';
  END IF;
  UPDATE workspace.system_users
  SET status = 'active', approved_at = now(), approved_by = administrator_id, updated_at = now()
  WHERE id = p_user_id AND status = 'pending';
  RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.approve_system_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT workspace.approve_system_user(p_user_id);
$$;
REVOKE ALL ON FUNCTION workspace.approve_system_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_system_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workspace.approve_system_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_system_user(uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';
commit;
