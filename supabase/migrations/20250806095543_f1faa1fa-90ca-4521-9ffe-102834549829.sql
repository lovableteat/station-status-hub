-- 修復安全問題：設置函數搜索路徑
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 修復通知狀態更新觸發器
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 修復通知清理觸發器
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';