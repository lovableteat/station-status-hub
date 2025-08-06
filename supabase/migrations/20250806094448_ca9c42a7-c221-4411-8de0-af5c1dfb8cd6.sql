
-- 階段一：創建數據庫觸發器修復通知系統

-- 1. 創建自動通知創建觸發器
CREATE OR REPLACE FUNCTION public.auto_create_mention_notifications()
RETURNS TRIGGER AS $$
DECLARE
  mentioned_user TEXT;
  sender_user_info RECORD;
BEGIN
  -- 獲取發送者信息
  SELECT id, display_name INTO sender_user_info 
  FROM public.system_users 
  WHERE username = COALESCE(NEW.assigned_to, 'system');
  
  -- 為每個被提及的用戶創建通知
  IF NEW.mentioned_users IS NOT NULL AND array_length(NEW.mentioned_users, 1) > 0 THEN
    FOREACH mentioned_user IN ARRAY NEW.mentioned_users
    LOOP
      -- 檢查用戶是否存在
      IF EXISTS (SELECT 1 FROM public.system_users WHERE username = mentioned_user) THEN
        -- 避免重複通知
        IF NOT EXISTS (
          SELECT 1 FROM public.user_notifications 
          WHERE reference_type = 'issue' 
            AND reference_id = NEW.id::text
            AND recipient_id = (SELECT id FROM public.system_users WHERE username = mentioned_user)
            AND notification_type = 'mention'
            AND created_at > NOW() - INTERVAL '1 minute'
        ) THEN
          INSERT INTO public.user_notifications (
            recipient_id,
            sender_id,
            notification_type,
            title,
            message,
            reference_type,
            reference_id,
            status,
            metadata,
            created_at
          ) VALUES (
            (SELECT id FROM public.system_users WHERE username = mentioned_user),
            COALESCE(sender_user_info.id, (SELECT id FROM public.system_users WHERE username = 'system' LIMIT 1)),
            'mention',
            '新問題標註：' || NEW.title,
            '您被標註在問題「' || NEW.title || '」中，請查看並處理。',
            'issue',
            NEW.id::text,
            'pending',
            jsonb_build_object(
              'issue_id', NEW.id,
              'issue_title', NEW.title,
              'priority', NEW.priority,
              'assigned_to', NEW.assigned_to
            ),
            NOW()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 創建通知狀態同步觸發器
CREATE OR REPLACE FUNCTION public.sync_notification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- 當問題狀態改變時，更新相關通知狀態
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.user_notifications 
    SET 
      status = CASE 
        WHEN NEW.status = 'closed' THEN 'completed'
        WHEN NEW.status = 'resolved' THEN 'completed'
        ELSE status
      END,
      updated_at = NOW()
    WHERE reference_type = 'issue' 
      AND reference_id = NEW.id::text
      AND status NOT IN ('completed', 'closed');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 創建自動清理過期通知觸發器函數
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- 軟刪除超過7天的已完成通知
  UPDATE public.user_notifications 
  SET 
    archived_at = NOW(),
    archived_by = recipient_id
  WHERE status IN ('completed', 'closed', 'replied')
    AND created_at < NOW() - INTERVAL '7 days'
    AND archived_at IS NULL;
    
  -- 真正刪除超過30天的歸檔通知
  DELETE FROM public.user_notifications 
  WHERE archived_at < NOW() - INTERVAL '30 days';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 創建通知回覆狀態同步觸發器
CREATE OR REPLACE FUNCTION public.sync_reply_notification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- 當回覆被確認時，更新通知狀態
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    UPDATE public.user_notifications 
    SET 
      status = 'closed',
      updated_at = NOW()
    WHERE id = NEW.notification_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 創建觸發器
DROP TRIGGER IF EXISTS trigger_auto_create_mention_notifications ON public.issues;
CREATE TRIGGER trigger_auto_create_mention_notifications
  AFTER INSERT ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_mention_notifications();

DROP TRIGGER IF EXISTS trigger_auto_create_mention_notifications_update ON public.issues;
CREATE TRIGGER trigger_auto_create_mention_notifications_update
  AFTER UPDATE OF mentioned_users ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_mention_notifications();

DROP TRIGGER IF EXISTS trigger_sync_notification_status ON public.issues;
CREATE TRIGGER trigger_sync_notification_status
  AFTER UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_notification_status();

DROP TRIGGER IF EXISTS trigger_sync_reply_notification_status ON public.notification_replies;
CREATE TRIGGER trigger_sync_reply_notification_status
  AFTER UPDATE ON public.notification_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reply_notification_status();

-- 創建每日清理任務觸發器（在user_notifications表有任何變更時觸發）
DROP TRIGGER IF EXISTS trigger_cleanup_expired_notifications ON public.user_notifications;
CREATE TRIGGER trigger_cleanup_expired_notifications
  AFTER INSERT OR UPDATE ON public.user_notifications
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_notifications();

-- 5. 添加必要的數據庫索引以提升性能
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_recipient_status 
ON public.user_notifications(recipient_id, status) WHERE archived_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_reference 
ON public.user_notifications(reference_type, reference_id) WHERE archived_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_created_at 
ON public.user_notifications(created_at) WHERE archived_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_unread 
ON public.user_notifications(recipient_id, is_read) WHERE archived_at IS NULL AND is_read = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_replies_notification_id 
ON public.notification_replies(notification_id, status);

-- 6. 修復已有數據的不一致問題
-- 清理孤立的通知記錄
DELETE FROM public.user_notifications 
WHERE reference_type = 'issue' 
  AND reference_id::uuid NOT IN (SELECT id FROM public.issues);

-- 修復沒有sender_id的通知
UPDATE public.user_notifications 
SET sender_id = (SELECT id FROM public.system_users WHERE username = 'system' LIMIT 1)
WHERE sender_id IS NULL;

-- 確保所有通知都有正確的狀態
UPDATE public.user_notifications 
SET status = 'pending' 
WHERE status IS NULL OR status = '';
