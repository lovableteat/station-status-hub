BEGIN;

-- A self chat uses the existing direct key and a single unique membership.

CREATE OR REPLACE FUNCTION workspace.start_direct_chat(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id uuid := workspace.current_system_user_id();
  v_direct_key text;
  v_thread_id uuid;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated system user required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workspace.system_users
    WHERE id = p_other_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active recipient is required';
  END IF;

  v_direct_key := least(v_current_user_id::text, p_other_user_id::text)
    || ':' || greatest(v_current_user_id::text, p_other_user_id::text);

  INSERT INTO workspace.chat_threads (kind, direct_key, created_by)
  VALUES ('direct', v_direct_key, v_current_user_id)
  ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL
  DO UPDATE SET direct_key = excluded.direct_key
  RETURNING id INTO v_thread_id;

  INSERT INTO workspace.chat_members (thread_id, user_id)
  VALUES
    (v_thread_id, v_current_user_id),
    (v_thread_id, p_other_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_thread_id;
END;
$$;

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
    ON other_member.thread_id = threads.id
   AND (
     other_member.user_id <> viewer.id
     OR threads.direct_key = viewer.id::text || ':' || viewer.id::text
   )
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
    AND (
      own_clear.cleared_at IS NULL
      OR latest.id IS NOT NULL
      OR threads.direct_key = viewer.id::text || ':' || viewer.id::text
    )
  ORDER BY coalesce(latest.created_at, threads.created_at) DESC;
$$;

-- Keep the legacy API on the same membership-checked functions.
CREATE OR REPLACE FUNCTION public.start_direct_chat(p_other_user_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT workspace.start_direct_chat(p_other_user_id);
$$;

CREATE OR REPLACE FUNCTION public.list_direct_chat_threads()
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
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM workspace.list_direct_chat_threads();
$$;

REVOKE ALL ON FUNCTION workspace.start_direct_chat(uuid), workspace.list_direct_chat_threads(),
  public.start_direct_chat(uuid), public.list_direct_chat_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workspace.start_direct_chat(uuid), workspace.list_direct_chat_threads(),
  public.start_direct_chat(uuid), public.list_direct_chat_threads() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
