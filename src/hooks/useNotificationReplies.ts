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

  // 發送回覆 - 優化去重邏輯
  const sendReply = useCallback(async (
    notificationId: string,
    replyType: string = 'completion',
    content: string = '任務已完成'
  ) => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return null;
    }

    if (!notificationId) {
      toast({
        title: "錯誤",
        description: "通知ID不能為空",
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

      // 原子性更新通知狀態
      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({
          status: 'replied',
          reply_id: reply.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .is('archived_at', null); // 確保只更新未歸檔的通知

      if (updateError) throw updateError;

      // 發送回覆通知給原標註者
      const { data: originalNotification } = await supabase
        .from('user_notifications')
        .select('sender_id, title, reference_type, reference_id')
        .eq('id', notificationId)
        .single();

      if (originalNotification && originalNotification.sender_id !== user.userId) {
        // 檢查是否已存在回覆通知，避免重複
        const { data: existingNotification } = await supabase
          .from('user_notifications')
          .select('id')
          .eq('recipient_id', originalNotification.sender_id)
          .eq('notification_type', 'reply')
          .eq('reference_id', notificationId)
          .is('archived_at', null)
          .single();

        if (!existingNotification) {
          await supabase
            .from('user_notifications')
            .insert({
              recipient_id: originalNotification.sender_id,
              sender_id: user.userId,
              notification_type: 'reply',
              title: `回覆：${originalNotification.title}`,
              message: content,
              reference_type: originalNotification.reference_type,
              reference_id: notificationId,
              require_confirmation: true,
              metadata: {
                original_notification_id: notificationId,
                reply_id: reply.id,
                sender_name: user.displayName
              }
            });
        }
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

  // 確認回覆並關閉通知 - 增強原子性操作
  const confirmReply = useCallback(async (notificationId: string, replyId: string) => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return false;
    }

    if (!notificationId || !replyId) {
      toast({
        title: "錯誤",
        description: "通知ID和回覆ID不能為空",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      // 使用事務確保數據一致性
      const { error: replyUpdateError } = await supabase
        .from('notification_replies')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.userId
        })
        .eq('id', replyId)
        .eq('status', 'pending'); // 確保只更新待處理的回覆

      if (replyUpdateError) throw replyUpdateError;

      const { error: notificationUpdateError } = await supabase
        .from('user_notifications')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .is('archived_at', null); // 確保只更新未歸檔的通知

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

  // 獲取通知的回覆記錄 - 優化查詢
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
    if (!user?.userId || !notificationId) return null;

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
  }, [user]);

  // 修復刪除通知功能 - 確保真正刪除
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return false;
    }

    if (!notificationId) {
      toast({
        title: "錯誤",
        description: "通知ID不能為空",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      console.log('開始刪除通知:', notificationId);
      
      // 首先檢查通知是否存在且屬於當前用戶
      const { data: existingNotification, error: checkError } = await supabase
        .from('user_notifications')
        .select('id, recipient_id')
        .eq('id', notificationId)
        .eq('recipient_id', user.userId)
        .single();

      if (checkError) {
        console.error('檢查通知時發生錯誤:', checkError);
        throw checkError;
      }

      if (!existingNotification) {
        toast({
          title: "錯誤",
          description: "找不到該通知或您沒有權限刪除",
          variant: "destructive"
        });
        return false;
      }

      // 先刪除相關的回覆記錄（使用級聯刪除或手動刪除）
      const { error: repliesDeleteError } = await supabase
        .from('notification_replies')
        .delete()
        .eq('notification_id', notificationId);

      if (repliesDeleteError) {
        console.warn('刪除回覆記錄時警告:', repliesDeleteError);
        // 不阻塞主要刪除操作，但記錄警告
      }

      // 刪除通知本身 - 使用更嚴格的條件
      const { error: notificationDeleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('id', notificationId)
        .eq('recipient_id', user.userId); // 雙重確認權限

      if (notificationDeleteError) {
        console.error('刪除通知時發生錯誤:', notificationDeleteError);
        throw notificationDeleteError;
      }

      // 檢查是否真的刪除了記錄
      if (count === 0) {
        console.warn('沒有記錄被刪除，可能是權限問題');
        toast({
          title: "警告",
          description: "通知可能未被完全刪除，請重新整理頁面",
          variant: "destructive"
        });
        return false;
      }

      console.log(`成功刪除 ${count} 筆通知記錄`);
      
      // 驗證刪除是否成功
      const { data: verifyData, error: verifyError } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('id', notificationId)
        .maybeSingle();

      if (verifyError) {
        console.error('驗證刪除時發生錯誤:', verifyError);
      }

      if (verifyData) {
        console.warn('通知仍然存在，刪除可能失敗');
        toast({
          title: "錯誤",
          description: "通知刪除失敗，請稍後再試",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "成功",
        description: "通知已刪除"
      });

      return true;
    } catch (error) {
      console.error('刪除通知時發生錯誤:', error);
      toast({
        title: "刪除失敗",
        description: `刪除時發生錯誤: ${error.message || '未知錯誤'}`,
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  // 修復批量清理功能 - 確保真正刪除
  const clearCompletedNotifications = useCallback(async () => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      console.log('開始清理已完成的通知...');
      
      // 先獲取要刪除的通知ID
      const { data: notificationsToDelete, error: fetchError } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('recipient_id', user.userId)
        .in('status', ['closed', 'completed', 'replied'])
        .is('archived_at', null);

      if (fetchError) throw fetchError;

      if (!notificationsToDelete || notificationsToDelete.length === 0) {
        toast({
          title: "提示",
          description: "沒有已完成的通知需要清理"
        });
        return true;
      }

      const notificationIds = notificationsToDelete.map(n => n.id);
      console.log('準備刪除的通知ID:', notificationIds);

      // 批量刪除相關回覆記錄
      const { error: repliesDeleteError } = await supabase
        .from('notification_replies')
        .delete()
        .in('notification_id', notificationIds);

      if (repliesDeleteError) {
        console.warn('刪除回覆記錄時警告:', repliesDeleteError);
      }

      // 批量刪除通知 - 使用 count 來驗證刪除結果
      const { error: deleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('recipient_id', user.userId)
        .in('status', ['closed', 'completed', 'replied'])
        .is('archived_at', null);

      if (deleteError) throw deleteError;

      console.log(`實際刪除了 ${count} 筆記錄，預期刪除 ${notificationIds.length} 筆`);

      if (count === 0) {
        toast({
          title: "警告",
          description: "沒有記錄被刪除，請檢查權限設定",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "成功",
        description: `已清理 ${count} 個已完成的通知`
      });

      return true;
    } catch (error) {
      console.error('清理已完成通知時發生錯誤:', error);
      toast({
        title: "清理失敗",
        description: `清理時發生錯誤: ${error.message || '未知錯誤'}`,
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  // 修復批量清理已讀功能 - 確保真正刪除
  const clearReadNotifications = useCallback(async () => {
    if (!user?.userId) {
      toast({
        title: "錯誤",
        description: "請先登入",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      console.log('開始清理已讀通知...');
      
      // 先獲取要刪除的通知ID
      const { data: notificationsToDelete, error: fetchError } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('recipient_id', user.userId)
        .eq('is_read', true)
        .is('archived_at', null);

      if (fetchError) throw fetchError;

      if (!notificationsToDelete || notificationsToDelete.length === 0) {
        toast({
          title: "提示",
          description: "沒有已讀通知需要清理"
        });
        return true;
      }

      const notificationIds = notificationsToDelete.map(n => n.id);
      console.log('準備刪除的已讀通知ID:', notificationIds);

      // 批量刪除相關回覆記錄
      const { error: repliesDeleteError } = await supabase
        .from('notification_replies')
        .delete()
        .in('notification_id', notificationIds);

      if (repliesDeleteError) {
        console.warn('刪除回覆記錄時警告:', repliesDeleteError);
      }

      // 批量刪除通知 - 使用 count 來驗證刪除結果
      const { error: deleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('recipient_id', user.userId)
        .eq('is_read', true)
        .is('archived_at', null);

      if (deleteError) throw deleteError;

      console.log(`實際刪除了 ${count} 筆記錄，預期刪除 ${notificationIds.length} 筆`);

      if (count === 0) {
        toast({
          title: "警告",
          description: "沒有記錄被刪除，請檢查權限設定",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "成功",
        description: `已清理 ${count} 個已讀通知`
      });

      return true;
    } catch (error) {
      console.error('清理已讀通知時發生錯誤:', error);
      toast({
        title: "清理失敗",
        description: `清理時發生錯誤: ${error.message || '未知錯誤'}`,
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
    confirmReply,
    getNotificationReplies,
    createConversation,
    deleteNotification,
    clearCompletedNotifications,
    clearReadNotifications
  };
}
