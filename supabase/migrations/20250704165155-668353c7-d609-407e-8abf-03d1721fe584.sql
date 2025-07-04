-- Directly update System02 and System03 with correct current station
WITH system_corrections AS (
  SELECT 
    ts.id as system_id,
    ts.system_name,
    -- For System02 and System03, Station 0 is complete, so current should be Station 1
    CASE 
      WHEN ts.system_name IN ('System02', 'System03') THEN 'Station 1 - BIOS/BMC TEAM'
      ELSE ts.current_station
    END as correct_current_station
  FROM test_systems ts
  WHERE ts.system_name IN ('System02', 'System03')
)
UPDATE test_systems 
SET 
  current_station = sc.correct_current_station,
  updated_at = now()
FROM system_corrections sc
WHERE test_systems.id = sc.system_id;