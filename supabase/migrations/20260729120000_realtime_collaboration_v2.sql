-- Add authenticated realtime collaboration without replacing legacy application IDs.
-- Existing RPCs and anonymous compatibility policies intentionally remain available
-- during the staged rollout so current workspaces keep functioning.

ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS auth_migrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS system_users_auth_user_id_unique
  ON public.system_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_system_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT id
  FROM public.system_users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_system_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_system_user_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_current_system_user()
RETURNS TABLE(
  user_id uuid,
  username varchar,
  role varchar,
  display_name varchar,
  status varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    users.id,
    users.username,
    users.role,
    coalesce(users.display_name, users.username)::varchar,
    users.status
  FROM public.system_users AS users
  WHERE users.auth_user_id = auth.uid()
    AND users.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_system_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_system_user() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  direct_key text,
  title text,
  created_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_direct_key_unique
  ON public.chat_threads (direct_key)
  WHERE direct_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_members (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  client_id uuid NOT NULL DEFAULT gen_random_uuid(),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (sender_id, client_id)
);

CREATE INDEX IF NOT EXISTS chat_messages_thread_created_at_idx
  ON public.chat_messages (thread_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_member(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_members
    WHERE thread_id = p_thread_id
      AND user_id = public.current_system_user_id()
  );
$$;

REVOKE ALL ON FUNCTION public.is_chat_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Chat members can read threads" ON public.chat_threads;
CREATE POLICY "Chat members can read threads"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (public.is_chat_member(id));

DROP POLICY IF EXISTS "Chat members can read memberships" ON public.chat_members;
CREATE POLICY "Chat members can read memberships"
  ON public.chat_members FOR SELECT TO authenticated
  USING (public.is_chat_member(thread_id));

DROP POLICY IF EXISTS "Chat members can read messages" ON public.chat_messages;
CREATE POLICY "Chat members can read messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_member(thread_id));

DROP POLICY IF EXISTS "Chat members can send messages" ON public.chat_messages;
CREATE POLICY "Chat members can send messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chat_member(thread_id)
    AND sender_id = public.current_system_user_id()
  );

DROP POLICY IF EXISTS "Chat members can read receipts" ON public.chat_read_receipts;
CREATE POLICY "Chat members can read receipts"
  ON public.chat_read_receipts FOR SELECT TO authenticated
  USING (public.is_chat_member(thread_id));

DROP POLICY IF EXISTS "Users can create their own read receipt" ON public.chat_read_receipts;
CREATE POLICY "Users can create their own read receipt"
  ON public.chat_read_receipts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chat_member(thread_id)
    AND user_id = public.current_system_user_id()
  );

DROP POLICY IF EXISTS "Users can update their own read receipt" ON public.chat_read_receipts;
CREATE POLICY "Users can update their own read receipt"
  ON public.chat_read_receipts FOR UPDATE TO authenticated
  USING (user_id = public.current_system_user_id())
  WITH CHECK (
    public.is_chat_member(thread_id)
    AND user_id = public.current_system_user_id()
  );

REVOKE ALL ON public.chat_threads, public.chat_members, public.chat_messages, public.chat_read_receipts FROM anon;
GRANT SELECT ON public.chat_threads, public.chat_members TO authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_read_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.start_direct_chat(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_current_user_id uuid := public.current_system_user_id();
  v_direct_key text;
  v_thread_id uuid;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user required';
  END IF;

  IF p_other_user_id = v_current_user_id OR NOT EXISTS (
    SELECT 1 FROM public.system_users
    WHERE id = p_other_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'A different active recipient is required';
  END IF;

  v_direct_key := least(v_current_user_id::text, p_other_user_id::text)
    || ':' || greatest(v_current_user_id::text, p_other_user_id::text);

  INSERT INTO public.chat_threads (kind, direct_key, created_by)
  VALUES ('direct', v_direct_key, v_current_user_id)
  ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL
  DO UPDATE SET direct_key = excluded.direct_key
  RETURNING id INTO v_thread_id;

  INSERT INTO public.chat_members (thread_id, user_id)
  VALUES
    (v_thread_id, v_current_user_id),
    (v_thread_id, p_other_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_chat(uuid) TO authenticated, service_role;

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
  WITH current_user AS (
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
        AND unread.sender_id <> current_user.id
        AND unread.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
    ) AS unread_count
  FROM current_user
  JOIN public.chat_members AS own_member ON own_member.user_id = current_user.id
  JOIN public.chat_threads AS threads ON threads.id = own_member.thread_id
  LEFT JOIN public.chat_members AS other_member
    ON other_member.thread_id = threads.id
   AND other_member.user_id <> current_user.id
  LEFT JOIN public.system_users AS other_user ON other_user.id = other_member.user_id
  LEFT JOIN public.chat_read_receipts AS receipt
    ON receipt.thread_id = threads.id
   AND receipt.user_id = current_user.id
  LEFT JOIN LATERAL (
    SELECT messages.id, messages.body, messages.sender_id, messages.created_at
    FROM public.chat_messages AS messages
    WHERE messages.thread_id = threads.id
      AND messages.deleted_at IS NULL
    ORDER BY messages.created_at DESC, messages.id DESC
    LIMIT 1
  ) AS latest ON true
  WHERE threads.kind = 'direct'
  ORDER BY coalesce(latest.created_at, threads.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_direct_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_chat_threads() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_chat_thread_read(
  p_thread_id uuid,
  p_message_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_message_id uuid := p_message_id;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_chat_member(p_thread_id) THEN
    RAISE EXCEPTION 'Chat membership required';
  END IF;

  IF v_message_id IS NULL THEN
    SELECT id INTO v_message_id
    FROM public.chat_messages
    WHERE thread_id = p_thread_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE id = v_message_id AND thread_id = p_thread_id
  ) THEN
    RAISE EXCEPTION 'Message does not belong to this thread';
  END IF;

  INSERT INTO public.chat_read_receipts (
    thread_id, user_id, last_read_message_id, last_read_at
  ) VALUES (
    p_thread_id, v_user_id, v_message_id, now()
  )
  ON CONFLICT (thread_id, user_id) DO UPDATE
  SET last_read_message_id = excluded.last_read_message_id,
      last_read_at = excluded.last_read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_thread_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_chat_thread_read(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_chat_thread_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chat_threads
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_thread_from_message();

CREATE OR REPLACE FUNCTION public.broadcast_chat_message_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'chat:' || coalesce(NEW.thread_id, OLD.thread_id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_realtime_broadcast ON public.chat_messages;
CREATE TRIGGER chat_messages_realtime_broadcast
AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_message_change();

DROP TRIGGER IF EXISTS chat_receipts_realtime_broadcast ON public.chat_read_receipts;
CREATE TRIGGER chat_receipts_realtime_broadcast
AFTER INSERT OR UPDATE OR DELETE ON public.chat_read_receipts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_message_change();

CREATE OR REPLACE FUNCTION public.broadcast_chat_inbox_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
AS $$
DECLARE
  v_member record;
BEGIN
  FOR v_member IN
    SELECT user_id
    FROM public.chat_members
    WHERE thread_id = NEW.thread_id
  LOOP
    PERFORM realtime.broadcast_changes(
      'chat-inbox:' || v_member.user_id::text,
      TG_OP,
      TG_OP,
      TG_TABLE_NAME,
      TG_TABLE_SCHEMA,
      NEW,
      NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_members_inbox_broadcast ON public.chat_members;
CREATE TRIGGER chat_members_inbox_broadcast
AFTER INSERT ON public.chat_members
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_inbox_change();

DROP TRIGGER IF EXISTS chat_messages_inbox_broadcast ON public.chat_messages;
CREATE TRIGGER chat_messages_inbox_broadcast
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_chat_inbox_change();

CREATE OR REPLACE FUNCTION public.chat_thread_id_from_topic(p_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF left(p_topic, 5) <> 'chat:' THEN
    RETURN NULL;
  END IF;
  RETURN substring(p_topic FROM 6)::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_thread_id_from_topic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_thread_id_from_topic(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can receive collaboration realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive collaboration realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    public.current_system_user_id() IS NOT NULL
    AND (
      (realtime.topic() = 'presence:global' AND extension = 'presence')
      OR (realtime.topic() LIKE 'presence:workspace:%' AND extension = 'presence')
      OR (
        realtime.topic() = 'chat-inbox:' || public.current_system_user_id()::text
        AND extension = 'broadcast'
      )
      OR (
        public.chat_thread_id_from_topic(realtime.topic()) IS NOT NULL
        AND public.is_chat_member(public.chat_thread_id_from_topic(realtime.topic()))
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can send collaboration realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can send collaboration realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_system_user_id() IS NOT NULL
    AND (
      (realtime.topic() = 'presence:global' AND extension = 'presence')
      OR (realtime.topic() LIKE 'presence:workspace:%' AND extension = 'presence')
      OR (
        realtime.topic() = 'chat-inbox:' || public.current_system_user_id()::text
        AND extension = 'broadcast'
      )
      OR (
        public.chat_thread_id_from_topic(realtime.topic()) IS NOT NULL
        AND public.is_chat_member(public.chat_thread_id_from_topic(realtime.topic()))
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'chat_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END;
$$;
