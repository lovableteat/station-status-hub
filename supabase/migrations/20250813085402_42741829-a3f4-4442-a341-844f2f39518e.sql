-- 修復刪除功能：完整處理所有相關表的級聯刪除
-- 首先檢查是否存在station_time_analytics表
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
        -- 如果表存在，先刪除System32, System33的相關記錄
        DELETE FROM public.station_time_analytics WHERE system_id IN (
            SELECT id FROM public.test_systems WHERE system_name IN ('System32', 'System33')
        );
    END IF;
END $$;

-- 更新delete_test_system函數以包含station_time_analytics的清理
CREATE OR REPLACE FUNCTION public.delete_test_system(p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- 清理station_time_analytics表（如果存在）
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
    DELETE FROM public.station_time_analytics WHERE system_id = p_system_id;
  END IF;

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
$function$;

-- 現在刪除System32和System33
DELETE FROM public.test_systems WHERE system_name IN ('System32', 'System33');