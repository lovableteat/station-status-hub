import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  status: string;
  is_read: boolean;
  created_at: string;
  sender_id: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: any;
  archived_at?: string;
}

export function useNotificationManager() {
  const { user } = useUser();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // 載入通知
  const loadNotifications = useCallback(async () => {
    if (!user?.userId) return;

    try {
      console.log('🔄 載入通知中...');
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('recipient_id', user.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
      console.log(`✅ 載入了 ${data?.length || 0} 個通知`);
    } catch (error) {
      console.error('❌ 載入通知失敗:', error);
      toast({
        title: "載入失敗",
        description: "無法載入通知",
        variant: "destructive"
      });
    }
  }, [user?.userId, toast]);

  // 刪除單個通知 - 核心功能  
  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!notificationId || notificationId === 'undefined') {
      console.error('❌ 無效的通知 ID:', notificationId);
      return false;
    }

    if (!user?.userId) {
      console.error('❌ 用戶未登入');
      return false;
    }

    setIsLoading(true);
    try {
      console.log('🗑️ 正在刪除通知:', notificationId, '用戶:', user.userId);
      
      // 使用更明確的刪除語法
      const { data, error, count } = await supabase
        .from('user_notifications')
        .delete({ count: 'exact' })
        .eq('id', notificationId)
        .eq('recipient_id', user.userId);

      if (error) {
        console.error('❌ 刪除錯誤:', error);
        throw error;
      }

      console.log('✅ 刪除結果:', { data, count });
      
      if (count === 0) {
        console.warn('⚠️ 沒有刪除任何記錄，可能通知不存在或權限不足');
        toast({
          title: "刪除失敗",
          description: "通知不存在或無權限刪除",
          variant: "destructive"
        });
        return false;
      }

      console.log('✅ 通知刪除成功:', notificationId, '刪除數量:', count);
      
      // 立即更新本地狀態
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => {
        const deletedNotif = notifications.find(n => n.id === notificationId);
        return deletedNotif && !deletedNotif.is_read ? Math.max(0, prev - 1) : prev;
      });

      toast({
        title: "刪除成功",
        description: "通知已永久刪除"
      });

      return true;
    } catch (error) {
      console.error('❌ 刪除通知失敗:', error);
      toast({
        title: "刪除失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.userId, notifications, toast]);

  // 批量刪除
  const deleteMultipleNotifications = useCallback(async (notificationIds: string[]): Promise<boolean> => {
    if (notificationIds.length === 0) return true;

    setIsLoading(true);
    try {
      console.log(`🗑️ 正在批量刪除 ${notificationIds.length} 個通知`);
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .in('id', notificationIds)
        .eq('recipient_id', user?.userId);

      if (error) throw error;

      console.log('✅ 批量刪除成功');
      
      // 更新本地狀態
      setNotifications(prev => prev.filter(n => !notificationIds.includes(n.id)));
      setUnreadCount(prev => {
        const deletedUnreadCount = notifications.filter(n => 
          notificationIds.includes(n.id) && !n.is_read
        ).length;
        return Math.max(0, prev - deletedUnreadCount);
      });

      toast({
        title: "批量刪除成功",
        description: `已刪除 ${notificationIds.length} 個通知`
      });

      return true;
    } catch (error) {
      console.error('❌ 批量刪除失敗:', error);
      toast({
        title: "批量刪除失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.userId, notifications, toast]);

  // 清空所有通知
  const clearAllNotifications = useCallback(async (): Promise<boolean> => {
    if (!user?.userId) return false;

    setIsLoading(true);
    try {
      console.log('🧹 正在清空所有通知...');
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('recipient_id', user.userId)
        .is('archived_at', null);

      if (error) throw error;

      console.log('✅ 所有通知已清空');
      
      setNotifications([]);
      setUnreadCount(0);

      toast({
        title: "清空成功",
        description: "所有通知已清空"
      });

      return true;
    } catch (error) {
      console.error('❌ 清空失敗:', error);
      toast({
        title: "清空失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.userId, toast]);

  // 標記為已讀
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .eq('recipient_id', user?.userId);

      if (error) throw error;

      // 更新本地狀態
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      return true;
    } catch (error) {
      console.error('❌ 標記已讀失敗:', error);
      return false;
    }
  }, [user?.userId]);

  // 設置實時訂閱
  useEffect(() => {
    if (!user?.userId) return;

    loadNotifications();

    const channel = supabase
      .channel('notifications_manager')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('📩 收到新通知:', payload.new);
        const newNotification = payload.new as Notification;
        if (!newNotification.archived_at) {
          setNotifications(prev => [newNotification, ...prev.slice(0, 49)]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('🗑️ 通知被刪除:', payload.old);
        const deletedNotification = payload.old as Notification;
        setNotifications(prev => prev.filter(n => n.id !== deletedNotification.id));
        if (!deletedNotification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.userId, loadNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    deleteNotification,
    deleteMultipleNotifications,
    clearAllNotifications,
    markAsRead,
    loadNotifications
  };
}