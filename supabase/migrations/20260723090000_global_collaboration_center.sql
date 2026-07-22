-- Send one administrative announcement to a stable recipient set in one transaction.
CREATE OR REPLACE FUNCTION public.send_admin_announcement(
  p_sender_id uuid,
  p_recipient_ids uuid[] DEFAULT NULL,
  p_title text DEFAULT '',
  p_message text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_recipient_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.system_users
    WHERE id = p_sender_id
      AND role IN ('admin', 'super_admin')
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active administrators can send announcements';
  END IF;

  IF length(trim(p_title)) = 0 OR length(trim(p_title)) > 120 THEN
    RAISE EXCEPTION 'Announcement title must contain 1 to 120 characters';
  END IF;

  IF length(trim(p_message)) = 0 OR length(trim(p_message)) > 4000 THEN
    RAISE EXCEPTION 'Announcement message must contain 1 to 4000 characters';
  END IF;

  INSERT INTO public.user_notifications (
    recipient_id,
    sender_id,
    notification_type,
    title,
    message,
    reference_type,
    grouped_id,
    status,
    category,
    metadata,
    is_read
  )
  SELECT
    recipient.id,
    p_sender_id,
    'admin_announcement',
    trim(p_title),
    trim(p_message),
    'admin_announcement',
    v_batch_id::text,
    'pending',
    'announcement',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('batchId', v_batch_id),
    false
  FROM public.system_users AS recipient
  WHERE recipient.status = 'active'
    AND (p_recipient_ids IS NULL OR recipient.id = ANY(p_recipient_ids));

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  IF v_recipient_count = 0 THEN
    RAISE EXCEPTION 'No active recipients matched the announcement';
  END IF;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'recipientCount', v_recipient_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_admin_announcement(uuid, uuid[], text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_admin_announcement(uuid, uuid[], text, text, jsonb) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_user_notifications_admin_announcement
  ON public.user_notifications (grouped_id, created_at DESC)
  WHERE notification_type = 'admin_announcement';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END;
$$;
