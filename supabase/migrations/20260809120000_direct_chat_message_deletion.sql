-- Allow senders to remove their own direct messages and administrators to
-- remove any message in a thread they belong to. Keep a tombstone so realtime
-- clients can render a stable "deleted" bubble instead of losing message order.

CREATE OR REPLACE FUNCTION public.delete_direct_chat_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_role text;
  v_thread_id uuid;
  v_sender_id uuid;
  v_deleted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user required';
  END IF;

  SELECT role INTO v_role
  FROM public.system_users
  WHERE id = v_user_id AND status = 'active';

  SELECT thread_id, sender_id INTO v_thread_id, v_sender_id
  FROM public.chat_messages
  WHERE id = p_message_id;

  IF v_thread_id IS NULL OR NOT public.is_chat_member(v_thread_id) THEN
    RAISE EXCEPTION 'Chat message is not accessible';
  END IF;

  IF v_sender_id IS DISTINCT FROM v_user_id
     AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only the sender or an administrator can delete this message';
  END IF;

  UPDATE public.chat_messages
  SET body = '此訊息已刪除', deleted_at = coalesce(deleted_at, now()), edited_at = now()
  WHERE id = p_message_id AND deleted_at IS NULL;
  v_deleted := FOUND;

  IF v_deleted THEN
    UPDATE public.chat_threads
    SET last_message_at = (
      SELECT created_at
      FROM public.chat_messages
      WHERE thread_id = v_thread_id AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ), updated_at = now()
    WHERE id = v_thread_id;
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_direct_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_direct_chat_message(uuid) TO authenticated, service_role;
