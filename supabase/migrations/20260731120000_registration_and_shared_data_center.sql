-- Self-registration stays separate from Supabase Auth until an administrator
-- approves the account. This preserves the legacy password migration path.
ALTER TABLE public.system_users
  ADD COLUMN IF NOT EXISTS registration_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL;

UPDATE public.system_users
SET approved_at = COALESCE(approved_at, created_at)
WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.register_system_user(
  username_input text,
  password_input text,
  display_name_input text
)
RETURNS TABLE(success boolean, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_username text := btrim(COALESCE(username_input, ''));
  normalized_display_name text := btrim(COALESCE(display_name_input, ''));
  password_hash text;
BEGIN
  IF normalized_username = '' OR char_length(normalized_username) > 50 THEN
    RETURN QUERY SELECT false, 'INVALID_USERNAME'::text;
    RETURN;
  END IF;

  IF normalized_display_name = '' OR char_length(normalized_display_name) > 100 THEN
    RETURN QUERY SELECT false, 'INVALID_DISPLAY_NAME'::text;
    RETURN;
  END IF;

  -- Supabase Auth requires six characters when the approved account is first
  -- migrated. No additional strength, symbol, or character-mix rules apply.
  IF char_length(COALESCE(password_input, '')) < 6
     OR char_length(password_input) > 200 THEN
    RETURN QUERY SELECT false, 'INVALID_PASSWORD'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.system_users AS account
    WHERE lower(account.username) = lower(normalized_username)
  ) THEN
    RETURN QUERY SELECT false, 'USERNAME_EXISTS'::text;
    RETURN;
  END IF;

  password_hash := public.hash_password(password_input);

  INSERT INTO public.system_users (
    username,
    password_hash,
    role,
    permissions,
    status,
    display_name,
    created_by,
    registration_requested_at
  ) VALUES (
    normalized_username,
    password_hash,
    'engineer',
    jsonb_build_object(
      'workspaceAccess',
      jsonb_build_object(
        'station-status', 'none',
        'material-requests', 'none',
        'data-center', 'none',
        'pcb-designer', 'none'
      )
    ),
    'pending',
    normalized_display_name,
    'self-registration',
    now()
  );

  RETURN QUERY SELECT true, 'PENDING_APPROVAL'::text;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, 'USERNAME_EXISTS'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.register_system_user(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_system_user(text, text, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_system_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  administrator_id uuid := public.current_system_user_id();
BEGIN
  IF administrator_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.system_users AS administrator
    WHERE administrator.id = administrator_id
      AND administrator.status = 'active'
      AND administrator.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Administrator permission required';
  END IF;

  UPDATE public.system_users
  SET status = 'active',
      approved_at = now(),
      approved_by = administrator_id
  WHERE id = p_user_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_system_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_system_user(uuid)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.data_center_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  category text NOT NULL DEFAULT '未分類' CHECK (char_length(btrim(category)) BETWEEN 1 AND 60),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_center_project_document_is_object
    CHECK (jsonb_typeof(document) = 'object'),
  CONSTRAINT data_center_project_document_size
    CHECK (octet_length(document::text) <= 20 * 1024 * 1024)
);

CREATE INDEX IF NOT EXISTS data_center_projects_category_idx
  ON public.data_center_projects (category, name)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_data_center_projects_updated_at
  ON public.data_center_projects;
CREATE TRIGGER set_data_center_projects_updated_at
BEFORE UPDATE ON public.data_center_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_view_data_center_projects()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users AS account
    WHERE account.auth_user_id = auth.uid()
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(account.permissions #>> '{workspaceAccess,data-center}', 'none') IN ('view', 'edit')
        OR EXISTS (
          SELECT 1
          FROM public.user_page_permissions AS access
          WHERE access.user_id = account.id
            AND access.permission::text IN ('data_center_view', 'data_center_edit')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_data_center_projects()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users AS account
    WHERE account.auth_user_id = auth.uid()
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(account.permissions #>> '{workspaceAccess,data-center}', 'none') = 'edit'
        OR EXISTS (
          SELECT 1
          FROM public.user_page_permissions AS access
          WHERE access.user_id = account.id
            AND access.permission::text = 'data_center_edit'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_data_center_projects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_data_center_projects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_data_center_projects()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_data_center_projects()
  TO authenticated, service_role;

ALTER TABLE public.data_center_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_center_projects FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_center_projects TO authenticated;

DROP POLICY IF EXISTS "Data-center members can read shared projects"
  ON public.data_center_projects;
CREATE POLICY "Data-center members can read shared projects"
  ON public.data_center_projects FOR SELECT TO authenticated
  USING (public.can_view_data_center_projects());

DROP POLICY IF EXISTS "Data-center editors can create shared projects"
  ON public.data_center_projects;
CREATE POLICY "Data-center editors can create shared projects"
  ON public.data_center_projects FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_data_center_projects()
    AND created_by = public.current_system_user_id()
    AND updated_by = public.current_system_user_id()
  );

DROP POLICY IF EXISTS "Data-center editors can update shared projects"
  ON public.data_center_projects;
CREATE POLICY "Data-center editors can update shared projects"
  ON public.data_center_projects FOR UPDATE TO authenticated
  USING (public.can_edit_data_center_projects())
  WITH CHECK (
    public.can_edit_data_center_projects()
    AND updated_by = public.current_system_user_id()
  );

DROP POLICY IF EXISTS "Data-center editors can delete shared projects"
  ON public.data_center_projects;
CREATE POLICY "Data-center editors can delete shared projects"
  ON public.data_center_projects FOR DELETE TO authenticated
  USING (public.can_edit_data_center_projects());

INSERT INTO public.data_center_projects (
  project_key,
  name,
  category,
  description
) VALUES (
  'main-data-center',
  '主要資料中心',
  '正式環境',
  '全員共用的 Data Center 規劃專案'
)
ON CONFLICT (project_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'data_center_projects'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.data_center_projects;
  END IF;
END;
$$;
