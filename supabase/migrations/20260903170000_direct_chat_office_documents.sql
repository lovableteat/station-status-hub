-- Office documents stay in the existing private, member-scoped chat bucket.
ALTER TABLE workspace.chat_message_attachments DROP CONSTRAINT IF EXISTS chat_message_attachments_media_kind_check;
ALTER TABLE workspace.chat_message_attachments ADD CONSTRAINT chat_message_attachments_media_kind_check
  CHECK (media_kind IN ('image', 'video', 'document'));

UPDATE storage.buckets SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime FROM unnest(coalesce(allowed_mime_types, ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'
  ]) || ARRAY[
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]) AS mime
) WHERE id = 'chat-media';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media' AND public = false AND file_size_limit >= 52428800) THEN
    RAISE EXCEPTION 'Expected existing private chat-media bucket with 50 MB limit';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION workspace.send_direct_chat_message(
  p_thread_id uuid,
  p_client_id uuid,
  p_body text,
  p_attachments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, auth, storage, pg_temp
AS $$
DECLARE
  v_user_id uuid := workspace.current_system_user_id();
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
  IF v_user_id IS NULL OR NOT workspace.is_chat_member(p_thread_id) THEN
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

    IF v_storage_path IS NULL
       OR left(v_storage_path, char_length(v_expected_prefix)) <> v_expected_prefix
       OR strpos(v_storage_path, '..') > 0 THEN
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
    ELSIF v_media_kind = 'document' THEN
      IF v_file_size > 52428800 OR NOT coalesce(
        (v_mime_type = 'application/vnd.ms-powerpoint' AND lower(v_file_name) LIKE '%.ppt' AND v_storage_path LIKE '%.ppt') OR
        (v_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND lower(v_file_name) LIKE '%.pptx' AND v_storage_path LIKE '%.pptx') OR
        (v_mime_type = 'application/vnd.ms-excel' AND lower(v_file_name) LIKE '%.xls' AND v_storage_path LIKE '%.xls') OR
        (v_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND lower(v_file_name) LIKE '%.xlsx' AND v_storage_path LIKE '%.xlsx'), false) THEN
        RAISE EXCEPTION 'Invalid document attachment';
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

  INSERT INTO workspace.chat_messages (thread_id, sender_id, client_id, body)
  VALUES (p_thread_id, v_user_id, p_client_id, v_body)
  ON CONFLICT (sender_id, client_id) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    SELECT messages.id INTO v_message_id
    FROM workspace.chat_messages AS messages
    WHERE messages.sender_id = v_user_id
      AND messages.client_id = p_client_id
      AND messages.thread_id = p_thread_id;

    IF v_message_id IS NULL THEN
      RAISE EXCEPTION 'Message client identifier belongs to another thread';
    END IF;
  END IF;

  FOR v_attachment, v_position IN
    SELECT value, (ordinality - 1)::integer
    FROM jsonb_array_elements(v_attachments) WITH ORDINALITY
  LOOP
    INSERT INTO workspace.chat_message_attachments (
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

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION workspace.send_direct_chat_message(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.send_direct_chat_message(uuid, uuid, text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION workspace.list_direct_chat_threads()
RETURNS TABLE(
  thread_id uuid,
  other_user_id uuid,
  other_username varchar,
  other_display_name varchar,
  other_avatar_path text,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = workspace, auth, pg_temp
AS $$
  WITH viewer AS (
    SELECT workspace.current_system_user_id() AS id
  )
  SELECT
    threads.id,
    other_member.user_id,
    other_user.username,
    coalesce(other_user.display_name, other_user.username)::varchar,
    other_user.avatar_path,
    latest.id,
    CASE
      WHEN char_length(btrim(latest.body)) > 0 THEN latest.body
      WHEN latest.attachment_count = 1 AND latest.single_kind = 'image' THEN '傳送了照片'
      WHEN latest.attachment_count = 1 AND latest.single_kind = 'video' THEN '傳送了影片'
      WHEN latest.attachment_count = 1 AND latest.single_kind = 'document' THEN '傳送了文件'
      WHEN latest.attachment_count > 1 THEN '傳送了 ' || latest.attachment_count || ' 個附件'
      ELSE latest.body
    END,
    latest.sender_id,
    latest.created_at,
    (
      SELECT count(*)
      FROM workspace.chat_messages AS unread
      WHERE unread.thread_id = threads.id
        AND unread.deleted_at IS NULL
        AND unread.sender_id <> viewer.id
        AND (own_clear.cleared_at IS NULL OR unread.created_at > own_clear.cleared_at)
        AND unread.created_at > coalesce(receipt.last_read_at, '-infinity'::timestamptz)
    )
  FROM viewer
  JOIN workspace.chat_members AS own_member ON own_member.user_id = viewer.id
  JOIN workspace.chat_threads AS threads ON threads.id = own_member.thread_id
  LEFT JOIN workspace.chat_history_clears AS own_clear
    ON own_clear.thread_id = threads.id AND own_clear.user_id = viewer.id
  LEFT JOIN workspace.chat_members AS other_member
    ON other_member.thread_id = threads.id AND other_member.user_id <> viewer.id
  LEFT JOIN workspace.system_users AS other_user ON other_user.id = other_member.user_id
  LEFT JOIN workspace.chat_read_receipts AS receipt
    ON receipt.thread_id = threads.id AND receipt.user_id = viewer.id
  LEFT JOIN LATERAL (
    SELECT
      latest_messages.id,
      latest_messages.body,
      latest_messages.sender_id,
      latest_messages.created_at,
      count(attachments.id) AS attachment_count,
      min(attachments.media_kind) AS single_kind
    FROM workspace.chat_messages AS latest_messages
    LEFT JOIN workspace.chat_message_attachments AS attachments
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

REVOKE ALL ON FUNCTION workspace.list_direct_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.list_direct_chat_threads() TO authenticated, service_role;


-- Retain the legacy endpoint with identical membership and metadata checks.
CREATE OR REPLACE FUNCTION public.send_direct_chat_message(p_thread_id uuid, p_client_id uuid, p_body text, p_attachments jsonb)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT workspace.send_direct_chat_message(p_thread_id, p_client_id, p_body, p_attachments);
$$;
REVOKE ALL ON FUNCTION public.send_direct_chat_message(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_direct_chat_message(uuid, uuid, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION workspace.send_direct_chat_message(uuid, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION workspace.list_direct_chat_threads() FROM anon;
NOTIFY pgrst, 'reload schema';
