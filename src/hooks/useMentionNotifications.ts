import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { useToast } from '@/hooks/use-toast';

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface NotificationData {
  title: string;
  message: string;
  referenceType: string;
  referenceId: string;
  metadata?: any;
}

export function useMentionNotifications() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // 解析文本中的標註
  const parseMentions = useCallback((text: string): MentionUser[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: MentionUser[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const [, displayName, userId] = match;
      mentions.push({
        id: userId,
        username: '', // 暫時為空，實際使用時可以從數據庫獲取
        displayName,
        role: ''
      });
    }

    return mentions;
  }, []);

  // 發送標註通知（升級版）
  const sendMentionNotifications = useCallback(async (
    text: string,
    notificationData: NotificationData
  ) => {
    if (!user) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const mentions = parseMentions(text);
      
      if (mentions.length === 0) {
        return; // 沒有標註，不需要發送通知
      }

      // 創建通知記錄（支援回覆確認）
      const notifications = mentions.map(mention => ({
        recipient_id: mention.id,
        sender_id: user.userId,
        notification_type: 'mention',
        title: notificationData.title,
        message: notificationData.message,
        reference_type: notificationData.referenceType,
        reference_id: notificationData.referenceId,
        status: 'pending',
        require_confirmation: true, // 需要確認的通知
        metadata: {
          ...notificationData.metadata,
          mention_text: text,
          sender_name: user.displayName
        }
      }));

      const { data: createdNotifications, error: notificationError } = await supabase
        .from('user_notifications')
        .insert(notifications)
        .select();

      if (notificationError) throw notificationError;

      // 為每個通知創建對話
      if (createdNotifications) {
        const conversations = createdNotifications.map(notification => ({
          notification_id: notification.id,
          participant_ids: [user.userId, notification.recipient_id],
          subject: notificationData.title,
          status: 'active'
        }));

        const { error: conversationError } = await supabase
          .from('notification_conversations')
          .insert(conversations);

        if (conversationError) throw conversationError;
      }

      // 創建標註記錄
      const mentionRecords = mentions.map(mention => ({
        mention_id: crypto.randomUUID(),
        mentioned_user_id: mention.id,
        mentioned_by_user_id: user.userId,
        content_type: notificationData.referenceType,
        content_id: notificationData.referenceId,
        content_text: text
      }));

      const { error: mentionError } = await supabase
        .from('user_mentions')
        .insert(mentionRecords);

      if (mentionError) throw mentionError;

      toast({
        title: "成功",
        description: `已標註 ${mentions.length} 位用戶，等待回覆確認`
      });

    } catch (error) {
      console.error('Error sending mention notifications:', error);
      toast({
        title: "發送通知失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, parseMentions]);

  // 清理文本中的標註格式（用於顯示）
  const cleanMentionText = useCallback((text: string): string => {
    return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
  }, []);

  // 獲取文本中的標註用戶
  const getMentionedUsers = useCallback((text: string): MentionUser[] => {
    return parseMentions(text);
  }, [parseMentions]);

  return {
    isLoading,
    sendMentionNotifications,
    cleanMentionText,
    getMentionedUsers,
    parseMentions
  };
}