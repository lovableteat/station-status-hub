-- Keep server-side account administration aligned with the permission model
-- used by the admin UI. A non-admin role may manage users only when the
-- explicit admin_edit page permission has been granted.
CREATE OR REPLACE FUNCTION public.can_manage_system_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users AS administrator
    WHERE administrator.auth_user_id = auth.uid()
      AND administrator.status = 'active'
      AND (
        administrator.role IN ('admin', 'super_admin')
        OR EXISTS (
          SELECT 1
          FROM public.user_page_permissions AS page_permission
          WHERE page_permission.user_id = administrator.id
            AND page_permission.permission = 'admin_edit'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_system_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_system_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_system_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  administrator_id uuid := public.current_system_user_id();
BEGIN
  IF administrator_id IS NULL OR NOT public.can_manage_system_users() THEN
    RAISE EXCEPTION 'Administrator permission required';
  END IF;

  UPDATE public.system_users
  SET status = 'active',
      approved_at = now(),
      approved_by = administrator_id,
      updated_at = now()
  WHERE id = p_user_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_system_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_system_user(uuid) TO authenticated, service_role;
