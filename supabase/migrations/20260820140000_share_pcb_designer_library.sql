-- Library components are team resources just like PCB projects. Keep the
-- account workspace as a compatibility cache, but serve custom/BOM records
-- from one shared catalog so another operator can place the same component.
CREATE TABLE IF NOT EXISTS public.pcb_designer_shared_library (
  id text PRIMARY KEY,
  payload jsonb,
  component_updated_at timestamptz,
  updated_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pcb_designer_shared_library_state_check CHECK (
    (payload IS NOT NULL AND deleted_at IS NULL AND component_updated_at IS NOT NULL)
    OR (payload IS NULL AND deleted_at IS NOT NULL)
  )
);

ALTER TABLE public.pcb_designer_shared_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pcb_designer_shared_library FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_pcb_designer_shared_library_updated_at
ON public.pcb_designer_shared_library;
CREATE TRIGGER set_pcb_designer_shared_library_updated_at
BEFORE UPDATE ON public.pcb_designer_shared_library
FOR EACH ROW EXECUTE FUNCTION public.set_pcb_designer_updated_at();

WITH component_candidates AS (
  SELECT
    component.payload ->> 'id' AS id,
    component.payload,
    workspace.owner_id,
    public.pcb_designer_project_revision(workspace.payload, workspace.updated_at) AS component_updated_at,
    row_number() OVER (
      PARTITION BY component.payload ->> 'id'
      ORDER BY workspace.updated_at DESC
    ) AS revision_rank
  FROM public.pcb_designer_workspaces AS workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(workspace.payload -> 'library') = 'array'
        THEN workspace.payload -> 'library'
      ELSE '[]'::jsonb
    END
  ) AS component(payload)
  WHERE jsonb_typeof(component.payload) = 'object'
    AND component.payload ->> 'source' <> 'built-in'
    AND NULLIF(component.payload ->> 'id', '') IS NOT NULL
)
INSERT INTO public.pcb_designer_shared_library (
  id,
  payload,
  component_updated_at,
  updated_by
)
SELECT id, payload, component_updated_at, owner_id
FROM component_candidates
WHERE revision_rank = 1
ON CONFLICT (id) DO UPDATE
SET
  payload = EXCLUDED.payload,
  component_updated_at = EXCLUDED.component_updated_at,
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL
WHERE public.pcb_designer_shared_library.deleted_at IS NULL
  AND public.pcb_designer_shared_library.component_updated_at <= EXCLUDED.component_updated_at;

CREATE OR REPLACE FUNCTION public.load_pcb_designer_workspace_shared(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  shared_library jsonb;
  deleted_library_ids jsonb;
BEGIN
  result := public.load_pcb_designer_workspace(p_user_id);

  SELECT
    COALESCE(
      jsonb_agg(shared.payload ORDER BY shared.component_updated_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NULL),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(to_jsonb(shared.id) ORDER BY shared.deleted_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NOT NULL),
      '[]'::jsonb
    )
  INTO shared_library, deleted_library_ids
  FROM public.pcb_designer_shared_library AS shared;

  result := jsonb_set(result, '{library}', shared_library, true);
  result := jsonb_set(
    result,
    '{remoteDeletions}',
    COALESCE(result -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('library', deleted_library_ids),
    true
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_pcb_designer_workspace_shared(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  component_payload jsonb;
  component_id text;
  component_revision timestamptz;
  deleted_component_id text;
BEGIN
  -- Reuse the existing permission and payload validation path, and keep the
  -- account cache updated for older clients during the migration window.
  PERFORM public.save_pcb_designer_workspace(p_user_id, p_payload);
  component_revision := public.pcb_designer_project_revision(p_payload, clock_timestamp());

  FOR deleted_component_id IN
    SELECT deleted_id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_payload #> '{remoteDeletions,library}') = 'array'
          THEN p_payload #> '{remoteDeletions,library}'
        ELSE '[]'::jsonb
      END
    ) AS deleted(deleted_id)
    WHERE NULLIF(deleted_id, '') IS NOT NULL
  LOOP
    INSERT INTO public.pcb_designer_shared_library (
      id,
      payload,
      component_updated_at,
      updated_by,
      deleted_at
    )
    VALUES (deleted_component_id, NULL, NULL, p_user_id, clock_timestamp())
    ON CONFLICT (id) DO UPDATE
    SET
      payload = NULL,
      component_updated_at = NULL,
      updated_by = EXCLUDED.updated_by,
      deleted_at = EXCLUDED.deleted_at;
  END LOOP;

  FOR component_payload IN
    SELECT component.value
    FROM jsonb_array_elements(p_payload -> 'library') AS component(value)
    WHERE component.value ->> 'source' <> 'built-in'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(p_payload #> '{remoteDeletions,library}') = 'array'
              THEN p_payload #> '{remoteDeletions,library}'
            ELSE '[]'::jsonb
          END
        ) AS deleted(deleted_id)
        WHERE deleted.deleted_id = component.value ->> 'id'
      )
  LOOP
    component_id := NULLIF(component_payload ->> 'id', '');
    IF component_id IS NULL OR jsonb_typeof(component_payload) <> 'object' THEN
      RAISE EXCEPTION 'Invalid PCB library component payload';
    END IF;

    INSERT INTO public.pcb_designer_shared_library (
      id,
      payload,
      component_updated_at,
      updated_by
    )
    VALUES (component_id, component_payload, component_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      component_updated_at = EXCLUDED.component_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE public.pcb_designer_shared_library.deleted_at IS NULL
      AND public.pcb_designer_shared_library.component_updated_at <= EXCLUDED.component_updated_at;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.load_pcb_designer_workspace_shared(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_pcb_designer_workspace_shared(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_pcb_designer_workspace_shared(uuid)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pcb_designer_workspace_shared(uuid, jsonb)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
