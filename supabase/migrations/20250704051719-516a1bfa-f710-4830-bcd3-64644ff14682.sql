-- Manually trigger the update for all systems to fix current station status
DO $$
DECLARE
    sys_record RECORD;
BEGIN
    -- Update each system's status based on their current progress
    FOR sys_record IN SELECT DISTINCT system_id FROM test_progress LOOP
        -- Simulate a trigger by updating a progress record
        UPDATE test_progress 
        SET updated_at = now() 
        WHERE system_id = sys_record.system_id 
        AND id = (SELECT id FROM test_progress WHERE system_id = sys_record.system_id LIMIT 1);
    END LOOP;
END $$;