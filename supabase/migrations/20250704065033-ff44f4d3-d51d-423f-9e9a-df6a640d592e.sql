-- Fix current station calculation logic to show only Station 0-3
-- Each station represents 25% progress when completed (100%)
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update the system status when progress changes
  WITH station_completion AS (
    SELECT 
      tp.system_id,
      ts.station_order,
      ts.station_name,
      COUNT(tfi.id) as total_items,
      COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) as completed_items,
      CASE 
        WHEN COUNT(tfi.id) = COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) 
        THEN 100 
        ELSE ROUND((COUNT(CASE WHEN tp.status = 'Done' THEN 1 END)::decimal / COUNT(tfi.id)) * 100)
      END as station_progress
    FROM test_progress tp
    JOIN test_flow_items tfi ON tp.item_id = tfi.id
    JOIN test_flow_stations ts ON tp.station_id = ts.id
    WHERE tp.system_id = NEW.system_id
      AND ts.station_order BETWEEN 0 AND 3  -- Only consider Station 0-3
    GROUP BY tp.system_id, ts.station_order, ts.station_name
  ),
  next_station AS (
    SELECT 
      system_id,
      CASE 
        -- Find the first station that is not 100% complete, ordered by station_order
        WHEN EXISTS (SELECT 1 FROM station_completion WHERE station_progress < 100 AND station_order = 0) THEN 'Station 0'
        WHEN EXISTS (SELECT 1 FROM station_completion WHERE station_progress < 100 AND station_order = 1) THEN 'Station 1'
        WHEN EXISTS (SELECT 1 FROM station_completion WHERE station_progress < 100 AND station_order = 2) THEN 'Station 2'
        WHEN EXISTS (SELECT 1 FROM station_completion WHERE station_progress < 100 AND station_order = 3) THEN 'Station 3'
        -- If all stations are complete, mark as final station
        ELSE 'Station 3'
      END as current_station,
      COUNT(*) as total_stations,
      COUNT(CASE WHEN station_progress = 100 THEN 1 END) as completed_stations,
      -- Overall progress: each completed station = 25%
      (COUNT(CASE WHEN station_progress = 100 THEN 1 END) * 25) as overall_progress
    FROM station_completion
    WHERE station_order BETWEEN 0 AND 3
    GROUP BY system_id
  )
  UPDATE test_systems
  SET 
    overall_progress = COALESCE(ns.overall_progress, 0),
    current_station = COALESCE(ns.current_station, 'Station 0'),
    status = CASE 
      WHEN COALESCE(ns.completed_stations, 0) = 4 THEN 'Done'
      WHEN COALESCE(ns.completed_stations, 0) > 0 THEN 'On-going'
      ELSE 'Not Start'
    END,
    updated_at = now()
  FROM next_station ns
  WHERE test_systems.id = ns.system_id;

  RETURN NEW;
END;
$function$;