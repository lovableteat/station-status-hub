-- Fix security issues: Add search_path to functions for security hardening

-- Fix function search_path for hash_password
CREATE OR REPLACE FUNCTION public.hash_password(password text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT crypt(password, gen_salt('bf', 10));
$function$;

-- Fix function search_path for verify_password
CREATE OR REPLACE FUNCTION public.verify_password(password text, hash text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT crypt(password, hash) = hash;
$function$;

-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix function search_path for update_station_actual_completion_time
CREATE OR REPLACE FUNCTION public.update_station_actual_completion_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  -- 當測試進度變為完成時，更新站點的實際完成時間
  IF NEW.status = 'Done' AND (OLD.status IS NULL OR OLD.status != 'Done') AND NEW.completed_at IS NOT NULL THEN
    -- 更新或插入站點時間設定
    INSERT INTO public.station_time_settings (system_id, station_id, actual_completion_time)
    VALUES (NEW.system_id, NEW.station_id, NEW.completed_at)
    ON CONFLICT (system_id, station_id) 
    DO UPDATE SET 
      actual_completion_time = CASE 
        WHEN station_time_settings.actual_completion_time IS NULL 
             OR NEW.completed_at > station_time_settings.actual_completion_time 
        THEN NEW.completed_at
        ELSE station_time_settings.actual_completion_time
      END,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix function search_path for authenticate_user
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
 RETURNS TABLE(user_id uuid, username character varying, role character varying, display_name character varying, success boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  user_record record;
BEGIN
  -- Get user record
  SELECT * INTO user_record
  FROM public.system_users 
  WHERE system_users.username = username_input 
    AND system_users.status = 'active';
  
  -- Check if user exists and password is correct
  IF user_record IS NOT NULL AND public.verify_password(password_input, user_record.password_hash) THEN
    RETURN QUERY SELECT 
      user_record.id as user_id,
      user_record.username::character varying(50) as username,
      user_record.role::character varying(20) as role,
      COALESCE(user_record.display_name, user_record.username)::character varying(100) as display_name,
      true as success;
  ELSE
    RETURN QUERY SELECT 
      null::uuid as user_id,
      null::character varying(50) as username, 
      null::character varying(20) as role,
      null::character varying(100) as display_name,
      false as success;
  END IF;
END;
$function$;

-- Fix function search_path for update_system_completion_status
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
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
  WHERE public.test_systems.id = csc.system_id;

  RETURN NEW;
END;
$function$;

-- Fix function search_path for update_station_time_analytics
CREATE OR REPLACE FUNCTION public.update_station_time_analytics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  -- When progress is completed, calculate actual time
  IF NEW.status = 'Done' AND OLD.status != 'Done' AND NEW.started_at IS NOT NULL THEN
    INSERT INTO public.station_time_analytics (station_id, system_id, estimated_hours, actual_hours)
    SELECT 
      NEW.station_id,
      NEW.system_id,
      COALESCE(ts.estimated_hours, 0),
      EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 3600.0
    FROM public.test_flow_stations ts
    WHERE ts.id = NEW.station_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix function search_path for log_test_progress_changes
CREATE OR REPLACE FUNCTION public.log_test_progress_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.test_progress_audit (
      system_id, station_id, item_id, 
      new_status, new_progress_percent, new_notes,
      changed_by, change_type
    ) VALUES (
      NEW.system_id, NEW.station_id, NEW.item_id,
      NEW.status, NEW.progress_percent, NEW.notes,
      COALESCE(NEW.assigned_to, 'system'), 'insert'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.test_progress_audit (
      system_id, station_id, item_id,
      old_status, new_status, 
      old_progress_percent, new_progress_percent,
      old_notes, new_notes,
      changed_by, change_type
    ) VALUES (
      NEW.system_id, NEW.station_id, NEW.item_id,
      OLD.status, NEW.status,
      OLD.progress_percent, NEW.progress_percent, 
      OLD.notes, NEW.notes,
      COALESCE(NEW.assigned_to, 'system'), 'update'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.test_progress_audit (
      system_id, station_id, item_id,
      old_status, old_progress_percent, old_notes,
      changed_by, change_type
    ) VALUES (
      OLD.system_id, OLD.station_id, OLD.item_id,
      OLD.status, OLD.progress_percent, OLD.notes,
      COALESCE(OLD.assigned_to, 'system'), 'delete'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Fix function search_path for record_station_times
CREATE OR REPLACE FUNCTION public.record_station_times()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
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

-- Fix function search_path for calculate_daily_production_stats
CREATE OR REPLACE FUNCTION public.calculate_daily_production_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  current_date DATE := CURRENT_DATE;
  completed_count INTEGER;
  target_count INTEGER;
  is_work_day BOOLEAN;
  day_of_week INTEGER;
BEGIN
  -- Check if current date is a work day (Monday=1 to Friday=5)
  day_of_week := EXTRACT(DOW FROM current_date);
  is_work_day := day_of_week BETWEEN 1 AND 5;
  
  -- Count completed systems for today
  SELECT COUNT(*) INTO completed_count
  FROM public.test_systems ts
  WHERE ts.status = 'Done' 
    AND DATE(ts.updated_at) = current_date;
  
  -- Get daily target from settings
  SELECT COALESCE((settings->>'daily_production_target')::INTEGER, 5) INTO target_count
  FROM public.system_settings 
  WHERE category = 'work_time';
  
  -- Insert or update daily stats
  INSERT INTO public.daily_production_stats (date, completed_systems, target_systems, work_day)
  VALUES (current_date, completed_count, target_count, is_work_day)
  ON CONFLICT (date) 
  DO UPDATE SET 
    completed_systems = EXCLUDED.completed_systems,
    target_systems = EXCLUDED.target_systems,
    work_day = EXCLUDED.work_day,
    updated_at = now();
END;
$function$;