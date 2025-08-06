
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useNotificationQueries() {
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

  const createConversation = useCallback(async (
    notificationId: string,
    participantIds: string[],
    subject: string
  ) => {
    try {
      // 檢查是否已存在對話
      const { data: existingConversation } = await supabase
        .from('notification_conversations')
        .select('id')
        .eq('notification_id', notificationId)
        .single();

      if (existingConversation) {
        return existingConversation;
      }

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
  }, []);

  return {
    getNotificationReplies,
    createConversation
  };
}
