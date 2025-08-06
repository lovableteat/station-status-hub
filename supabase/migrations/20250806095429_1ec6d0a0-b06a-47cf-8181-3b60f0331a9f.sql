-- 階段一：修復數據庫遷移問題
-- 創建自動通知觸發器函數
CREATE OR REPLACE FUNCTION public.create_notification_on_mention()
RETURNS TRIGGER AS $$
DECLARE
  mentioned_user_uuid uuid;
BEGIN
  -- 遍歷提及的用戶
  IF NEW.mentioned_users IS NOT NULL THEN
    FOREACH mentioned_user_uuid IN ARRAY NEW.mentioned_users
    LOOP
      -- 創建通知記錄
      INSERT INTO public.user_notifications (
        recipient_id,
        sender_id,
        notification_type,
        title,
        message,
        reference_type,
        reference_id,
        status,
        priority,
        category,
        metadata
      ) VALUES (
        mentioned_user_uuid,
        auth.uid(),
        'mention',
        '您在問題 #' || COALESCE(NEW.title, '未命名') || ' 中被提及',
        '您在問題 "' || COALESCE(NEW.title, '未命名') || '" 中被提及，請查看詳情。',
        'issue',
        NEW.id,
        'pending',
        'normal',
        'mention',
        jsonb_build_object(
          'issue_id', NEW.id,
          'issue_title', NEW.title,
          'mentioned_by', auth.uid()
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 創建通知狀態更新觸發器
CREATE OR REPLACE FUNCTION public.update_notification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- 當回覆被確認時，更新通知狀態
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    UPDATE public.user_notifications 
    SET 
      status = 'replied',
      updated_at = now()
    WHERE id = NEW.notification_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 創建通知清理觸發器
CREATE OR REPLACE FUNCTION public.cleanup_notification_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- 當問題被刪除時，清理相關通知
  UPDATE public.user_notifications 
  SET 
    status = 'closed',
    updated_at = now()
  WHERE reference_type = 'issue' 
    AND reference_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 創建觸發器
DROP TRIGGER IF EXISTS trigger_create_notification_on_mention ON public.issues;
CREATE TRIGGER trigger_create_notification_on_mention
  AFTER INSERT OR UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_mention();

DROP TRIGGER IF EXISTS trigger_update_notification_status ON public.notification_replies;
CREATE TRIGGER trigger_update_notification_status
  AFTER UPDATE ON public.notification_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notification_status();

DROP TRIGGER IF EXISTS trigger_cleanup_notification_on_delete ON public.issues;
CREATE TRIGGER trigger_cleanup_notification_on_delete
  AFTER DELETE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_notification_on_delete();

-- 創建索引（移除 CONCURRENTLY 關鍵字）
CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_status 
ON public.user_notifications(recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_user_notifications_reference 
ON public.user_notifications(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_notification_replies_notification_id 
ON public.notification_replies(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_replies_status 
ON public.notification_replies(status);

-- 清理無效數據
DELETE FROM public.notification_replies 
WHERE notification_id IS NULL 
   OR sender_id IS NULL;

-- 修復狀態不一致的問題
UPDATE public.user_notifications 
SET status = 'replied' 
WHERE id IN (
  SELECT DISTINCT nr.notification_id 
  FROM public.notification_replies nr 
  WHERE nr.status = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.user_notifications un 
      WHERE un.id = nr.notification_id 
        AND un.status = 'pending'
    )
);