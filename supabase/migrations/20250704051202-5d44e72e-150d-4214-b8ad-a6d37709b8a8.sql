-- Update the system completion status function to handle station progression
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
      CASE 
        WHEN COUNT(tfi.id) = COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) 
        THEN 100 
        ELSE ROUND((COUNT(CASE WHEN tp.status = 'Done' THEN 1 END)::decimal / COUNT(tfi.id)) * 100)
      END as station_progress
    FROM test_progress tp
    JOIN test_flow_items tfi ON tp.item_id = tfi.id
    JOIN test_flow_stations ts ON tp.station_id = ts.id
    WHERE tp.system_id = NEW.system_id
    GROUP BY tp.system_id, ts.station_order, ts.station_name
  ),
  system_summary AS (
    SELECT 
      system_id,
      COUNT(*) as total_stations,
      COUNT(CASE WHEN station_progress = 100 THEN 1 END) as completed_stations,
      AVG(station_progress) as overall_progress,
      -- Determine current station based on first incomplete station
      (SELECT 
        CASE 
          WHEN station_progress < 100 THEN station_name
          ELSE NULL
        END
       FROM station_completion sc2 
       WHERE sc2.system_id = station_completion.system_id 
         AND sc2.station_order BETWEEN 0 AND 4
       ORDER BY sc2.station_order 
       LIMIT 1
      ) as current_station_candidate
    FROM station_completion
    WHERE station_order BETWEEN 0 AND 4  -- Only count Station 0-4
    GROUP BY system_id
  ),
  final_status AS (
    SELECT 
      system_id,
      completed_stations,
      total_stations,
      overall_progress,
      CASE 
        WHEN completed_stations = 5 AND total_stations >= 5 THEN 'Station 4'  -- All done, stay at final station
        WHEN current_station_candidate IS NULL AND completed_stations > 0 THEN 'Station 4'  -- All current stations done
        ELSE COALESCE(current_station_candidate, 'Station 0')  -- Current working station or default
      END as current_station,
      CASE 
        WHEN completed_stations = 5 AND total_stations >= 5 THEN 'Done'
        WHEN completed_stations > 0 THEN 'On-going'
        ELSE 'Not Start'
      END as status
    FROM system_summary
  )
  UPDATE test_systems
  SET 
    overall_progress = ROUND(fs.overall_progress),
    current_station = fs.current_station,
    status = fs.status,
    updated_at = now()
  FROM final_status fs
  WHERE test_systems.id = fs.system_id;

  RETURN NEW;
END;
$function$;