-- Create user roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'engineer', 'viewer')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create engineers table for managing responsible personnel
CREATE TABLE IF NOT EXISTS public.engineers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  team TEXT NOT NULL CHECK (team IN ('ME', 'BIOS/BMC', 'EE', 'SIT/RAD')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineers ENABLE ROW LEVEL SECURITY;

-- Create policies for user_roles
CREATE POLICY "Allow anonymous access to user_roles"
ON public.user_roles
FOR ALL
USING (true);

-- Create policies for engineers
CREATE POLICY "Allow anonymous access to engineers"
ON public.engineers
FOR ALL
USING (true);

-- Update station names with team assignments
UPDATE test_flow_stations SET 
  station_name = 'Station 0 - ME TEAM',
  description = 'ME TEAM 機台初始化準備階段'
WHERE station_order = 0;

UPDATE test_flow_stations SET 
  station_name = 'Station 1 - BIOS/BMC TEAM',
  description = 'BIOS/BMC TEAM 正式上電階段'
WHERE station_order = 1;

UPDATE test_flow_stations SET 
  station_name = 'Station 2 - EE TEAM',
  description = 'EE TEAM 韌體更新階段'
WHERE station_order = 2;

UPDATE test_flow_stations SET 
  station_name = 'Station 3 - SIT/RAD TEAM',
  description = 'SIT/RAD TEAM 功能驗證階段'
WHERE station_order = 3;

-- Insert default engineers
INSERT INTO public.engineers (name, email, team) VALUES
('Wilson Chen', 'wilson@company.com', 'ME'),
('Alice Wang', 'alice@company.com', 'BIOS/BMC'),
('Bob Liu', 'bob@company.com', 'EE'),
('David Chang', 'david@company.com', 'SIT/RAD'),
('Emma Lee', 'emma@company.com', 'ME'),
('Frank Zhou', 'frank@company.com', 'BIOS/BMC');

-- Add actual_hours column to test_progress for time tracking
ALTER TABLE test_progress 
ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(4,2) DEFAULT 0;

-- Create station time analytics table
CREATE TABLE IF NOT EXISTS public.station_time_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES test_flow_stations(id),
  system_id UUID NOT NULL REFERENCES test_systems(id),
  estimated_hours DECIMAL(4,2) NOT NULL,
  actual_hours DECIMAL(4,2) NOT NULL,
  efficiency_ratio DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN actual_hours > 0 THEN (estimated_hours / actual_hours) * 100
      ELSE 0
    END
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for station_time_analytics
ALTER TABLE public.station_time_analytics ENABLE ROW LEVEL SECURITY;

-- Create policy for station_time_analytics
CREATE POLICY "Allow anonymous access to station_time_analytics"
ON public.station_time_analytics
FOR ALL
USING (true);

-- Create trigger to update station time analytics
CREATE OR REPLACE FUNCTION update_station_time_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- When progress is completed, calculate actual time
  IF NEW.status = 'Done' AND OLD.status != 'Done' AND NEW.started_at IS NOT NULL THEN
    INSERT INTO station_time_analytics (station_id, system_id, estimated_hours, actual_hours)
    SELECT 
      NEW.station_id,
      NEW.system_id,
      COALESCE(ts.estimated_hours, 0),
      EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 3600.0
    FROM test_flow_stations ts
    WHERE ts.id = NEW.station_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_station_time_analytics ON test_progress;
CREATE TRIGGER trigger_update_station_time_analytics
  AFTER UPDATE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_station_time_analytics();