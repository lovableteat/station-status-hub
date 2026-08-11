BEGIN;

ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS avatar_path text;

COMMENT ON COLUMN public.system_users.avatar_path IS
  'Public user-avatars bucket path controlled by the account owner.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can view profile avatars" ON storage.objects;
CREATE POLICY "Authenticated users can view profile avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'user-avatars');

DROP POLICY IF EXISTS "Users can upload their own profile avatar" ON storage.objects;
CREATE POLICY "Users can upload their own profile avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = public.current_system_user_id()::text
  AND name ~* (
    '^' || public.current_system_user_id()::text ||
    '/[0-9]{10,}-[0-9a-f-]{8,}\.(jpg|png|webp)$'
  )
);

DROP POLICY IF EXISTS "Users can replace their own profile avatar" ON storage.objects;
CREATE POLICY "Users can replace their own profile avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = public.current_system_user_id()::text
)
WITH CHECK (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = public.current_system_user_id()::text
  AND name ~* (
    '^' || public.current_system_user_id()::text ||
    '/[0-9]{10,}-[0-9a-f-]{8,}\.(jpg|png|webp)$'
  )
);

DROP POLICY IF EXISTS "Users can delete their own profile avatar" ON storage.objects;
CREATE POLICY "Users can delete their own profile avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = public.current_system_user_id()::text
);

CREATE OR REPLACE FUNCTION public.set_own_avatar_path(p_avatar_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_system_user_id();
  v_avatar_path text := nullif(btrim(coalesce(p_avatar_path, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated account required';
  END IF;

  IF v_avatar_path IS NOT NULL AND (
    split_part(v_avatar_path, '/', 1) <> v_user_id::text
    OR v_avatar_path !~* ('^' || v_user_id::text || '/[0-9]{10,}-[0-9a-f-]{8,}\.(jpg|png|webp)$')
  ) THEN
    RAISE EXCEPTION 'Invalid avatar path';
  END IF;

  IF v_avatar_path IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM storage.objects AS avatar
    WHERE avatar.bucket_id = 'user-avatars'
      AND avatar.name = v_avatar_path
  ) THEN
    RAISE EXCEPTION 'Avatar upload was not found';
  END IF;

  UPDATE public.system_users
  SET avatar_path = v_avatar_path,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN v_avatar_path;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_avatar_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_avatar_path(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_current_system_user();
CREATE FUNCTION public.get_current_system_user()
RETURNS TABLE(
  user_id uuid,
  username varchar,
  role varchar,
  display_name varchar,
  status varchar,
  avatar_path text
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
    users.status,
    users.avatar_path
  FROM public.system_users AS users
  WHERE users.auth_user_id = auth.uid()
    AND users.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_system_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_system_user() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_active_collaboration_members();
CREATE FUNCTION public.list_active_collaboration_members()
RETURNS TABLE(
  user_id uuid,
  username varchar,
  display_name varchar,
  role varchar,
  avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    account.id,
    account.username,
    coalesce(account.display_name, account.username)::varchar,
    account.role,
    account.avatar_path
  FROM public.system_users AS account
  WHERE auth.uid() IS NOT NULL
    AND account.status = 'active'
  ORDER BY lower(coalesce(account.display_name, account.username)), lower(account.username);
$$;

REVOKE ALL ON FUNCTION public.list_active_collaboration_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_collaboration_members()
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_direct_chat_threads();
CREATE FUNCTION public.list_direct_chat_threads()
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
    other_user.avatar_path,
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

COMMIT;
