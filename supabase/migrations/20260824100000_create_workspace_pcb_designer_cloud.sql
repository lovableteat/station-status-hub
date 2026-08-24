-- PCB Designer production data belongs to the same workspace schema as the
-- account and permission records. Existing account snapshots remain intact;
-- this migration only promotes their newest project/component revisions.
CREATE OR REPLACE FUNCTION workspace.set_pcb_designer_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = workspace, public, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_view(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) IN ('view', 'edit')
      )
  );
$$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_edit(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) = 'edit'
      )
  );
$$;

CREATE TABLE IF NOT EXISTS workspace.pcb_designer_workspaces (
  owner_id uuid PRIMARY KEY REFERENCES workspace.system_users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace.pcb_designer_shared_projects (
  id text PRIMARY KEY,
  payload jsonb,
  project_updated_at timestamptz,
  updated_by uuid REFERENCES workspace.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pcb_designer_shared_projects_state_check CHECK (
    (payload IS NOT NULL AND deleted_at IS NULL AND project_updated_at IS NOT NULL)
    OR (payload IS NULL AND deleted_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS workspace.pcb_designer_shared_library (
  id text PRIMARY KEY,
  payload jsonb,
  component_updated_at timestamptz,
  updated_by uuid REFERENCES workspace.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT pcb_designer_shared_library_state_check CHECK (
    (payload IS NOT NULL AND deleted_at IS NULL AND component_updated_at IS NOT NULL)
    OR (payload IS NULL AND deleted_at IS NOT NULL)
  )
);

ALTER TABLE workspace.pcb_designer_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.pcb_designer_shared_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace.pcb_designer_shared_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE workspace.pcb_designer_workspaces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE workspace.pcb_designer_shared_projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE workspace.pcb_designer_shared_library FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_pcb_designer_workspaces_updated_at
ON workspace.pcb_designer_workspaces;
CREATE TRIGGER set_pcb_designer_workspaces_updated_at
BEFORE UPDATE ON workspace.pcb_designer_workspaces
FOR EACH ROW EXECUTE FUNCTION workspace.set_pcb_designer_updated_at();

DROP TRIGGER IF EXISTS set_pcb_designer_shared_projects_updated_at
ON workspace.pcb_designer_shared_projects;
CREATE TRIGGER set_pcb_designer_shared_projects_updated_at
BEFORE UPDATE ON workspace.pcb_designer_shared_projects
FOR EACH ROW EXECUTE FUNCTION workspace.set_pcb_designer_updated_at();

DROP TRIGGER IF EXISTS set_pcb_designer_shared_library_updated_at
ON workspace.pcb_designer_shared_library;
CREATE TRIGGER set_pcb_designer_shared_library_updated_at
BEFORE UPDATE ON workspace.pcb_designer_shared_library
FOR EACH ROW EXECUTE FUNCTION workspace.set_pcb_designer_updated_at();

CREATE OR REPLACE FUNCTION workspace.pcb_designer_project_revision(
  p_payload jsonb,
  p_fallback timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = workspace, public, pg_temp
AS $$
BEGIN
  RETURN COALESCE(NULLIF(p_payload ->> 'updatedAt', '')::timestamptz, p_fallback);
EXCEPTION WHEN OTHERS THEN
  RETURN p_fallback;
END;
$$;

-- Preserve any pre-table browser snapshot as a recovery source.
INSERT INTO workspace.pcb_designer_workspaces (owner_id, payload)
SELECT id, permissions -> 'pcbDesignerWorkspace'
FROM workspace.system_users
WHERE jsonb_typeof(permissions -> 'pcbDesignerWorkspace') = 'object'
ON CONFLICT (owner_id) DO NOTHING;

-- Promote the newest copy of each project without modifying the source copy.
WITH project_candidates AS (
  SELECT
    project.payload ->> 'id' AS id,
    project.payload,
    account_workspace.owner_id,
    workspace.pcb_designer_project_revision(
      project.payload,
      account_workspace.updated_at
    ) AS project_updated_at,
    row_number() OVER (
      PARTITION BY project.payload ->> 'id'
      ORDER BY
        workspace.pcb_designer_project_revision(
          project.payload,
          account_workspace.updated_at
        ) DESC,
        account_workspace.updated_at DESC
    ) AS revision_rank
  FROM workspace.pcb_designer_workspaces AS account_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(account_workspace.payload -> 'projects') = 'array'
        THEN account_workspace.payload -> 'projects'
      ELSE '[]'::jsonb
    END
  ) AS project(payload)
  WHERE jsonb_typeof(project.payload) = 'object'
    AND NULLIF(project.payload ->> 'id', '') IS NOT NULL
)
INSERT INTO workspace.pcb_designer_shared_projects (
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
WHERE workspace.pcb_designer_shared_projects.deleted_at IS NULL
  AND workspace.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;

-- Promote custom and BOM components into one team catalog. Built-ins continue
-- to be supplied by the application and are not duplicated in the database.
WITH component_candidates AS (
  SELECT
    component.payload ->> 'id' AS id,
    component.payload,
    account_workspace.owner_id,
    workspace.pcb_designer_project_revision(
      account_workspace.payload,
      account_workspace.updated_at
    ) AS component_updated_at,
    row_number() OVER (
      PARTITION BY component.payload ->> 'id'
      ORDER BY account_workspace.updated_at DESC
    ) AS revision_rank
  FROM workspace.pcb_designer_workspaces AS account_workspace
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(account_workspace.payload -> 'library') = 'array'
        THEN account_workspace.payload -> 'library'
      ELSE '[]'::jsonb
    END
  ) AS component(payload)
  WHERE jsonb_typeof(component.payload) = 'object'
    AND COALESCE(component.payload ->> 'source', '') <> 'built-in'
    AND NULLIF(component.payload ->> 'id', '') IS NOT NULL
)
INSERT INTO workspace.pcb_designer_shared_library (
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
WHERE workspace.pcb_designer_shared_library.deleted_at IS NULL
  AND workspace.pcb_designer_shared_library.component_updated_at <= EXCLUDED.component_updated_at;

CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  personal_payload jsonb;
  shared_projects jsonb;
  deleted_project_ids jsonb;
  shared_revision timestamptz;
  personal_revision timestamptz;
  combined_revision timestamptz;
  active_project_id text;
  result jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT account_workspace.payload
  INTO personal_payload
  FROM workspace.pcb_designer_workspaces AS account_workspace
  WHERE account_workspace.owner_id = p_user_id;

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
  FROM workspace.pcb_designer_shared_projects AS shared;

  active_project_id := personal_payload ->> 'activeProjectId';
  IF active_project_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(shared_projects) AS project(payload)
    WHERE project.payload ->> 'id' = active_project_id
  ) THEN
    active_project_id := shared_projects -> 0 ->> 'id';
  END IF;

  personal_revision := workspace.pcb_designer_project_revision(
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

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  project_payload jsonb;
  project_id text;
  project_revision timestamptz;
  deleted_project_id text;
  personal_payload jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload -> 'projects') <> 'array'
    OR jsonb_typeof(p_payload -> 'templates') <> 'array'
    OR jsonb_typeof(p_payload -> 'library') <> 'array'
    OR octet_length(p_payload::text) > 20 * 1024 * 1024 THEN
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
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by, deleted_at
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
    project_revision := workspace.pcb_designer_project_revision(
      project_payload,
      clock_timestamp()
    );
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by
    )
    VALUES (project_id, project_payload, project_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      project_updated_at = EXCLUDED.project_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE workspace.pcb_designer_shared_projects.deleted_at IS NULL
      AND workspace.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;
  END LOOP;

  personal_payload := jsonb_set(p_payload, '{projects}', '[]'::jsonb, true);
  personal_payload := jsonb_set(
    personal_payload,
    '{remoteDeletions}',
    COALESCE(personal_payload -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', '[]'::jsonb),
    true
  );
  INSERT INTO workspace.pcb_designer_workspaces (owner_id, payload)
  VALUES (p_user_id, personal_payload)
  ON CONFLICT (owner_id) DO UPDATE
  SET payload = EXCLUDED.payload;
END;
$$;

CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_workspace_shared(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  result jsonb;
  shared_library jsonb;
  deleted_library_ids jsonb;
BEGIN
  result := workspace.load_pcb_designer_workspace(p_user_id);
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
  FROM workspace.pcb_designer_shared_library AS shared;

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

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace_shared(
  p_user_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  component_payload jsonb;
  component_id text;
  component_revision timestamptz;
  deleted_component_id text;
BEGIN
  PERFORM workspace.save_pcb_designer_workspace(p_user_id, p_payload);
  component_revision := workspace.pcb_designer_project_revision(
    p_payload,
    clock_timestamp()
  );

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
    INSERT INTO workspace.pcb_designer_shared_library (
      id, payload, component_updated_at, updated_by, deleted_at
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
    WHERE COALESCE(component.value ->> 'source', '') <> 'built-in'
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
    INSERT INTO workspace.pcb_designer_shared_library (
      id, payload, component_updated_at, updated_by
    )
    VALUES (component_id, component_payload, component_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      component_updated_at = EXCLUDED.component_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE workspace.pcb_designer_shared_library.deleted_at IS NULL
      AND workspace.pcb_designer_shared_library.component_updated_at <= EXCLUDED.component_updated_at;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION workspace.set_pcb_designer_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.pcb_designer_can_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.pcb_designer_can_edit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.pcb_designer_project_revision(jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.load_pcb_designer_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.save_pcb_designer_workspace(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.load_pcb_designer_workspace_shared(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.save_pcb_designer_workspace_shared(uuid, jsonb) FROM PUBLIC;

GRANT USAGE ON SCHEMA workspace TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.load_pcb_designer_workspace(uuid)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace(uuid, jsonb)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.load_pcb_designer_workspace_shared(uuid)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.save_pcb_designer_workspace_shared(uuid, jsonb)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
