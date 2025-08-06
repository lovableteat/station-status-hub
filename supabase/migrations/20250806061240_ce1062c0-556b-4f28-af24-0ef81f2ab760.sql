-- Enhanced notification system
-- Update existing user_notifications table with new fields
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general' CHECK (category IN ('mention', 'system', 'task', 'issue', 'test', 'general')),
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS action_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS grouped_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_method TEXT[] DEFAULT ARRAY['in_app'],
  quiet_hours_start TIME DEFAULT NULL,
  quiet_hours_end TIME DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, category)
);

-- Create notification templates table
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  title_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  metadata_schema JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notification analytics table
CREATE TABLE IF NOT EXISTS public.notification_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('sent', 'delivered', 'read', 'clicked', 'dismissed')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS on new tables
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own notification preferences"
  ON public.notification_preferences
  FOR ALL
  USING (true);

CREATE POLICY "Users can view notification templates"
  ON public.notification_templates
  FOR SELECT
  USING (true);

CREATE POLICY "Users can view notification analytics"
  ON public.notification_analytics
  FOR ALL
  USING (true);

-- Insert default notification templates
INSERT INTO public.notification_templates (template_key, title_template, message_template, category, priority) VALUES
('mention_in_issue', '問題標註通知: {{issue_title}}', '{{sender_name}} 在問題 "{{issue_title}}" 中標註了您: {{mention_context}}', 'mention', 'high'),
('issue_assigned', '問題指派通知', '問題 "{{issue_title}}" 已指派給您處理', 'issue', 'high'),
('test_completed', '測試完成通知', '系統 "{{system_name}}" 的測試已完成', 'test', 'normal'),
('system_status_update', '系統狀態更新', '系統 "{{system_name}}" 狀態已更新為 {{status}}', 'system', 'normal'),
('daily_summary', '每日工作摘要', '今日完成 {{completed_tasks}} 項任務，待處理 {{pending_tasks}} 項', 'system', 'low')
ON CONFLICT (template_key) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  updated_at = now();

-- Create function to clean up old notifications
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete notifications older than 30 days
  DELETE FROM public.user_notifications 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete expired notifications
  DELETE FROM public.user_notifications 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- Create function to get notification statistics
CREATE OR REPLACE FUNCTION public.get_notification_stats(user_uuid UUID)
RETURNS TABLE(
  total_notifications BIGINT,
  unread_notifications BIGINT,
  high_priority_unread BIGINT,
  urgent_priority_unread BIGINT,
  categories_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_read = false) as unread,
      COUNT(*) FILTER (WHERE is_read = false AND priority = 'high') as high_unread,
      COUNT(*) FILTER (WHERE is_read = false AND priority = 'urgent') as urgent_unread,
      jsonb_object_agg(
        category, 
        jsonb_build_object(
          'total', COUNT(*),
          'unread', COUNT(*) FILTER (WHERE is_read = false)
        )
      ) as categories
    FROM public.user_notifications
    WHERE recipient_id = user_uuid
      AND (expires_at IS NULL OR expires_at > NOW())
  )
  SELECT 
    total,
    unread,
    high_unread,
    urgent_unread,
    categories
  FROM stats;
END;
$$;