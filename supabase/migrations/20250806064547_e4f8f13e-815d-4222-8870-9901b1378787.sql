-- Fix timing function issues after commit revert
-- Recreate functions and triggers with proper permissions

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_system_status_trigger ON test_progress;
DROP TRIGGER IF EXISTS log_test_progress_trigger ON test_progress;
DROP TRIGGER IF EXISTS record_station_times_trigger ON test_progress;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.update_system_completion_status();
DROP FUNCTION IF EXISTS public.log_test_progress_changes();
DROP FUNCTION IF EXISTS public.record_station_times();

-- Recreate update_system_completion_status function
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update the system status when progress changes
  WITH all_stations AS (
    -- Get all stations (0-3) for this system
    SELECT 
      NEW.system_id as system_id,
      ts.id as station_id,
      ts.station_name,
      ts.station_order
    FROM public.test_flow_stations ts
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
    LEFT JOIN public.test_flow_items tfi ON ast.station_id = tfi.station_id
    LEFT JOIN public.test_progress tp ON tp.system_id = ast.system_id 
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
  UPDATE public.test_systems
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
           FROM public.test_progress tp 
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
$function$;

-- Recreate log_test_progress_changes function
CREATE OR REPLACE FUNCTION public.log_test_progress_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Recreate record_station_times function
CREATE OR REPLACE FUNCTION public.record_station_times()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  station_rec RECORD;
  all_items_done BOOLEAN;
  any_item_started BOOLEAN;
BEGIN
  -- 取得站別資訊
  SELECT * INTO station_rec 
  FROM public.test_flow_stations 
  WHERE id = NEW.station_id;
  
  -- 檢查是否有任何測項開始
  SELECT EXISTS(
    SELECT 1 FROM public.test_progress 
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id 
    AND status IN ('On-going', 'Done')
  ) INTO any_item_started;
  
  -- 檢查是否所有測項都完成
  SELECT NOT EXISTS(
    SELECT 1 FROM public.test_flow_items tfi
    LEFT JOIN public.test_progress tp ON tfi.id = tp.item_id 
      AND tp.system_id = NEW.system_id 
      AND tp.station_id = NEW.station_id
    WHERE tfi.station_id = NEW.station_id
    AND (tp.status IS NULL OR tp.status != 'Done')
  ) INTO all_items_done;
  
  -- 建立或更新記錄
  INSERT INTO public.station_time_records (system_id, station_id, station_name, start_time, end_time)
  VALUES (NEW.system_id, NEW.station_id, station_rec.station_name, NULL, NULL)
  ON CONFLICT (system_id, station_id) 
  DO NOTHING;
  
  -- 記錄開始時間（當第一個測項開始時）
  IF any_item_started THEN
    UPDATE public.station_time_records 
    SET start_time = COALESCE(start_time, now()),
        updated_at = now()
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id;
  END IF;
  
  -- 記錄結束時間（當所有測項完成時）
  IF all_items_done THEN
    UPDATE public.station_time_records 
    SET end_time = COALESCE(end_time, now()),
        updated_at = now()
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Ensure test_progress_audit table exists and has proper RLS
CREATE TABLE IF NOT EXISTS public.test_progress_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id uuid NOT NULL,
  station_id uuid NOT NULL,
  item_id uuid NOT NULL,
  change_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on test_progress_audit
ALTER TABLE public.test_progress_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing RLS policies on test_progress_audit
DROP POLICY IF EXISTS "Allow anonymous access to test_progress_audit" ON public.test_progress_audit;

-- Create RLS policy for test_progress_audit
CREATE POLICY "Allow anonymous access to test_progress_audit" 
ON public.test_progress_audit 
FOR ALL 
USING (true);

-- Recreate triggers
CREATE TRIGGER update_system_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_completion_status();

CREATE TRIGGER log_test_progress_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.log_test_progress_changes();

CREATE TRIGGER record_station_times_trigger
  AFTER INSERT OR UPDATE ON public.test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.record_station_times();