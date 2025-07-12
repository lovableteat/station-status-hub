
-- Add cascade delete for station-related tables
ALTER TABLE test_flow_items DROP CONSTRAINT IF EXISTS test_flow_items_station_id_fkey;
ALTER TABLE test_flow_items ADD CONSTRAINT test_flow_items_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

ALTER TABLE test_progress DROP CONSTRAINT IF EXISTS test_progress_station_id_fkey;
ALTER TABLE test_progress ADD CONSTRAINT test_progress_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

ALTER TABLE station_contents DROP CONSTRAINT IF EXISTS station_contents_station_id_fkey;
ALTER TABLE station_contents ADD CONSTRAINT station_contents_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

ALTER TABLE station_time_analytics DROP CONSTRAINT IF EXISTS station_time_analytics_station_id_fkey;
ALTER TABLE station_time_analytics ADD CONSTRAINT station_time_analytics_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

ALTER TABLE station_time_records DROP CONSTRAINT IF EXISTS station_time_records_station_id_fkey;
ALTER TABLE station_time_records ADD CONSTRAINT station_time_records_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

ALTER TABLE station_time_settings DROP CONSTRAINT IF EXISTS station_time_settings_station_id_fkey;
ALTER TABLE station_time_settings ADD CONSTRAINT station_time_settings_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE CASCADE;

-- Add foreign key constraints for issues table if they don't exist
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_system_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_system_id_fkey 
  FOREIGN KEY (system_id) REFERENCES test_systems(id) ON DELETE SET NULL;

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_station_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_station_id_fkey 
  FOREIGN KEY (station_id) REFERENCES test_flow_stations(id) ON DELETE SET NULL;

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_test_item_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_test_item_id_fkey 
  FOREIGN KEY (test_item_id) REFERENCES test_flow_items(id) ON DELETE SET NULL;
