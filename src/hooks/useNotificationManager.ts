import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { toast } from 'sonner';

interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string;
  notification_type: string;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: string;
  status: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  priority: string;
  tags: string[];
}

export function useNotificationManager() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 載入通知 - 簡化版
  const loadNotifications = useCallback(async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);
      console.log('🔍 載入通知中...');
      
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('recipient_id', user.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log(`✅ 載入了 ${data?.length || 0} 個通知`);
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('載入通知失敗:', error);
      toast.error('載入通知失敗');
    } finally {
      setIsLoading(false);
    }
  }, [user?.userId]);

  // 刪除通知 - 徹底刪除
  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!user?.userId) return false;

    try {
      console.log(`🗑️ 徹底刪除通知: ${notificationId}`);
      
      // 直接從資料庫永久刪除
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.userId);

      if (error) throw error;

      console.log('✅ 通知已徹底刪除');
      toast.success('通知已刪除');
      
      // 立即從本地移除
      setNotifications(prev => {
        const filtered = prev.filter(n => n.id !== notificationId);
        const deletedNotification = prev.find(n => n.id === notificationId);
        if (deletedNotification && !deletedNotification.is_read) {
          setUnreadCount(current => Math.max(0, current - 1));
        }
        return filtered;
      });
      
      return true;
    } catch (error) {
      console.error('刪除失敗:', error);
      toast.error('刪除失敗');
      return false;
    }
  }, [user?.userId]);

  // 按標籤批量刪除
  const deleteByTag = useCallback(async (tag: string): Promise<boolean> => {
    if (!user?.userId) return false;

    try {
      console.log(`🏷️ 刪除標籤為 "${tag}" 的通知`);
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('recipient_id', user.userId)
        .contains('tags', [tag]);

      if (error) throw error;

      const deletedCount = notifications.filter(n => n.tags?.includes(tag)).length;
      console.log(`✅ 已刪除 ${deletedCount} 個 "${tag}" 標籤的通知`);
      toast.success(`已刪除 ${deletedCount} 個 "${tag}" 通知`);
      
      // 更新本地狀態
      setNotifications(prev => prev.filter(n => !n.tags?.includes(tag)));
      
      return true;
    } catch (error) {
      console.error('按標籤刪除失敗:', error);
      toast.error('刪除失敗');
      return false;
    }
  }, [user?.userId, notifications]);

  // 批量刪除多個通知
  const deleteMultipleNotifications = useCallback(async (notificationIds: string[]): Promise<boolean> => {
    if (!user?.userId || notificationIds.length === 0) return false;

    try {
      console.log(`🗑️ 批量刪除 ${notificationIds.length} 個通知`);
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .in('id', notificationIds)
        .eq('recipient_id', user.userId);

      if (error) throw error;

      console.log(`✅ 批量刪除成功`);
      toast.success(`已刪除 ${notificationIds.length} 個通知`);
      
      setNotifications(prev => prev.filter(n => !notificationIds.includes(n.id)));
      return true;
    } catch (error) {
      console.error('批量刪除失敗:', error);
      toast.error('批量刪除失敗');
      return false;
    }
  }, [user?.userId]);

  // 清空所有通知
  const clearAllNotifications = useCallback(async (): Promise<boolean> => {
    if (!user?.userId) return false;

    try {
      console.log('🗑️ 清空所有通知');
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('recipient_id', user.userId);

      if (error) throw error;

      console.log('✅ 所有通知已清空');
      toast.success('所有通知已清除');
      
      setNotifications([]);
      setUnreadCount(0);
      
      return true;
    } catch (error) {
      console.error('清空失敗:', error);
      toast.error('清空失敗');
      return false;
    }
  }, [user?.userId]);

  // 標記為已讀
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!user?.userId) return false;

    try {
      console.log(`👁️ 標記已讀: ${notificationId}`);
      
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .eq('recipient_id', user.userId);

      if (error) throw error;

      console.log('✅ 已標記為已讀');
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
      return true;
    } catch (error) {
      console.error('標記失敗:', error);
      return false;
    }
  }, [user?.userId]);

  // 獲取所有標籤
  const getAllTags = useCallback(() => {
    const allTags = new Set<string>();
    notifications.forEach(n => {
      n.tags?.forEach(tag => allTags.add(tag));
    });
    return Array.from(allTags).sort();
  }, [notifications]);

  // 根據標籤過濾通知
  const getFilteredNotifications = useCallback(() => {
    if (!selectedTag) return notifications;
    return notifications.filter(n => n.tags?.includes(selectedTag));
  }, [notifications, selectedTag]);

  // 強制重新載入
  const forceReloadNotifications = useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  // 實時訂閱
  useEffect(() => {
    if (!user?.userId) return;

    loadNotifications();

    const channel = supabase
      .channel(`notifications_${user.userId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('🔄 通知變更:', payload);
        // 任何變更都重新載入，確保資料同步
        loadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.userId, loadNotifications]);

  return {
    notifications: getFilteredNotifications(),
    allNotifications: notifications,
    unreadCount,
    isLoading,
    selectedTag,
    setSelectedTag,
    deleteNotification,
    deleteMultipleNotifications,
    deleteByTag,
    clearAllNotifications,
    markAsRead,
    loadNotifications,
    forceReloadNotifications,
    getAllTags
  };
}