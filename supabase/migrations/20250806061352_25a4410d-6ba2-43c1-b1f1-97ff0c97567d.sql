-- Fix security warnings by adding SET search_path to all functions
ALTER FUNCTION public.cleanup_old_notifications() SET search_path TO '';
ALTER FUNCTION public.get_notification_stats(UUID) SET search_path TO '';