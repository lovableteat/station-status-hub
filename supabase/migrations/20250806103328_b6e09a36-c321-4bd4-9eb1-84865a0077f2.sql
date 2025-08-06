-- 第一步：修復RLS政策和添加tags欄位
-- 刪除過於寬鬆的RLS政策
DROP POLICY IF EXISTS "Allow all users to view notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Allow all users to update notifications" ON public.user_notifications;

-- 添加tags欄位
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 創建嚴格的RLS政策
CREATE POLICY "Recipients can view their own notifications" 
ON public.user_notifications 
FOR SELECT 
USING (recipient_id = auth.uid());

CREATE POLICY "Recipients can update their own notifications" 
ON public.user_notifications 
FOR UPDATE 
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Senders can create notifications" 
ON public.user_notifications 
FOR INSERT 
WITH CHECK (sender_id = auth.uid());

-- 保留現有的刪除政策
-- "Recipients can delete their own notifications" 已經存在

-- 清理現有的複雜通知數據，簡化結構
UPDATE public.user_notifications 
SET 
  conversation_id = NULL,
  reply_id = NULL,
  grouped_id = NULL,
  expires_at = NULL,
  require_confirmation = false,
  tags = CASE 
    WHEN notification_type = 'mention' THEN ARRAY['提及']
    WHEN priority = 'urgent' THEN ARRAY['緊急']
    WHEN priority = 'high' THEN ARRAY['重要']
    ELSE ARRAY['一般']
  END
WHERE archived_at IS NULL;