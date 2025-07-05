-- Reset all test progress to initial state for production launch
-- Reset all test systems to "Not Start" status
UPDATE public.test_systems 
SET 
  status = 'Not Start',
  overall_progress = 0,
  current_station = 'Station 0',
  updated_at = now();

-- Clear all test progress records
DELETE FROM public.test_progress;

-- Reset daily production stats
DELETE FROM public.daily_production_stats;

-- Clear test progress audit logs (optional - keeping for historical reference)
-- DELETE FROM public.test_progress_audit;

-- Reset station time analytics
DELETE FROM public.station_time_analytics;

-- Reset any production metrics
UPDATE public.production_metrics 
SET 
  completed_today = 0,
  hourly_throughput = 0,
  oee = 0,
  quality_score = 0,
  defect_rate = 0,
  updated_at = now();

-- Initialize daily production stats for today
INSERT INTO public.daily_production_stats (date, completed_systems, target_systems, work_day)
VALUES (CURRENT_DATE, 0, 5, EXTRACT(DOW FROM CURRENT_DATE) BETWEEN 1 AND 5)
ON CONFLICT (date) 
DO UPDATE SET 
  completed_systems = 0,
  updated_at = now();