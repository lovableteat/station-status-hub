ALTER TYPE public.page_permission
  ADD VALUE IF NOT EXISTS 'performance_view';
ALTER TYPE public.page_permission
  ADD VALUE IF NOT EXISTS 'performance_edit';

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id text PRIMARY KEY,
  cycle_id text NOT NULL DEFAULT '2026-q3',
  employee_id text,
  employee_name text NOT NULL,
  department text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '工程師',
  reviewer_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in-progress', 'submitted', 'approved')),
  score numeric(5, 2)
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  due_date date,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  self_feedback text NOT NULL DEFAULT '',
  manager_feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_reviews_cycle_id_idx
  ON public.performance_reviews (cycle_id);
CREATE INDEX IF NOT EXISTS performance_reviews_status_idx
  ON public.performance_reviews (status);
CREATE INDEX IF NOT EXISTS performance_reviews_employee_id_idx
  ON public.performance_reviews (employee_id);

ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'performance_reviews'
      AND policyname = 'performance_reviews_access'
  ) THEN
    CREATE POLICY performance_reviews_access
      ON public.performance_reviews
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'performance_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_reviews;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_access_permissions(
  p_user_id uuid,
  p_permissions public.page_permission[],
  p_workspace_access jsonb,
  p_granted_by text DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown system user: %', p_user_id;
  END IF;

  IF jsonb_typeof(p_workspace_access) <> 'object'
     OR NOT (p_workspace_access ?& ARRAY[
       'station-status',
       'material-requests',
       'data-center'
     ])
     OR EXISTS (
       SELECT 1
       FROM jsonb_each_text(p_workspace_access) AS access(key, value)
       WHERE key NOT IN (
         'station-status',
         'material-requests',
         'data-center',
         'pcb-designer',
         'user-management',
         'ai-chat',
         'performance'
       )
          OR value NOT IN ('none', 'view', 'edit')
     ) THEN
    RAISE EXCEPTION 'Invalid workspace access payload';
  END IF;

  DELETE FROM public.user_page_permissions
  WHERE user_id = p_user_id;

  INSERT INTO public.user_page_permissions (user_id, permission, granted_by)
  SELECT p_user_id, permission, NULLIF(p_granted_by, '')
  FROM unnest(
    COALESCE(p_permissions, ARRAY[]::public.page_permission[])
  ) AS permission
  ON CONFLICT (user_id, permission) DO NOTHING;

  UPDATE public.system_users
  SET permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object('workspaceAccess', p_workspace_access)
  WHERE id = p_user_id;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_reviews TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_access_permissions(
  uuid,
  public.page_permission[],
  jsonb,
  text
) TO anon, authenticated;
