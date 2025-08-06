-- 修復通知創建的RLS政策問題
-- 刪除過於嚴格的政策
DROP POLICY IF EXISTS "Senders can create notifications" ON public.user_notifications;

-- 創建更寬鬆但安全的通知創建政策
CREATE POLICY "Authenticated users can create notifications" 
ON public.user_notifications 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);