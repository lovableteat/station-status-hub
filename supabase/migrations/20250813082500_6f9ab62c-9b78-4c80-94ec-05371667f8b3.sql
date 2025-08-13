-- Create a transactional, server-side cascade delete for test systems
-- This avoids FK constraint errors and ensures all related records are cleaned up atomically

CREATE OR REPLACE FUNCTION public.delete_test_system(p_system_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Verify the system exists
  SELECT EXISTS(
    SELECT 1 FROM public.test_systems WHERE id = p_system_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Start a single transaction-like block (functions run in a transaction by default)

  -- 1) Issues and attachments linked to this system
  DELETE FROM public.issue_attachments ia
  USING public.issues i
  WHERE ia.issue_id = i.id
    AND i.system_id = p_system_id;

  DELETE FROM public.issues i
  WHERE i.system_id = p_system_id;

  -- 2) Dashboard exclusions
  DELETE FROM public.dashboard_item_exclusions die
  WHERE die.system_id = p_system_id;

  -- 3) Test progress audit and records
  DELETE FROM public.test_progress_audit tpa
  WHERE tpa.system_id = p_system_id;

  DELETE FROM public.test_progress tp
  WHERE tp.system_id = p_system_id;

  -- 4) Station timing records/settings
  DELETE FROM public.station_time_records str
  WHERE str.system_id = p_system_id;

  DELETE FROM public.station_time_settings sts
  WHERE sts.system_id = p_system_id;

  -- 5) Finally delete the system itself
  DELETE FROM public.test_systems ts
  WHERE ts.id = p_system_id;
END;
$$;

-- Permissions: allow RPC usage from client
GRANT EXECUTE ON FUNCTION public.delete_test_system(uuid) TO anon, authenticated;