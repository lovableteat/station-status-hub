
-- 添加軟刪除支持的欄位
ALTER TABLE public.user_notifications 
ADD COLUMN archived_at timestamp with time zone,
ADD COLUMN archived_by uuid;

-- 更新 RLS 政策，允許接收者刪除自己的通知
DROP POLICY IF EXISTS "Senders can delete completed notifications" ON public.user_notifications;

-- 創建新的刪除政策：接收者可以刪除/歸檔自己的通知
CREATE POLICY "Recipients can delete their own notifications" 
ON public.user_notifications 
FOR DELETE 
USING (recipient_id = auth.uid());

-- 允許用戶更新自己接收的通知（用於軟刪除）
CREATE POLICY "Recipients can archive their own notifications" 
ON public.user_notifications 
FOR UPDATE 
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- 創建清理過期通知的函數
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- 軟刪除超過30天的已完成通知
  UPDATE public.user_notifications 
  SET archived_at = now(), archived_by = recipient_id
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND status IN ('closed', 'completed', 'replied')
    AND archived_at IS NULL;
  
  -- 真正刪除超過90天的歸檔通知
  DELETE FROM public.user_notifications 
  WHERE archived_at < NOW() - INTERVAL '90 days';
END;
$function$;

-- 修改查詢視圖，預設不顯示已歸檔的通知
CREATE OR REPLACE VIEW public.active_notifications AS
SELECT * FROM public.user_notifications 
WHERE archived_at IS NULL;
