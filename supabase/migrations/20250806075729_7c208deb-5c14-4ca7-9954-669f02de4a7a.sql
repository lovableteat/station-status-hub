-- 允許發送者刪除已完成或已關閉的通知
CREATE POLICY "Senders can delete completed notifications"
ON user_notifications
FOR DELETE
USING (
  sender_id = auth.uid() AND 
  status IN ('closed', 'completed', 'replied')
);