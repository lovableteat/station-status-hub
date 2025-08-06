
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

  // 簡化版發送標註通知
  const sendMentionNotifications = useCallback(async (
    text: string,
    notificationData: NotificationData
  ) => {
    if (!user?.userId || !text.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const mentions = parseMentions(text);
      
      if (mentions.length === 0) {
        return;
      }

      console.log('發送通知給:', mentions);
      console.log('通知內容:', notificationData);

      // 直接插入通知，不做複雜驗證
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
        is_read: false,
        metadata: {
          ...notificationData.metadata,
          mention_text: text,
          sender_name: user.displayName || user.username
        }
      }));

      const { data, error } = await supabase
        .from('user_notifications')
        .insert(notifications)
        .select();

      if (error) {
        console.error('插入通知錯誤:', error);
        throw error;
      }

      console.log('通知發送成功:', data);

      toast({
        title: "通知發送成功",
        description: `已標註 ${mentions.length} 位用戶`
      });

    } catch (error) {
      console.error('發送通知失敗:', error);
      toast({
        title: "發送通知失敗",
        description: error instanceof Error ? error.message : "未知錯誤",
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

  return {
    isLoading,
    sendMentionNotifications,
    cleanMentionText,
    parseMentions
  };
}
