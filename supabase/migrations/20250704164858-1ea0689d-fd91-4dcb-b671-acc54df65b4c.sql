-- Fix the system completion status function to correctly determine current station
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
RETURNS trigger
LANGUAGE plpgsql
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
    updated_at = now()
  FROM current_station_calc csc
  WHERE test_systems.id = csc.system_id;

  RETURN NEW;
END;
$function$;