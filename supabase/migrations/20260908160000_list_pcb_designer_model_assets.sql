-- Return lightweight STEP metadata so clients can rebuild a missing shared
-- library index without downloading every compressed mesh first.
CREATE OR REPLACE FUNCTION workspace.list_pcb_designer_model_assets(
  p_user_id uuid
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

  SELECT COALESCE(jsonb_agg(asset.metadata ORDER BY asset.updated_at DESC), '[]'::jsonb)
  INTO result
  FROM workspace.pcb_designer_model_assets AS asset;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION workspace.list_pcb_designer_model_assets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.list_pcb_designer_model_assets(uuid)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
