-- 修復計時功能的所有相關問題

-- 1. 首先檢查並添加基本站點數據（避免 ON CONFLICT 問題）
DO $$
BEGIN
  -- 確保基本站點存在
  IF NOT EXISTS (SELECT 1 FROM test_flow_stations WHERE station_order = 0) THEN
    INSERT INTO public.test_flow_stations (id, station_name, station_order, description, estimated_hours) VALUES
      (gen_random_uuid(), 'Station 0', 0, 'Pre-test setup and preparation', 8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM test_flow_stations WHERE station_order = 1) THEN
    INSERT INTO public.test_flow_stations (id, station_name, station_order, description, estimated_hours) VALUES
      (gen_random_uuid(), 'Station 1', 1, 'Basic functionality tests', 16);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM test_flow_stations WHERE station_order = 2) THEN
    INSERT INTO public.test_flow_stations (id, station_name, station_order, description, estimated_hours) VALUES
      (gen_random_uuid(), 'Station 2', 2, 'Advanced testing and validation', 24);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM test_flow_stations WHERE station_order = 3) THEN
    INSERT INTO public.test_flow_stations (id, station_name, station_order, description, estimated_hours) VALUES
      (gen_random_uuid(), 'Station 3', 3, 'Final inspection and certification', 8);
  END IF;
END $$;

-- 2. 為每個站點添加基本測試項目（如果不存在）
DO $$
DECLARE
  station_record RECORD;
BEGIN
  FOR station_record IN SELECT id, station_name, station_order FROM test_flow_stations ORDER BY station_order
  LOOP
    -- 檢查是否已有測試項目
    IF NOT EXISTS (SELECT 1 FROM test_flow_items WHERE station_id = station_record.id) THEN
      INSERT INTO public.test_flow_items (id, station_id, item_name, item_order, description, estimated_minutes) VALUES
        (gen_random_uuid(), station_record.id, station_record.station_name || ' - Test Item 1', 1, 'Primary test for ' || station_record.station_name, 120),
        (gen_random_uuid(), station_record.id, station_record.station_name || ' - Test Item 2', 2, 'Secondary test for ' || station_record.station_name, 90);
    END IF;
  END LOOP;
END $$;

-- 3. 重新創建或修復觸發器函數
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update the system status when progress changes
  WITH all_stations AS (
    -- Get all stations (0-3) for this system
    SELECT 
      NEW.system_id as system_id,
      ts.id as station_id,
      ts.station_name,
      ts.station_order
    FROM test_flow_stations ts
    WHERE ts.station_order BETWEEN 0 AND 3
  ),
  station_progress AS (
    -- Calculate progress for each station
    SELECT 
      ast.system_id,
      ast.station_id,
      ast.station_name,
      ast.station_order,
      COALESCE(COUNT(tfi.id), 0) as total_items,
      COALESCE(COUNT(CASE WHEN tp.status = 'Done' THEN 1 END), 0) as completed_items,
      CASE 
        WHEN COUNT(tfi.id) = 0 THEN 0  -- No items defined for this station
        WHEN COUNT(tfi.id) = COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) THEN 100
        ELSE ROUND((COUNT(CASE WHEN tp.status = 'Done' THEN 1 END)::decimal / COUNT(tfi.id)) * 100)
      END as completion_percent
    FROM all_stations ast
    LEFT JOIN test_flow_items tfi ON ast.station_id = tfi.station_id
    LEFT JOIN test_progress tp ON tp.system_id = ast.system_id 
      AND tp.station_id = ast.station_id 
      AND tp.item_id = tfi.id
    GROUP BY ast.system_id, ast.station_id, ast.station_name, ast.station_order
  ),
  current_station_calc AS (
    -- Find the current station (first incomplete station)
    SELECT 
      system_id,
      COUNT(*) as total_stations,
      COUNT(CASE WHEN completion_percent = 100 THEN 1 END) as completed_stations,
      AVG(completion_percent) as overall_progress,
      -- Find first station that is not 100% complete
      COALESCE(
        (SELECT station_name 
         FROM station_progress sp2 
         WHERE sp2.system_id = station_progress.system_id 
           AND sp2.completion_percent < 100
         ORDER BY sp2.station_order 
         LIMIT 1),
        'Station 3'  -- If all stations are complete, stay at final station
      ) as current_station
    FROM station_progress
    GROUP BY system_id
  )
  UPDATE test_systems
  SET 
    overall_progress = ROUND(csc.overall_progress),
    current_station = csc.current_station,
    status = CASE 
      WHEN csc.completed_stations = 4 THEN 'Done'
      WHEN csc.completed_stations > 0 THEN 'On-going'
      ELSE 'Not Start'
    END,
    -- Set actual completion time when system becomes 100% complete
    actual_completed_at = CASE 
      WHEN csc.completed_stations = 4 AND csc.overall_progress = 100 AND actual_completed_at IS NULL THEN now()
      ELSE actual_completed_at
    END,
    -- Set actual start time when system first starts (if not already set)
    actual_started_at = CASE 
      WHEN csc.completed_stations > 0 AND actual_started_at IS NULL THEN 
        COALESCE(
          (SELECT MIN(tp.started_at) 
           FROM test_progress tp 
           WHERE tp.system_id = csc.system_id AND tp.started_at IS NOT NULL),
          now()
        )
      ELSE actual_started_at
    END,
    updated_at = now()
  FROM current_station_calc csc
  WHERE test_systems.id = csc.system_id;

  RETURN NEW;
END;
$$;

-- 4. 重新創建計時相關的審計觸發器函數
CREATE OR REPLACE FUNCTION public.log_test_progress_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 只記錄與計時相關的變更
  IF TG_OP = 'INSERT' THEN
    IF NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      INSERT INTO public.test_progress_audit (
        system_id, station_id, item_id, change_type, 
        old_values, new_values, user_id
      ) VALUES (
        NEW.system_id, NEW.station_id, NEW.item_id, 'insert',
        NULL,
        jsonb_build_object(
          'started_at', NEW.started_at,
          'completed_at', NEW.completed_at,
          'status', NEW.status,
          'actual_hours', NEW.actual_hours
        ),
        NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 只有當計時相關欄位發生變化時才記錄
    IF OLD.started_at IS DISTINCT FROM NEW.started_at OR 
       OLD.completed_at IS DISTINCT FROM NEW.completed_at OR
       OLD.status IS DISTINCT FROM NEW.status OR
       OLD.actual_hours IS DISTINCT FROM NEW.actual_hours THEN
      
      INSERT INTO public.test_progress_audit (
        system_id, station_id, item_id, change_type,
        old_values, new_values, user_id
      ) VALUES (
        NEW.system_id, NEW.station_id, NEW.item_id, 'update',
        jsonb_build_object(
          'started_at', OLD.started_at,
          'completed_at', OLD.completed_at,
          'status', OLD.status,
          'actual_hours', OLD.actual_hours
        ),
        jsonb_build_object(
          'started_at', NEW.started_at,
          'completed_at', NEW.completed_at,
          'status', NEW.status,
          'actual_hours', NEW.actual_hours
        ),
        NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.test_progress_audit (
      system_id, station_id, item_id, change_type,
      old_values, new_values, user_id
    ) VALUES (
      OLD.system_id, OLD.station_id, OLD.item_id, 'delete',
      jsonb_build_object(
        'started_at', OLD.started_at,
        'completed_at', OLD.completed_at,
        'status', OLD.status,
        'actual_hours', OLD.actual_hours
      ),
      NULL,
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. 重新創建觸發器
DROP TRIGGER IF EXISTS trigger_update_system_completion ON test_progress;
CREATE TRIGGER trigger_update_system_completion
  AFTER INSERT OR UPDATE OR DELETE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_system_completion_status();

DROP TRIGGER IF EXISTS trigger_log_test_progress_changes ON test_progress;
CREATE TRIGGER trigger_log_test_progress_changes
  AFTER INSERT OR UPDATE OR DELETE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION log_test_progress_changes();