-- PCB projects are team documents. Templates, library items and the active
-- project selection remain account-specific in pcb_designer_workspaces.
CREATE TABLE IF NOT EXISTS public.pcb_designer_shared_projects (
  id text PRIMARY KEY,
  payload jsonb,
  project_updated_at timestamptz,
  updated_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pcb_designer_shared_projects_state_check CHECK (
    (payload IS NOT NULL AND deleted_at IS NULL AND project_updated_at IS NOT NULL)
    OR (payload IS NULL AND deleted_at IS NOT NULL)
  )
);

ALTER TABLE public.pcb_designer_shared_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pcb_designer_shared_projects FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_pcb_designer_shared_projects_updated_at
ON public.pcb_designer_shared_projects;
CREATE TRIGGER set_pcb_designer_shared_projects_updated_at
BEFORE UPDATE ON public.pcb_designer_shared_projects
FOR EACH ROW EXECUTE FUNCTION public.set_pcb_designer_updated_at();

CREATE OR REPLACE FUNCTION public.pcb_designer_project_revision(
  p_payload jsonb,
  p_fallback timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(NULLIF(p_payload ->> 'updatedAt', '')::timestamptz, p_fallback);
EXCEPTION WHEN OTHERS THEN
  RETURN p_fallback;
END;
$$;

-- Promote every existing account project. If the same project was present in
-- more than one account snapshot, keep the project with the newest revision.
WITH project_candidates AS (
  SELECT
    project.payload ->> 'id' AS id,
    project.payload,
    workspace.owner_id,
    public.pcb_designer_project_revision(project.payload, workspace.updated_at) AS project_updated_at,
    row_number() OVER (
      PARTITION BY project.payload ->> 'id'
      ORDER BY
        public.pcb_designer_project_revision(project.payload, workspace.updated_at) DESC,
        workspace.updated_at DESC
    ) AS revision_rank
  FROM public.pcb_designer_workspaces AS workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(workspace.payload -> 'projects') = 'array'
        THEN workspace.payload -> 'projects'
      ELSE '[]'::jsonb
    END
  ) AS project(payload)
  WHERE jsonb_typeof(project.payload) = 'object'
    AND NULLIF(project.payload ->> 'id', '') IS NOT NULL
)
INSERT INTO public.pcb_designer_shared_projects (
  id,
  payload,
  project_updated_at,
  updated_by
)
SELECT id, payload, project_updated_at, owner_id
FROM project_candidates
WHERE revision_rank = 1
ON CONFLICT (id) DO UPDATE
SET
  payload = EXCLUDED.payload,
  project_updated_at = EXCLUDED.project_updated_at,
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL
WHERE public.pcb_designer_shared_projects.deleted_at IS NULL
  AND public.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;

CREATE OR REPLACE FUNCTION public.load_pcb_designer_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed boolean;
  personal_payload jsonb;
  shared_projects jsonb;
  deleted_project_ids jsonb;
  shared_revision timestamptz;
  personal_revision timestamptz;
  combined_revision timestamptz;
  active_project_id text;
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
  INTO personal_payload
  FROM public.pcb_designer_workspaces AS workspace
  WHERE workspace.owner_id = p_user_id;

  personal_payload := COALESCE(
    personal_payload,
    jsonb_build_object(
      'projects', '[]'::jsonb,
      'templates', '[]'::jsonb,
      'library', '[]'::jsonb,
      'activeProjectId', NULL,
      'modelAssets', '{}'::jsonb,
      'pendingPlacementsByProject', '{}'::jsonb,
      'remoteDeletions', jsonb_build_object(
        'projects', '[]'::jsonb,
        'templates', '[]'::jsonb,
        'library', '[]'::jsonb
      ),
      'updatedAt', '1970-01-01T00:00:00.000Z'
    )
  );

  SELECT
    COALESCE(
      jsonb_agg(shared.payload ORDER BY shared.project_updated_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NULL),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(to_jsonb(shared.id) ORDER BY shared.deleted_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NOT NULL),
      '[]'::jsonb
    ),
    MAX(COALESCE(shared.deleted_at, shared.project_updated_at))
  INTO shared_projects, deleted_project_ids, shared_revision
  FROM public.pcb_designer_shared_projects AS shared;

  active_project_id := personal_payload ->> 'activeProjectId';
  IF active_project_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(shared_projects) AS project(payload)
    WHERE project.payload ->> 'id' = active_project_id
  ) THEN
    active_project_id := shared_projects -> 0 ->> 'id';
  END IF;

  personal_revision := public.pcb_designer_project_revision(
    personal_payload,
    '1970-01-01 00:00:00+00'::timestamptz
  );
  combined_revision := GREATEST(
    personal_revision,
    COALESCE(shared_revision, '1970-01-01 00:00:00+00'::timestamptz)
  );

  result := jsonb_set(personal_payload, '{projects}', shared_projects, true);
  result := jsonb_set(
    result,
    '{activeProjectId}',
    COALESCE(to_jsonb(active_project_id), 'null'::jsonb),
    true
  );
  result := jsonb_set(
    result,
    '{remoteDeletions}',
    COALESCE(result -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', deleted_project_ids),
    true
  );
  result := jsonb_set(result, '{updatedAt}', to_jsonb(combined_revision::text), true);

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
  project_payload jsonb;
  project_id text;
  project_revision timestamptz;
  deleted_project_id text;
  personal_payload jsonb;
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

  FOR deleted_project_id IN
    SELECT deleted_id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_payload #> '{remoteDeletions,projects}') = 'array'
          THEN p_payload #> '{remoteDeletions,projects}'
        ELSE '[]'::jsonb
      END
    ) AS deleted(deleted_id)
    WHERE NULLIF(deleted_id, '') IS NOT NULL
  LOOP
    INSERT INTO public.pcb_designer_shared_projects (
      id,
      payload,
      project_updated_at,
      updated_by,
      deleted_at
    )
    VALUES (deleted_project_id, NULL, NULL, p_user_id, clock_timestamp())
    ON CONFLICT (id) DO UPDATE
    SET
      payload = NULL,
      project_updated_at = NULL,
      updated_by = EXCLUDED.updated_by,
      deleted_at = EXCLUDED.deleted_at;
  END LOOP;

  FOR project_payload IN
    SELECT project.value
    FROM jsonb_array_elements(p_payload -> 'projects') AS project(value)
  LOOP
    project_id := NULLIF(project_payload ->> 'id', '');
    IF project_id IS NULL OR jsonb_typeof(project_payload) <> 'object' THEN
      RAISE EXCEPTION 'Invalid PCB project payload';
    END IF;

    project_revision := public.pcb_designer_project_revision(
      project_payload,
      clock_timestamp()
    );
    INSERT INTO public.pcb_designer_shared_projects (
      id,
      payload,
      project_updated_at,
      updated_by
    )
    VALUES (project_id, project_payload, project_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      project_updated_at = EXCLUDED.project_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE public.pcb_designer_shared_projects.deleted_at IS NULL
      AND public.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;
  END LOOP;

  personal_payload := jsonb_set(p_payload, '{projects}', '[]'::jsonb, true);
  personal_payload := jsonb_set(
    personal_payload,
    '{remoteDeletions}',
    COALESCE(personal_payload -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', '[]'::jsonb),
    true
  );

  INSERT INTO public.pcb_designer_workspaces (owner_id, payload)
  VALUES (p_user_id, personal_payload)
  ON CONFLICT (owner_id) DO UPDATE
  SET payload = EXCLUDED.payload;
END;
$$;

-- Account rows no longer need a private copy of every shared project.
UPDATE public.pcb_designer_workspaces
SET payload = jsonb_set(
  jsonb_set(payload, '{projects}', '[]'::jsonb, true),
  '{remoteDeletions}',
  COALESCE(payload -> 'remoteDeletions', '{}'::jsonb)
    || jsonb_build_object('projects', '[]'::jsonb),
  true
);

REVOKE ALL ON FUNCTION public.pcb_designer_project_revision(jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.load_pcb_designer_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_pcb_designer_workspace(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_pcb_designer_workspace(uuid)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pcb_designer_workspace(uuid, jsonb)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
