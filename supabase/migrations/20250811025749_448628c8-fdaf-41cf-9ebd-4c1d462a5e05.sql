-- Ensure new permissions for 比對中心 exist in enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'page_permission' AND n.nspname = 'public'
  ) THEN
    -- Safety: if enum doesn't exist (unlikely), create with all known values
    CREATE TYPE public.page_permission AS ENUM (
      'dashboard_view','dashboard_edit',
      'test_tracker_view','test_tracker_edit',
      'issues_view','issues_edit',
      'production_view','production_edit',
      'data_center_view','data_center_edit',
      'tools_view','tools_edit',
      'admin_view','admin_edit',
      'comparison_view','comparison_edit'
    );
  ELSE
    -- Add the missing values if needed
    BEGIN
      ALTER TYPE public.page_permission ADD VALUE IF NOT EXISTS 'comparison_view';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
    BEGIN
      ALTER TYPE public.page_permission ADD VALUE IF NOT EXISTS 'comparison_edit';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END $$;

-- Ensure table exists with needed columns and permissive policies (since app uses local auth)
CREATE TABLE IF NOT EXISTS public.user_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission public.page_permission NOT NULL,
  granted_at timestamptz DEFAULT now(),
  granted_by varchar(100)
);

-- Uniqueness to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname='public' AND tablename='user_page_permissions' AND indexname='idx_user_page_permissions_user_perm'
  ) THEN
    CREATE UNIQUE INDEX idx_user_page_permissions_user_perm 
      ON public.user_page_permissions (user_id, permission);
  END IF;
END $$;

-- Enable RLS and allow anonymous access (to match existing project model)
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='user_page_permissions' AND policyname='Allow anonymous access to user_page_permissions'
  ) THEN
    CREATE POLICY "Allow anonymous access to user_page_permissions"
    ON public.user_page_permissions
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;