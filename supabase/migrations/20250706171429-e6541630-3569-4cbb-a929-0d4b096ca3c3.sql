-- Update system settings with new project start date and improved configuration
INSERT INTO system_settings (category, settings, description) 
VALUES (
  'work_time',
  '{
    "project_start_date": "2025-07-01",
    "systems_per_day": 5,
    "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "daily_work_hours": 8,
    "daily_production_target": 5
  }',
  'Work time and project timeline configuration'
) 
ON CONFLICT (category) DO UPDATE SET 
  settings = EXCLUDED.settings,
  description = EXCLUDED.description,
  updated_at = now();