INSERT INTO public.user_page_permissions (user_id, permission, granted_by)
SELECT
  user_id,
  CASE permission
    WHEN 'test_tracker_view' THEN 'flow_info_view'::public.page_permission
    WHEN 'test_tracker_edit' THEN 'flow_info_edit'::public.page_permission
  END,
  'permission-migration'
FROM public.user_page_permissions
WHERE permission IN ('test_tracker_view', 'test_tracker_edit')
ON CONFLICT (user_id, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown system user: %', p_user_id;
  END IF;

  IF jsonb_typeof(p_workspace_access) <> 'object'
     OR NOT (p_workspace_access ?& ARRAY['station-status', 'material-requests', 'data-center'])
     OR EXISTS (
       SELECT 1
       FROM jsonb_each_text(p_workspace_access) AS access(key, value)
       WHERE key NOT IN ('station-status', 'material-requests', 'data-center')
          OR value NOT IN ('none', 'view', 'edit')
     ) THEN
    RAISE EXCEPTION 'Invalid workspace access payload';
  END IF;

  DELETE FROM public.user_page_permissions
  WHERE user_id = p_user_id;

  INSERT INTO public.user_page_permissions (user_id, permission, granted_by)
  SELECT p_user_id, permission, NULLIF(p_granted_by, '')
  FROM unnest(COALESCE(p_permissions, ARRAY[]::public.page_permission[])) AS permission
  ON CONFLICT (user_id, permission) DO NOTHING;

  UPDATE public.system_users
  SET permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object('workspaceAccess', p_workspace_access)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_access_permissions(
  uuid,
  public.page_permission[],
  jsonb,
  text
) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_page_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_page_permissions;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_users;
  END IF;
END;
$$;
