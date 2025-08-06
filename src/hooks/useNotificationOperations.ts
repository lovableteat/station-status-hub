
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { useToast } from '@/hooks/use-toast';

export function useNotificationOperations() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const sendReply = useCallback(async (
    notificationId: string,
    replyType: string = 'completion',
    content: string = '任務已完成'
  ) => {
    if (!user?.userId || !notificationId) {
      toast({
        title: "錯誤",
        description: "請先登入或提供有效的通知ID",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      // 檢查是否已存在回覆，避免重複
      const { data: existingReply } = await supabase
        .from('notification_replies')
        .select('id')
        .eq('notification_id', notificationId)
        .eq('sender_id', user.userId)
        .single();

      if (existingReply) {
        toast({
          title: "提示",
          description: "您已回覆過此通知",
          variant: "default"
        });
        return existingReply;
      }

      // 創建回覆記錄
      const { data: reply, error: replyError } = await supabase
        .from('notification_replies')
        .insert({
          notification_id: notificationId,
          sender_id: user.userId,
          reply_type: replyType,
          content,
          status: 'pending'
        })
        .select()
        .single();

      if (replyError) throw replyError;

      // 由於有了觸發器，通知狀態會自動更新，無需手動處理
      toast({
        title: "成功",
        description: "回覆已發送"
      });

      return reply;
    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "發送回覆失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const confirmReply = useCallback(async (notificationId: string, replyId: string) => {
    if (!user?.userId || !notificationId || !replyId) {
      toast({
        title: "錯誤",
        description: "缺少必要參數",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      // 首先獲取原始通知信息和回覆信息
      const { data: originalNotification, error: notificationError } = await supabase
        .from('user_notifications')
        .select('sender_id, title, message, metadata')
        .eq('id', notificationId)
        .single();

      if (notificationError) throw notificationError;

      const { data: replyData, error: replyError } = await supabase
        .from('notification_replies')
        .select('content, sender_id')
        .eq('id', replyId)
        .single();

      if (replyError) throw replyError;

      // 更新回覆狀態
      const { error: replyUpdateError } = await supabase
        .from('notification_replies')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.userId
        })
        .eq('id', replyId)
        .eq('status', 'pending');

      if (replyUpdateError) throw replyUpdateError;

      // 發送結果通知給原發送人
      if (originalNotification.sender_id && originalNotification.sender_id !== user.userId) {
        const metadata = originalNotification.metadata as any;
        const { error: resultNotificationError } = await supabase
          .from('user_notifications')
          .insert({
            recipient_id: originalNotification.sender_id,
            sender_id: user.userId,
            notification_type: 'reply_result',
            title: `任務回覆結果: ${originalNotification.title}`,
            message: `您的任務標註已收到回覆並確認完成: "${replyData.content}"`,
            reference_type: metadata?.referenceType || 'issue',
            reference_id: metadata?.referenceId,
            status: 'completed',
            priority: 'normal',
            category: 'task_result',
            metadata: {
              originalNotificationId: notificationId,
              replyId: replyId,
              replyContent: replyData.content,
              originalTitle: originalNotification.title
            }
          });

        if (resultNotificationError) {
          console.error('Error sending result notification:', resultNotificationError);
          // 不阻止主要流程，但記錄錯誤
        }
      }

      toast({
        title: "成功",
        description: "通知已確認並關閉，結果已發送給發送人"
      });

      return true;
    } catch (error) {
      console.error('Error confirming reply:', error);
      toast({
        title: "確認失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  return {
    isLoading,
    sendReply,
    confirmReply
  };
}
