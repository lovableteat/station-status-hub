-- Private photo and video attachments for direct messages. Browser clients upload
-- to a member-scoped path first, then this migration atomically attaches those
-- objects to a message through a security-definer RPC.

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_body_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_body_check
  CHECK (char_length(btrim(body)) <= 5000);

CREATE TABLE IF NOT EXISTS public.chat_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, position)
);

CREATE INDEX IF NOT EXISTS chat_message_attachments_message_idx
  ON public.chat_message_attachments (message_id, position);

ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_message_attachments FROM anon, authenticated;
GRANT SELECT ON public.chat_message_attachments TO authenticated, service_role;

DROP POLICY IF EXISTS "Chat members can read visible attachments"
  ON public.chat_message_attachments;
CREATE POLICY "Chat members can read visible attachments"
  ON public.chat_message_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages AS messages
      WHERE messages.id = chat_message_attachments.message_id
        AND messages.thread_id = chat_message_attachments.thread_id
        AND messages.deleted_at IS NULL
        AND public.is_chat_member(messages.thread_id)
        AND messages.created_at > coalesce((
          SELECT clears.cleared_at
          FROM public.chat_history_clears AS clears
          WHERE clears.thread_id = messages.thread_id
            AND clears.user_id = public.current_system_user_id()
        ), '-infinity'::timestamptz)
    )
  );

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'chat-media',
  'chat-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.can_read_chat_media_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_message_attachments AS attachments
    JOIN public.chat_messages AS messages
      ON messages.id = attachments.message_id
     AND messages.thread_id = attachments.thread_id
    WHERE attachments.storage_path = p_name
      AND messages.deleted_at IS NULL
      AND public.is_chat_member(messages.thread_id)
      AND messages.created_at > coalesce((
        SELECT clears.cleared_at
        FROM public.chat_history_clears AS clears
        WHERE clears.thread_id = messages.thread_id
          AND clears.user_id = public.current_system_user_id()
      ), '-infinity'::timestamptz)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_upload_chat_media_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
  SELECT
    (storage.foldername(p_name))[2] = public.current_system_user_id()::text
    AND public.is_chat_member(((storage.foldername(p_name))[1])::uuid);
$$;

CREATE OR REPLACE FUNCTION public.can_delete_chat_media_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
  SELECT
    public.is_chat_member(((storage.foldername(p_name))[1])::uuid)
    AND (
      (storage.foldername(p_name))[2] = public.current_system_user_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.system_users AS users
        WHERE users.id = public.current_system_user_id()
          AND users.status = 'active'
          AND users.role IN ('admin', 'super_admin')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_chat_media_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_upload_chat_media_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delete_chat_media_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_chat_media_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_chat_media_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_delete_chat_media_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Chat members can read visible media" ON storage.objects;
CREATE POLICY "Chat members can read visible media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.can_read_chat_media_object(name)
  );

DROP POLICY IF EXISTS "Chat members can upload media" ON storage.objects;
CREATE POLICY "Chat members can upload media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND public.can_upload_chat_media_object(name)
  );

DROP POLICY IF EXISTS "Senders and admins can delete media" ON storage.objects;
CREATE POLICY "Senders and admins can delete media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.can_delete_chat_media_object(name)
  );

DROP POLICY IF EXISTS "Chat members can send messages" ON public.chat_messages;
REVOKE INSERT ON public.chat_messages FROM authenticated;

CREATE OR REPLACE FUNCTION public.send_direct_chat_message(
  p_thread_id uuid,
  p_client_id uuid,
  p_body text,
  p_attachments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_body text := btrim(coalesce(p_body, ''));
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_message_id uuid;
  v_attachment jsonb;
  v_position integer;
  v_storage_path text;
  v_file_name text;
  v_mime_type text;
  v_media_kind text;
  v_file_size bigint;
  v_expected_prefix text;
  v_object_metadata jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_chat_member(p_thread_id) THEN
    RAISE EXCEPTION 'Direct chat membership required';
  END IF;
  IF jsonb_typeof(v_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Attachments must be an array';
  END IF;
  IF char_length(v_body) > 5000 THEN
    RAISE EXCEPTION 'Message body is too long';
  END IF;
  IF jsonb_array_length(v_attachments) > 4 THEN
    RAISE EXCEPTION 'A message can include at most four attachments';
  END IF;
  IF char_length(v_body) = 0 AND jsonb_array_length(v_attachments) = 0 THEN
    RAISE EXCEPTION 'Message body or attachment required';
  END IF;

  v_expected_prefix := p_thread_id::text || '/' || v_user_id::text || '/' || p_client_id::text || '/';

  FOR v_attachment, v_position IN
    SELECT value, (ordinality - 1)::integer
    FROM jsonb_array_elements(v_attachments) WITH ORDINALITY
  LOOP
    v_storage_path := v_attachment ->> 'storage_path';
    v_file_name := btrim(coalesce(v_attachment ->> 'file_name', ''));
    v_mime_type := v_attachment ->> 'mime_type';
    v_media_kind := v_attachment ->> 'media_kind';
    v_file_size := coalesce((v_attachment ->> 'file_size')::bigint, 0);

    IF v_storage_path IS NULL OR v_storage_path NOT LIKE v_expected_prefix || position('..' IN v_storage_path) > 0 THEN
      RAISE EXCEPTION 'Invalid attachment path';
    END IF;
    IF char_length(v_file_name) NOT BETWEEN 1 AND 255 OR v_file_size <= 0 THEN
      RAISE EXCEPTION 'Invalid attachment metadata';
    END IF;
    IF v_media_kind = 'image' THEN
      IF v_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
         OR v_file_size > 12582912 THEN
        RAISE EXCEPTION 'Invalid image attachment';
      END IF;
    ELSIF v_media_kind = 'video' THEN
      IF v_mime_type NOT IN ('video/mp4', 'video/webm', 'video/quicktime')
         OR v_file_size > 52428800 THEN
        RAISE EXCEPTION 'Invalid video attachment';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported attachment type';
    END IF;

    SELECT objects.metadata INTO v_object_metadata
    FROM storage.objects AS objects
    WHERE objects.bucket_id = 'chat-media'
      AND objects.name = v_storage_path;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uploaded attachment was not found';
    END IF;
    IF coalesce(v_object_metadata ->> 'mimetype', v_mime_type) <> v_mime_type
       OR coalesce((v_object_metadata ->> 'size')::bigint, v_file_size) <> v_file_size THEN
      RAISE EXCEPTION 'Uploaded attachment metadata does not match';
    END IF;
  END LOOP;

  INSERT INTO public.chat_messages (thread_id, sender_id, client_id, body)
  VALUES (p_thread_id, v_user_id, p_client_id, v_body)
  ON CONFLICT (sender_id, client_id) DO UPDATE
  SET body = excluded.body
  WHERE chat_messages.thread_id = excluded.thread_id
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'Message client identifier belongs to another thread';
  END IF;

  FOR v_attachment, v_position IN
    SELECT value, (ordinality - 1)::integer
    FROM jsonb_array_elements(v_attachments) WITH ORDINALITY
  LOOP
    INSERT INTO public.chat_message_attachments (
      message_id, thread_id, uploader_id, position, storage_path,
      file_name, mime_type, file_size, media_kind
    ) VALUES (
      v_message_id,
      p_thread_id,
      v_user_id,
      v_position,
      v_attachment ->> 'storage_path',
      btrim(v_attachment ->> 'file_name'),
      v_attachment ->> 'mime_type',
      (v_attachment ->> 'file_size')::bigint,
      v_attachment ->> 'media_kind'
    )
    ON CONFLICT (storage_path) DO NOTHING;
  END LOOP;

  UPDATE public.chat_threads
  SET last_message_at = now(), updated_at = now()
  WHERE id = p_thread_id;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_direct_chat_message(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_direct_chat_message(uuid, uuid, text, jsonb)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.delete_direct_chat_message(uuid);
CREATE FUNCTION public.delete_direct_chat_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_role text;
  v_thread_id uuid;
  v_sender_id uuid;
  v_deleted boolean := false;
  v_storage_paths text[] := ARRAY[]::text[];
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

  SELECT coalesce(array_agg(storage_path ORDER BY position), ARRAY[]::text[])
  INTO v_storage_paths
  FROM public.chat_message_attachments
  WHERE message_id = p_message_id;

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

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'storage_paths', to_jsonb(v_storage_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_direct_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_direct_chat_message(uuid) TO authenticated, service_role;

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
    CASE
      WHEN char_length(btrim(latest.body)) > 0 THEN latest.body
      WHEN latest.attachment_count = 1 AND latest.single_kind = 'image' THEN '傳送了照片'
      WHEN latest.attachment_count = 1 AND latest.single_kind = 'video' THEN '傳送了影片'
      WHEN latest.attachment_count > 1 THEN '傳送了 ' || latest.attachment_count || ' 個附件'
      ELSE latest.body
    END,
    latest.sender_id,
    latest.created_at,
    (
      SELECT count(*)
      FROM public.chat_messages AS unread
      WHERE unread.thread_id = threads.id
        AND unread.deleted_at IS NULL
        AND unread.sender_id <> viewer.id
        AND (own_clear.cleared_at IS NULL OR unread.created_at > own_clear.cleared_at)
        AND unread.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
    )
  FROM viewer
  JOIN public.chat_members AS own_member ON own_member.user_id = viewer.id
  JOIN public.chat_threads AS threads ON threads.id = own_member.thread_id
  LEFT JOIN public.chat_history_clears AS own_clear
    ON own_clear.thread_id = threads.id AND own_clear.user_id = viewer.id
  LEFT JOIN public.chat_members AS other_member
    ON other_member.thread_id = threads.id AND other_member.user_id <> viewer.id
  LEFT JOIN public.system_users AS other_user ON other_user.id = other_member.user_id
  LEFT JOIN public.chat_read_receipts AS receipt
    ON receipt.thread_id = threads.id AND receipt.user_id = viewer.id
  LEFT JOIN LATERAL (
    SELECT
      latest_messages.id,
      latest_messages.body,
      latest_messages.sender_id,
      latest_messages.created_at,
      count(attachments.id) AS attachment_count,
      min(attachments.media_kind) AS single_kind
    FROM public.chat_messages AS latest_messages
    LEFT JOIN public.chat_message_attachments AS attachments
      ON attachments.message_id = latest_messages.id
    WHERE latest_messages.thread_id = threads.id
      AND latest_messages.deleted_at IS NULL
      AND (own_clear.cleared_at IS NULL OR latest_messages.created_at > own_clear.cleared_at)
    GROUP BY latest_messages.id
    ORDER BY latest_messages.created_at DESC, latest_messages.id DESC
    LIMIT 1
  ) AS latest ON true
  WHERE threads.kind = 'direct'
    AND (own_clear.cleared_at IS NULL OR latest.id IS NOT NULL)
  ORDER BY coalesce(latest.created_at, threads.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_direct_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_chat_threads() TO authenticated, service_role;
