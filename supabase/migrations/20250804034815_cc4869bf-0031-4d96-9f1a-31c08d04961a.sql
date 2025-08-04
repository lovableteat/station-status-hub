-- Add team column to test_systems table
ALTER TABLE test_systems ADD COLUMN IF NOT EXISTS team TEXT;