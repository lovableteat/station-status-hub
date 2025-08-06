-- Fix remaining security warnings for existing functions
ALTER FUNCTION public.log_test_progress_changes() SET search_path TO '';
ALTER FUNCTION public.update_station_actual_completion_time() SET search_path TO '';
ALTER FUNCTION public.update_system_completion_status() SET search_path TO '';
ALTER FUNCTION public.authenticate_user(text, text) SET search_path TO '';
ALTER FUNCTION public.update_station_time_analytics() SET search_path TO '';
ALTER FUNCTION public.record_station_times() SET search_path TO '';
ALTER FUNCTION public.calculate_daily_production_stats() SET search_path TO '';