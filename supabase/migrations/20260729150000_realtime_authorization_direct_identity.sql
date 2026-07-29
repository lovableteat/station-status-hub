-- Realtime Authorization evaluates policies in its own transaction context.
-- Resolve the authenticated account directly, following Supabase's documented
-- membership-policy pattern, instead of nesting auth.uid() behind another RPC.
DROP POLICY IF EXISTS "Codex diagnostic presence read" ON realtime.messages;
DROP POLICY IF EXISTS "Codex diagnostic presence write" ON realtime.messages;
DROP POLICY IF EXISTS "Codex diagnostic collaboration read" ON realtime.messages;
DROP POLICY IF EXISTS "Codex diagnostic collaboration write" ON realtime.messages;

DROP POLICY IF EXISTS "Authenticated users can receive collaboration realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive collaboration realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.system_users AS users
      WHERE users.auth_user_id = (SELECT auth.uid())
        AND users.status = 'active'
    )
    AND (
      (realtime.topic() = 'presence:global' AND extension IN ('broadcast', 'presence'))
      OR (
        realtime.topic() LIKE 'presence:workspace:%'
        AND extension IN ('broadcast', 'presence')
      )
      OR (
        extension = 'broadcast'
        AND EXISTS (
          SELECT 1
          FROM public.system_users AS users
          WHERE users.auth_user_id = (SELECT auth.uid())
            AND users.status = 'active'
            AND realtime.topic() = 'chat-inbox:' || users.id::text
        )
      )
      OR (
        public.chat_thread_id_from_topic(realtime.topic()) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.chat_members AS members
          JOIN public.system_users AS users ON users.id = members.user_id
          WHERE users.auth_user_id = (SELECT auth.uid())
            AND users.status = 'active'
            AND members.thread_id = public.chat_thread_id_from_topic(realtime.topic())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can send collaboration realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can send collaboration realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.system_users AS users
      WHERE users.auth_user_id = (SELECT auth.uid())
        AND users.status = 'active'
    )
    AND (
      (realtime.topic() = 'presence:global' AND extension IN ('broadcast', 'presence'))
      OR (
        realtime.topic() LIKE 'presence:workspace:%'
        AND extension IN ('broadcast', 'presence')
      )
      OR (
        extension = 'broadcast'
        AND EXISTS (
          SELECT 1
          FROM public.system_users AS users
          WHERE users.auth_user_id = (SELECT auth.uid())
            AND users.status = 'active'
            AND realtime.topic() = 'chat-inbox:' || users.id::text
        )
      )
      OR (
        public.chat_thread_id_from_topic(realtime.topic()) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.chat_members AS members
          JOIN public.system_users AS users ON users.id = members.user_id
          WHERE users.auth_user_id = (SELECT auth.uid())
            AND users.status = 'active'
            AND members.thread_id = public.chat_thread_id_from_topic(realtime.topic())
        )
      )
    )
  );
