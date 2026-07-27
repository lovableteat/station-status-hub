CREATE TABLE IF NOT EXISTS public.pcb_designer_workspaces (
  owner_id uuid PRIMARY KEY REFERENCES public.system_users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pcb_designer_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pcb_designer_workspaces FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_pcb_designer_workspaces_updated_at
ON public.pcb_designer_workspaces;
CREATE TRIGGER set_pcb_designer_workspaces_updated_at
BEFORE UPDATE ON public.pcb_designer_workspaces
FOR EACH ROW EXECUTE FUNCTION public.set_pcb_designer_updated_at();

-- Existing accounts predate the PCB workspace key. Preserve their effective
-- Data-center access until an administrator explicitly changes PCB access.
UPDATE public.system_users
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{workspaceAccess,pcb-designer}',
  COALESCE(
    permissions #> '{workspaceAccess,data-center}',
    '"none"'::jsonb
  ),
  true
)
WHERE NOT (COALESCE(permissions #> '{workspaceAccess}', '{}'::jsonb) ? 'pcb-designer');

-- Move drafts written by the compatibility client into the dedicated table.
INSERT INTO public.pcb_designer_workspaces (owner_id, payload)
SELECT id, permissions -> 'pcbDesignerWorkspace'
FROM public.system_users
WHERE jsonb_typeof(permissions -> 'pcbDesignerWorkspace') = 'object'
ON CONFLICT (owner_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.load_pcb_designer_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed boolean;
  result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          account.permissions #>> '{workspaceAccess,data-center}',
          'none'
        ) IN ('view', 'edit')
        OR EXISTS (
          SELECT 1
          FROM public.user_page_permissions AS page_access
          WHERE page_access.user_id = account.id
            AND page_access.permission::text IN (
              'pcb_designer_view',
              'pcb_designer_edit'
            )
        )
      )
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT workspace.payload
  INTO result
  FROM public.pcb_designer_workspaces AS workspace
  WHERE workspace.owner_id = p_user_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_pcb_designer_workspace(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          account.permissions #>> '{workspaceAccess,data-center}',
          'none'
        ) = 'edit'
        OR EXISTS (
          SELECT 1
          FROM public.user_page_permissions AS page_access
          WHERE page_access.user_id = account.id
            AND page_access.permission::text = 'pcb_designer_edit'
        )
      )
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;

  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload -> 'projects') <> 'array'
    OR jsonb_typeof(p_payload -> 'templates') <> 'array'
    OR jsonb_typeof(p_payload -> 'library') <> 'array'
    OR octet_length(p_payload::text) > 5 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Invalid or oversized PCB workspace payload';
  END IF;

  INSERT INTO public.pcb_designer_workspaces (owner_id, payload)
  VALUES (p_user_id, p_payload)
  ON CONFLICT (owner_id) DO UPDATE
  SET payload = EXCLUDED.payload;
END;
$$;

REVOKE ALL ON FUNCTION public.load_pcb_designer_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_pcb_designer_workspace(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_pcb_designer_workspace(uuid)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pcb_designer_workspace(uuid, jsonb)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
