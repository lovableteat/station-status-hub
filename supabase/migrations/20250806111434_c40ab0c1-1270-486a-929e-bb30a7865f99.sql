-- 移除所有基於 auth.uid() 的 RLS 政策，因為我們使用自定義認證系統
DROP POLICY IF EXISTS "Allow authenticated users to create notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Recipients can view their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Recipients can update their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Recipients can delete their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Recipients can archive their own notifications" ON public.user_notifications;

-- 暫時關閉 RLS，改用應用層認證控制
ALTER TABLE public.user_notifications DISABLE ROW LEVEL SECURITY;