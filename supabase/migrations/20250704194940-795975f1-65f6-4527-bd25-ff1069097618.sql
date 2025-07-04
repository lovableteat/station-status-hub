-- Reset all test systems to "Not Start" status for actual operations
UPDATE public.test_systems 
SET 
  status = 'Not Start',
  overall_progress = 0,
  current_station = 'Station 0',
  updated_at = now();

-- Update system settings for proper timeline and work schedule
UPDATE public.system_settings 
SET 
  settings = '{
    "daily_work_hours": 8,
    "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "overtime_rate": 1.5,
    "start_time": "09:00",
    "end_time": "18:00",
    "break_duration": 60,
    "daily_production_target": 5,
    "project_start_date": "2025-07-21",
    "systems_per_day": 5
  }',
  updated_at = now()
WHERE category = 'work_time';

-- Create production schedule table for daily statistics
CREATE TABLE IF NOT EXISTS public.daily_production_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_systems INTEGER NOT NULL DEFAULT 0,
  target_systems INTEGER NOT NULL DEFAULT 5,
  work_day BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date)
);

-- Enable RLS for production stats
ALTER TABLE public.daily_production_stats ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access
CREATE POLICY "Allow anonymous access to daily_production_stats" 
ON public.daily_production_stats 
FOR ALL 
USING (true);

-- Create trigger for timestamp updates
CREATE TRIGGER update_daily_production_stats_updated_at
BEFORE UPDATE ON public.daily_production_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate daily production stats
CREATE OR REPLACE FUNCTION public.calculate_daily_production_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_date DATE := CURRENT_DATE;
  completed_count INTEGER;
  target_count INTEGER;
  is_work_day BOOLEAN;
  day_of_week INTEGER;
BEGIN
  -- Check if current date is a work day (Monday=1 to Friday=5)
  day_of_week := EXTRACT(DOW FROM current_date);
  is_work_day := day_of_week BETWEEN 1 AND 5;
  
  -- Count completed systems for today
  SELECT COUNT(*) INTO completed_count
  FROM test_systems ts
  WHERE ts.status = 'Done' 
    AND DATE(ts.updated_at) = current_date;
  
  -- Get daily target from settings
  SELECT COALESCE((settings->>'daily_production_target')::INTEGER, 5) INTO target_count
  FROM system_settings 
  WHERE category = 'work_time';
  
  -- Insert or update daily stats
  INSERT INTO daily_production_stats (date, completed_systems, target_systems, work_day)
  VALUES (current_date, completed_count, target_count, is_work_day)
  ON CONFLICT (date) 
  DO UPDATE SET 
    completed_systems = EXCLUDED.completed_systems,
    target_systems = EXCLUDED.target_systems,
    work_day = EXCLUDED.work_day,
    updated_at = now();
END;
$$;