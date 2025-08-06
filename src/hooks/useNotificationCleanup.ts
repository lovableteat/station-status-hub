
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { useToast } from '@/hooks/use-toast';

export function useNotificationCleanup() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.userId || !notificationId) {
      toast({
        title: "錯誤",
        description: "請先登入或提供有效的通知ID",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      console.log('開始刪除通知:', notificationId);
      
      // 使用更嚴格的刪除條件，確保用戶只能刪除自己的通知
      const { error: deleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('id', notificationId)
        .eq('recipient_id', user.userId);

      if (deleteError) {
        console.error('刪除通知時發生錯誤:', deleteError);
        throw deleteError;
      }

      if (count === 0) {
        toast({
          title: "警告",
          description: "通知不存在或您沒有權限刪除",
          variant: "destructive"
        });
        return false;
      }

      console.log(`成功刪除 ${count} 筆通知記錄`);
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
      
      // 利用觸發器的自動清理功能，只需要觸發一次更新
      const { error: deleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('recipient_id', user.userId)
        .in('status', ['closed', 'completed', 'replied'])
        .is('archived_at', null);

      if (deleteError) throw deleteError;

      console.log(`實際刪除了 ${count} 筆記錄`);

      if (count === 0) {
        toast({
          title: "提示",
          description: "沒有已完成的通知需要清理"
        });
        return true;
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
      
      const { error: deleteError, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('recipient_id', user.userId)
        .eq('is_read', true)
        .is('archived_at', null);

      if (deleteError) throw deleteError;

      console.log(`實際刪除了 ${count} 筆記錄`);

      if (count === 0) {
        toast({
          title: "提示",
          description: "沒有已讀通知需要清理"
        });
        return true;
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
    deleteNotification,
    clearCompletedNotifications,
    clearReadNotifications
  };
}
