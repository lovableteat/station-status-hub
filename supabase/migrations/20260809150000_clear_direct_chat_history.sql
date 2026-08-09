-- Clear a direct conversation independently for each member. Clear cutoffs
-- live in user-owned rows so the other participant cannot observe them.

CREATE TABLE IF NOT EXISTS public.chat_history_clears (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.chat_history_clears ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_history_clears FROM anon, authenticated;
GRANT SELECT ON public.chat_history_clears TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can read their own chat history clears"
  ON public.chat_history_clears;
CREATE POLICY "Users can read their own chat history clears"
  ON public.chat_history_clears FOR SELECT TO authenticated
  USING (user_id = public.current_system_user_id());

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

  INSERT INTO public.chat_history_clears (thread_id, user_id, cleared_at)
  VALUES (p_thread_id, v_user_id, clock_timestamp())
  ON CONFLICT (thread_id, user_id) DO UPDATE
  SET cleared_at = excluded.cleared_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_direct_chat_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_direct_chat_history(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Chat members can read messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat members can read visible messages" ON public.chat_messages;
CREATE POLICY "Chat members can read visible messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    public.is_chat_member(chat_messages.thread_id)
    AND chat_messages.created_at > coalesce((
      SELECT clears.cleared_at
      FROM public.chat_history_clears AS clears
      WHERE clears.thread_id = chat_messages.thread_id
        AND clears.user_id = public.current_system_user_id()
    ), '-infinity'::timestamptz)
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
          own_clear.cleared_at IS NULL
          OR unread.created_at > own_clear.cleared_at
        )
        AND unread.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
    ) AS unread_count
  FROM viewer
  JOIN public.chat_members AS own_member
    ON own_member.user_id = viewer.id
  JOIN public.chat_threads AS threads
    ON threads.id = own_member.thread_id
  LEFT JOIN public.chat_history_clears AS own_clear
    ON own_clear.thread_id = threads.id
   AND own_clear.user_id = viewer.id
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
        own_clear.cleared_at IS NULL
        OR latest_messages.created_at > own_clear.cleared_at
      )
    ORDER BY latest_messages.created_at DESC, latest_messages.id DESC
    LIMIT 1
  ) AS latest ON true
  WHERE threads.kind = 'direct'
    AND (own_clear.cleared_at IS NULL OR latest.id IS NOT NULL)
  ORDER BY coalesce(latest.created_at, threads.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_direct_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_chat_threads() TO authenticated, service_role;

-- Message broadcasts carry identifiers only. Clients must re-query the record,
-- which makes message RLS (including the personal cutoff) authoritative.
CREATE OR REPLACE FUNCTION public.broadcast_chat_message_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
DECLARE
  v_new jsonb := coalesce(to_jsonb(NEW), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(OLD), '{}'::jsonb);
  v_thread_id text := coalesce(v_new ->> 'thread_id', v_old ->> 'thread_id');
  v_record_id text := coalesce(v_new ->> 'id', v_old ->> 'id');
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'thread_id', v_thread_id,
      'record_id', v_record_id
    ),
    TG_OP,
    'chat:' || v_thread_id,
    true
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_chat_history_clear()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'table', 'chat_history_clears',
      'thread_id', NEW.thread_id,
      'user_id', NEW.user_id
    ),
    TG_OP,
    'chat-inbox:' || NEW.user_id::text,
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_history_clears_inbox_broadcast
  ON public.chat_history_clears;
CREATE TRIGGER chat_history_clears_inbox_broadcast
AFTER INSERT OR UPDATE ON public.chat_history_clears
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_history_clear();
