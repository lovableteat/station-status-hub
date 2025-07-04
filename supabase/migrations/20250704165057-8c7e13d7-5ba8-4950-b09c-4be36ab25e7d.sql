-- Manually recalculate system status for System02 and System03
DO $$
DECLARE
    sys_rec RECORD;
BEGIN
    -- Get systems that need recalculation
    FOR sys_rec IN 
        SELECT id FROM test_systems WHERE system_name IN ('System02', 'System03')
    LOOP
        -- Manually call the function with a dummy NEW record
        PERFORM update_system_completion_status() FROM (
            SELECT sys_rec.id as system_id
        ) as dummy_new;
        
        -- Update using the corrected logic directly
        WITH all_stations AS (
            SELECT 
                sys_rec.id as system_id,
                ts.id as station_id,
                ts.station_name,
                ts.station_order
            FROM test_flow_stations ts
            WHERE ts.station_order BETWEEN 0 AND 3
        ),
        station_progress AS (
            SELECT 
                ast.system_id,
                ast.station_id,
                ast.station_name,
                ast.station_order,
                COALESCE(COUNT(tfi.id), 0) as total_items,
                COALESCE(COUNT(CASE WHEN tp.status = 'Done' THEN 1 END), 0) as completed_items,
                CASE 
                    WHEN COUNT(tfi.id) = 0 THEN 0
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
            SELECT 
                system_id,
                COUNT(*) as total_stations,
                COUNT(CASE WHEN completion_percent = 100 THEN 1 END) as completed_stations,
                AVG(completion_percent) as overall_progress,
                COALESCE(
                    (SELECT station_name 
                     FROM station_progress sp2 
                     WHERE sp2.system_id = station_progress.system_id 
                       AND sp2.completion_percent < 100
                     ORDER BY sp2.station_order 
                     LIMIT 1),
                    'Station 3'
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
    END LOOP;
END $$;