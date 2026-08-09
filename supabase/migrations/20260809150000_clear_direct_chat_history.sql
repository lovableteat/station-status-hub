-- Clear a direct conversation independently for each member. The other
-- participant keeps their history, while RLS prevents the clearing member
-- from querying messages at or before their personal cutoff.

ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

CREATE OR REPLACE FUNCTION public.clear_direct_chat_history(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_allowed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_threads AS threads
    JOIN public.chat_members AS members
      ON members.thread_id = threads.id
    JOIN public.system_users AS users
      ON users.id = members.user_id
     AND users.status = 'active'
    WHERE threads.id = p_thread_id
      AND threads.kind = 'direct'
      AND members.user_id = v_user_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Direct chat membership required';
  END IF;

  UPDATE public.chat_members
  SET cleared_at = clock_timestamp()
  WHERE thread_id = p_thread_id
    AND user_id = v_user_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_direct_chat_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_direct_chat_history(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Chat members can read messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat members can read visible messages" ON public.chat_messages;
CREATE POLICY "Chat members can read visible messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_members AS members
      WHERE members.thread_id = chat_messages.thread_id
        AND members.user_id = public.current_system_user_id()
        AND (
          members.cleared_at IS NULL
          OR chat_messages.created_at > members.cleared_at
        )
    )
  );

CREATE OR REPLACE FUNCTION public.list_direct_chat_threads()
RETURNS TABLE(
  thread_id uuid,
  other_user_id uuid,
  other_username varchar,
  other_display_name varchar,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH viewer AS (
    SELECT public.current_system_user_id() AS id
  )
  SELECT
    threads.id,
    other_member.user_id,
    other_user.username,
    coalesce(other_user.display_name, other_user.username)::varchar,
    latest.id,
    latest.body,
    latest.sender_id,
    latest.created_at,
    (
      SELECT count(*)
      FROM public.chat_messages AS unread
      WHERE unread.thread_id = threads.id
        AND unread.deleted_at IS NULL
        AND unread.sender_id <> viewer.id
        AND (
          own_member.cleared_at IS NULL
          OR unread.created_at > own_member.cleared_at
        )
        AND unread.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
    ) AS unread_count
  FROM viewer
  JOIN public.chat_members AS own_member
    ON own_member.user_id = viewer.id
  JOIN public.chat_threads AS threads
    ON threads.id = own_member.thread_id
  LEFT JOIN public.chat_members AS other_member
    ON other_member.thread_id = threads.id
   AND other_member.user_id <> viewer.id
  LEFT JOIN public.system_users AS other_user
    ON other_user.id = other_member.user_id
  LEFT JOIN public.chat_read_receipts AS receipt
    ON receipt.thread_id = threads.id
   AND receipt.user_id = viewer.id
  LEFT JOIN LATERAL (
    SELECT
      latest_messages.id,
      latest_messages.body,
      latest_messages.sender_id,
      latest_messages.created_at
    FROM public.chat_messages AS latest_messages
    WHERE latest_messages.thread_id = threads.id
      AND latest_messages.deleted_at IS NULL
      AND (
        own_member.cleared_at IS NULL
        OR latest_messages.created_at > own_member.cleared_at
      )
    ORDER BY latest_messages.created_at DESC, latest_messages.id DESC
    LIMIT 1
  ) AS latest ON true
  WHERE threads.kind = 'direct'
    AND (own_member.cleared_at IS NULL OR latest.id IS NOT NULL)
  ORDER BY coalesce(latest.created_at, threads.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_direct_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_chat_threads() TO authenticated, service_role;

-- The collaboration center and floating launcher each own a thread-list hook.
-- Broadcasting membership updates keeps both views in sync after a clear.
DROP TRIGGER IF EXISTS chat_members_inbox_broadcast ON public.chat_members;
CREATE TRIGGER chat_members_inbox_broadcast
AFTER INSERT OR UPDATE ON public.chat_members
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_inbox_change();
