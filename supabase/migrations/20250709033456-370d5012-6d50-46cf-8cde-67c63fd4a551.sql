
-- 重新建立Station 4，確保與其他站點設計一致
INSERT INTO test_flow_stations (station_name, station_order, description, estimated_hours)
VALUES ('Station 4 - NV TEST', 4, 'NV測試站點', 8.0)
ON CONFLICT (station_order) DO UPDATE SET
  station_name = EXCLUDED.station_name,
  description = EXCLUDED.description,
  estimated_hours = EXCLUDED.estimated_hours;

-- 為Station 4建立測試項目（參考Station 0的結構）
INSERT INTO test_flow_items (station_id, item_name, item_order, description, estimated_minutes)
SELECT 
  (SELECT id FROM test_flow_stations WHERE station_order = 4),
  'NV測試項目1',
  1,
  'NV測試第一項',
  120
WHERE NOT EXISTS (
  SELECT 1 FROM test_flow_items tfi 
  JOIN test_flow_stations tfs ON tfi.station_id = tfs.id 
  WHERE tfs.station_order = 4 AND tfi.item_order = 1
);

INSERT INTO test_flow_items (station_id, item_name, item_order, description, estimated_minutes)
SELECT 
  (SELECT id FROM test_flow_stations WHERE station_order = 4),
  'NV測試項目2',
  2,
  'NV測試第二項',
  180
WHERE NOT EXISTS (
  SELECT 1 FROM test_flow_items tfi 
  JOIN test_flow_stations tfs ON tfi.station_id = tfs.id 
  WHERE tfs.station_order = 4 AND tfi.item_order = 2
);

-- 更新系統完成狀態函數，現在包含Station 0-4（共5個站點）
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update the system status when progress changes
  WITH all_stations AS (
    -- Get all stations (0-4) for this system
    SELECT 
      NEW.system_id as system_id,
      ts.id as station_id,
      ts.station_name,
      ts.station_order
    FROM test_flow_stations ts
    WHERE ts.station_order BETWEEN 0 AND 4
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
        'Station 4 - NV TEST'  -- If all stations are complete, stay at final station
      ) as current_station
    FROM station_progress
    GROUP BY system_id
  )
  UPDATE test_systems
  SET 
    overall_progress = ROUND(csc.overall_progress),
    current_station = csc.current_station,
    status = CASE 
      WHEN csc.completed_stations = 5 THEN 'Done'  -- Now 5 stations total
      WHEN csc.completed_stations > 0 THEN 'On-going'
      ELSE 'Not Start'
    END,
    -- Set actual completion time when system becomes 100% complete
    actual_completed_at = CASE 
      WHEN csc.completed_stations = 5 AND csc.overall_progress = 100 AND actual_completed_at IS NULL THEN now()
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
$function$;
