-- Store compressed PCB STEP meshes separately from workspace JSON so the same
-- model-backed component can render on every authorized computer.
CREATE TABLE IF NOT EXISTS workspace.pcb_designer_model_assets (
  id text PRIMARY KEY,
  metadata jsonb NOT NULL,
  compressed_payload bytea NOT NULL,
  updated_by uuid REFERENCES workspace.system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcb_designer_model_assets_id_check CHECK (
    length(id) BETWEEN 1 AND 200
  ),
  CONSTRAINT pcb_designer_model_assets_metadata_check CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT pcb_designer_model_assets_size_check CHECK (
    octet_length(compressed_payload) BETWEEN 1 AND 67108864
  )
);

ALTER TABLE workspace.pcb_designer_model_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE workspace.pcb_designer_model_assets FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_pcb_designer_model_assets_updated_at
ON workspace.pcb_designer_model_assets;
CREATE TRIGGER set_pcb_designer_model_assets_updated_at
BEFORE UPDATE ON workspace.pcb_designer_model_assets
FOR EACH ROW EXECUTE FUNCTION workspace.set_pcb_designer_updated_at();

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_model_asset(
  p_user_id uuid,
  p_asset_id text,
  p_metadata jsonb,
  p_payload_base64 text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  decoded_payload bytea;
BEGIN
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF NULLIF(trim(p_asset_id), '') IS NULL
    OR length(p_asset_id) > 200
    OR jsonb_typeof(p_metadata) <> 'object'
    OR NULLIF(p_payload_base64, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid PCB model asset';
  END IF;

  decoded_payload := decode(regexp_replace(p_payload_base64, '\s', '', 'g'), 'base64');
  IF octet_length(decoded_payload) NOT BETWEEN 1 AND 67108864 THEN
    RAISE EXCEPTION 'PCB model asset exceeds the 64 MB compressed limit';
  END IF;

  INSERT INTO workspace.pcb_designer_model_assets (
    id,
    metadata,
    compressed_payload,
    updated_by
  )
  VALUES (
    p_asset_id,
    p_metadata,
    decoded_payload,
    p_user_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    metadata = EXCLUDED.metadata,
    compressed_payload = EXCLUDED.compressed_payload,
    updated_by = EXCLUDED.updated_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_model_asset(
  p_user_id uuid,
  p_asset_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = workspace, public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT jsonb_build_object(
    'metadata', asset.metadata,
    'payloadBase64', replace(encode(asset.compressed_payload, 'base64'), E'\n', '')
  )
  INTO result
  FROM workspace.pcb_designer_model_assets AS asset
  WHERE asset.id = p_asset_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION workspace.save_pcb_designer_model_asset(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace.load_pcb_designer_model_asset(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.save_pcb_designer_model_asset(uuid, text, jsonb, text)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION workspace.load_pcb_designer_model_asset(uuid, text)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
