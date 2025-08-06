
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
        username: '',
        displayName,
        role: ''
      });
    }

    return mentions;
  }, []);

  // 發送標註通知（簡化版本）
  const sendMentionNotifications = useCallback(async (
    text: string,
    notificationData: NotificationData
  ) => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return;
    }

    if (!notificationData.referenceId) {
      toast({
        title: "錯誤", 
        description: "參考ID不能為空",
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

      // 直接創建通知記錄，使用當前登入用戶的資訊
      const notifications = mentions.map(mention => ({
        recipient_id: mention.id,
        sender_id: user.userId,
        notification_type: 'mention',
        title: notificationData.title,
        message: notificationData.message,
        reference_type: notificationData.referenceType,
        reference_id: notificationData.referenceId,
        status: 'pending',
        priority: 'normal',
        category: 'mention',
        metadata: {
          ...notificationData.metadata,
          mention_text: text,
          sender_name: user.displayName
        }
      }));

      console.log('Sending notifications:', notifications);

      const { data: createdNotifications, error: notificationError } = await supabase
        .from('user_notifications')
        .insert(notifications)
        .select();

      if (notificationError) {
        console.error('Notification error:', notificationError);
        throw notificationError;
      }

      console.log('Notifications created successfully:', createdNotifications);

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

      if (mentionError) {
        console.error('Mention error:', mentionError);
        // 不拋出錯誤，因為通知已經成功創建
      }

      toast({
        title: "成功",
        description: `已標註 ${mentions.length} 位用戶，通知已發送`
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
