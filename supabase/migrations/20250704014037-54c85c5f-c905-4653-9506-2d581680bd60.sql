-- Add file upload support to tools_management table
ALTER TABLE public.tools_management 
ADD COLUMN upload_status TEXT DEFAULT 'pending',
ADD COLUMN uploaded_by TEXT,
ADD COLUMN uploaded_at TIMESTAMP WITH TIME ZONE;

-- Create a function to automatically update system status when all stations are complete
CREATE OR REPLACE FUNCTION public.update_system_completion_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the system status when progress changes
  WITH station_completion AS (
    SELECT 
      tp.system_id,
      ts.station_order,
      CASE 
        WHEN COUNT(tfi.id) = COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) 
        THEN 100 
        ELSE ROUND((COUNT(CASE WHEN tp.status = 'Done' THEN 1 END)::decimal / COUNT(tfi.id)) * 100)
      END as station_progress
    FROM test_progress tp
    JOIN test_flow_items tfi ON tp.item_id = tfi.id
    JOIN test_flow_stations ts ON tp.station_id = ts.id
    WHERE tp.system_id = NEW.system_id
    GROUP BY tp.system_id, ts.station_order
  ),
  system_summary AS (
    SELECT 
      system_id,
      COUNT(*) as total_stations,
      COUNT(CASE WHEN station_progress = 100 THEN 1 END) as completed_stations,
      AVG(station_progress) as overall_progress
    FROM station_completion
    WHERE station_order BETWEEN 0 AND 4  -- Only count Station 0-4
    GROUP BY system_id
  )
  UPDATE test_systems
  SET 
    overall_progress = ROUND(ss.overall_progress),
    status = CASE 
      WHEN ss.completed_stations = 5 AND ss.total_stations >= 5 THEN 'Done'
      WHEN ss.completed_stations > 0 THEN 'On-going'
      ELSE 'Not Start'
    END,
    updated_at = now()
  FROM system_summary ss
  WHERE test_systems.id = ss.system_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating system status
DROP TRIGGER IF EXISTS trigger_update_system_completion ON test_progress;
CREATE TRIGGER trigger_update_system_completion
  AFTER INSERT OR UPDATE OR DELETE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_completion_status();

-- Create export logs table for tracking report exports
CREATE TABLE IF NOT EXISTS public.test_export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type TEXT NOT NULL,
  file_name TEXT,
  exported_by TEXT,
  export_params JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on export logs
ALTER TABLE public.test_export_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for export logs
CREATE POLICY "Allow anonymous access to export logs" 
ON public.test_export_logs 
FOR ALL 
USING (true);