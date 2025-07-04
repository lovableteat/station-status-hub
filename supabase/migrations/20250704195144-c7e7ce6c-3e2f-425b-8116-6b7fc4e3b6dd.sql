-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily statistics calculation at 23:00 (11 PM) every day
SELECT cron.schedule(
  'daily-production-stats',
  '0 23 * * *', -- At 23:00 every day
  $$
  select
    net.http_post(
        url:='https://rfppeuzmozxtqkpbwehbq.supabase.co/functions/v1/daily-stats',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmcHBldXp1b3h0cWtwYndlaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTE1NTAsImV4cCI6MjA2NTU4NzU1MH0.-Km2GwsmtxHqqCLleqlf-OYgYo2U9DYG492bcRkj2W0"}'::jsonb,
        body:='{"trigger": "cron"}'::jsonb
    ) as request_id;
  $$
);