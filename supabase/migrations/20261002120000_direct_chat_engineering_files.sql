BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'chat-media' AND public = false AND file_size_limit >= 52428800
  ) THEN
    RAISE EXCEPTION 'Expected existing private chat-media bucket with 50 MB limit';
  END IF;
END $$;

UPDATE storage.buckets SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime FROM unnest(coalesce(allowed_mime_types, ARRAY[]::text[]) || ARRAY[
    'application/vnd.rar', 'application/octet-stream'
  ]) AS mime
) WHERE id = 'chat-media';

DROP POLICY IF EXISTS "Chat members can upload media" ON storage.objects;
CREATE POLICY "Chat members can upload media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|ppt|pptx|xls|xlsx|rar|brd|stp|mps)$'
    AND workspace.can_upload_chat_media_object(name)
  );

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
      IF v_file_size > 52428800 OR NOT coalesce(
        (v_mime_type = 'video/mp4' AND lower(v_file_name) LIKE '%.mp4' AND v_storage_path LIKE '%.mp4') OR
        (v_mime_type = 'video/webm' AND lower(v_file_name) LIKE '%.webm' AND v_storage_path LIKE '%.webm') OR
        (v_mime_type = 'video/quicktime' AND lower(v_file_name) LIKE '%.mov' AND v_storage_path LIKE '%.mov'), false) THEN
        RAISE EXCEPTION 'Invalid video attachment';
      END IF;
    ELSIF v_media_kind = 'document' THEN
      IF v_file_size > 52428800 OR NOT coalesce(
        (v_mime_type = 'application/vnd.ms-powerpoint' AND lower(v_file_name) LIKE '%.ppt' AND v_storage_path LIKE '%.ppt') OR
        (v_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND lower(v_file_name) LIKE '%.pptx' AND v_storage_path LIKE '%.pptx') OR
        (v_mime_type = 'application/vnd.ms-excel' AND lower(v_file_name) LIKE '%.xls' AND v_storage_path LIKE '%.xls') OR
        (v_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND lower(v_file_name) LIKE '%.xlsx' AND v_storage_path LIKE '%.xlsx') OR
        (v_mime_type = 'application/vnd.rar' AND lower(v_file_name) LIKE '%.rar' AND v_storage_path LIKE '%.rar') OR
        (v_mime_type = 'application/octet-stream' AND lower(v_file_name) LIKE '%.brd' AND v_storage_path LIKE '%.brd') OR
        (v_mime_type = 'application/octet-stream' AND lower(v_file_name) LIKE '%.stp' AND v_storage_path LIKE '%.stp') OR
        (v_mime_type = 'application/octet-stream' AND lower(v_file_name) LIKE '%.mps' AND v_storage_path LIKE '%.mps'), false) THEN
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

COMMIT;
