-- Create system_settings table for application configuration
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access (since no auth is implemented)
CREATE POLICY "Allow anonymous access to system_settings" 
ON public.system_settings 
FOR ALL 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default work time settings
INSERT INTO public.system_settings (category, settings, description) VALUES 
('work_time', '{
  "daily_work_hours": 8,
  "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "overtime_rate": 1.5,
  "start_time": "09:00",
  "end_time": "18:00",
  "break_duration": 60
}', '工作時間設定'),
('test_metrics', '{
  "pass_rate_calculation": "completed_units_divided_by_total",
  "average_progress_method": "daily_average_completed_units"
}', '測試通過率計算設定');