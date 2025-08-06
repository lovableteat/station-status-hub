import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { useToast } from '@/hooks/use-toast';

interface NotificationReply {
  id: string;
  notification_id: string;
  sender_id: string;
  reply_type: string;
  content: string;
  status: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationConversation {
  id: string;
  notification_id: string;
  participant_ids: string[];
  subject: string;
  status: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export function useNotificationReplies() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // 發送回覆
  const sendReply = useCallback(async (
    notificationId: string,
    replyType: string = 'completion',
    content: string = '任務已完成'
  ) => {
    if (!user) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
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

      // 更新原通知狀態
      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({
          status: 'replied',
          reply_id: reply.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (updateError) throw updateError;

      // 發送回覆通知給原標註者
      const { data: originalNotification } = await supabase
        .from('user_notifications')
        .select('sender_id, title, reference_type, reference_id')
        .eq('id', notificationId)
        .single();

      if (originalNotification) {
        await supabase
          .from('user_notifications')
          .insert({
            recipient_id: originalNotification.sender_id,
            sender_id: user.userId,
            notification_type: 'reply',
            title: `回覆：${originalNotification.title}`,
            message: content,
            reference_type: originalNotification.reference_type,
            reference_id: originalNotification.reference_id,
            require_confirmation: true,
            metadata: {
              original_notification_id: notificationId,
              reply_id: reply.id,
              sender_name: user.displayName
            }
          });
      }

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

  // 確認回覆並關閉通知
  const confirmReply = useCallback(async (notificationId: string, replyId: string) => {
    if (!user) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      // 更新回覆狀態為已確認
      const { error: replyUpdateError } = await supabase
        .from('notification_replies')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.userId
        })
        .eq('id', replyId);

      if (replyUpdateError) throw replyUpdateError;

      // 更新通知狀態為已關閉
      const { error: notificationUpdateError } = await supabase
        .from('user_notifications')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (notificationUpdateError) throw notificationUpdateError;

      toast({
        title: "成功",
        description: "通知已確認並關閉"
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

  // 獲取通知的回覆記錄
  const getNotificationReplies = useCallback(async (notificationId: string) => {
    try {
      const { data, error } = await supabase
        .from('notification_replies')
        .select('*')
        .eq('notification_id', notificationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as NotificationReply[];
    } catch (error) {
      console.error('Error fetching replies:', error);
      return [];
    }
  }, []);

  // 創建對話
  const createConversation = useCallback(async (
    notificationId: string,
    participantIds: string[],
    subject: string
  ) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('notification_conversations')
        .insert({
          notification_id: notificationId,
          participant_ids: participantIds,
          subject,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      return data as NotificationConversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }, [user]);

  return {
    isLoading,
    sendReply,
    confirmReply,
    getNotificationReplies,
    createConversation
  };
}