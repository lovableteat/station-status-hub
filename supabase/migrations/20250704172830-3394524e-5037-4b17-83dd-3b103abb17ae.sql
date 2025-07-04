-- Add employee_id to engineers table for requirement 4
ALTER TABLE engineers ADD COLUMN employee_id VARCHAR(50) UNIQUE;

-- Create audit log table for requirement 5 (tracking test progress changes)
CREATE TABLE test_progress_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL,
  station_id UUID NOT NULL, 
  item_id UUID NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  old_progress_percent INTEGER,
  new_progress_percent INTEGER,
  old_notes TEXT,
  new_notes TEXT,
  changed_by VARCHAR(100),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_type VARCHAR(50) NOT NULL -- 'insert', 'update', 'delete'
);

-- Enable RLS on audit table
ALTER TABLE test_progress_audit ENABLE ROW LEVEL SECURITY;

-- Create policy for audit table
CREATE POLICY "Allow anonymous access to test_progress_audit" 
ON test_progress_audit 
FOR ALL 
USING (true);

-- Create trigger function to log test progress changes
CREATE OR REPLACE FUNCTION log_test_progress_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO test_progress_audit (
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
    INSERT INTO test_progress_audit (
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
    INSERT INTO test_progress_audit (
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
$$ LANGUAGE plpgsql;

-- Create trigger for test progress changes
CREATE TRIGGER test_progress_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON test_progress
  FOR EACH ROW EXECUTE FUNCTION log_test_progress_changes();