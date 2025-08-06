-- 清空所有通知數據，重置狀態
DELETE FROM public.notification_replies;
DELETE FROM public.user_notifications;
DELETE FROM public.notification_conversations;
DELETE FROM public.notification_analytics;

-- 重置序列（如果有的話）
-- 確保從乾淨狀態開始