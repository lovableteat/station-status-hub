-- Notification removal is recipient-scoped and implemented as archival so
-- announcement delivery history and read metrics remain intact for admins.
CREATE OR REPLACE FUNCTION public.dismiss_user_notification(
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_user_id uuid := public.current_system_user_id();
  v_updated_count integer := 0;
BEGIN
  IF v_system_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user not found';
  END IF;

  UPDATE public.user_notifications
  SET
    archived_at = now(),
    archived_by = v_system_user_id,
    updated_at = now()
  WHERE id = p_notification_id
    AND recipient_id = v_system_user_id
    AND is_read = true
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_read_user_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_user_id uuid := public.current_system_user_id();
  v_updated_count integer := 0;
BEGIN
  IF v_system_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user not found';
  END IF;

  UPDATE public.user_notifications
  SET
    archived_at = now(),
    archived_by = v_system_user_id,
    updated_at = now()
  WHERE recipient_id = v_system_user_id
    AND is_read = true
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_user_notification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_read_user_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_user_notification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_read_user_notifications() TO authenticated, service_role;
