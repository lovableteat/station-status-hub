-- 修復 notification_replies 的 RLS 政策，允許任何人創建回覆
DROP POLICY IF EXISTS "Users can create replies for notifications they received" ON notification_replies;

-- 新增更寬鬆的政策，允許任何認證用戶創建回覆
CREATE POLICY "Allow authenticated users to create replies" 
ON notification_replies 
FOR INSERT 
WITH CHECK (true);

-- 修復 user_notifications 的 RLS 政策，允許任何人創建通知
DROP POLICY IF EXISTS "Users can create notifications" ON user_notifications;

CREATE POLICY "Allow authenticated users to create notifications"
ON user_notifications
FOR INSERT
WITH CHECK (true);

-- 修復查看政策，允許所有用戶查看所有通知和回覆
DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can view replies for their notifications" ON notification_replies;

CREATE POLICY "Allow all users to view notifications"
ON user_notifications
FOR SELECT
USING (true);

CREATE POLICY "Allow all users to view replies"
ON notification_replies
FOR SELECT
USING (true);

-- 允許所有用戶更新通知狀態
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notifications;

CREATE POLICY "Allow all users to update notifications"
ON user_notifications
FOR UPDATE
USING (true);