import { useState, useEffect, useCallback, useRef } from 'react';
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
  read_at?: string;
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
  const channelRef = useRef<any>(null);

  // 載入通知 - 優化版本
  const loadNotifications = useCallback(async () => {
    if (!user?.userId) {
      console.log('⚠️ 無用戶ID，跳過載入通知');
      return;
    }

    try {
      setIsLoading(true);
      console.log(`🔍 載入用戶 ${user.userId} 的通知...`);
      
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('recipient_id', user.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50); // 限制數量避免性能問題

      if (error) {
        console.error('❌ 載入通知錯誤:', error);
        throw error;
      }

      const notificationData = data || [];
      console.log(`✅ 成功載入 ${notificationData.length} 個通知`);
      
      setNotifications(notificationData);
      const unread = notificationData.filter(n => !n.is_read).length;
      setUnreadCount(unread);
      console.log(`📊 未讀通知數量: ${unread}`);
      
    } catch (error) {
      console.error('❌ 載入通知失敗:', error);
      toast.error('載入通知失敗');
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [user?.userId]);

  // 刪除通知
  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!user?.userId) return false;

    try {
      console.log(`🗑️ 刪除通知: ${notificationId}`);
      
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.userId);

      if (error) throw error;

      console.log('✅ 通知刪除成功');
      toast.success('通知已刪除');
      
      // 立即更新本地狀態
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
      console.error('❌ 刪除失敗:', error);
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
      setNotifications(prev => {
        const filtered = prev.filter(n => !n.tags?.includes(tag));
        const deletedUnread = prev.filter(n => n.tags?.includes(tag) && !n.is_read).length;
        setUnreadCount(current => Math.max(0, current - deletedUnread));
        return filtered;
      });
      
      return true;
    } catch (error) {
      console.error('❌ 按標籤刪除失敗:', error);
      toast.error('刪除失敗');
      return false;
    }
  }, [user?.userId, notifications]);

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
      console.error('❌ 清空失敗:', error);
      toast.error('清空失敗');
      return false;
    }
  }, [user?.userId]);

  // 標記為已讀
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!user?.userId) return false;

    // 先檢查是否已讀
    const notification = notifications.find(n => n.id === notificationId);
    if (notification?.is_read) {
      console.log('📖 通知已讀，跳過標記');
      return true;
    }

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
      
      // 立即更新本地狀態
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
      console.error('❌ 標記失敗:', error);
      return false;
    }
  }, [user?.userId, notifications]);

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

  // 設置實時訂閱
  useEffect(() => {
    if (!user?.userId) {
      console.log('⚠️ 無用戶ID，跳過實時訂閱');
      return;
    }

    console.log(`🔔 設置用戶 ${user.userId} 的實時通知訂閱`);
    
    // 初始載入
    loadNotifications();

    // 清理舊的channel
    if (channelRef.current) {
      console.log('🧹 清理舊的通知訂閱');
      supabase.removeChannel(channelRef.current);
    }

    // 建立新的實時訂閱
    const channel = supabase
      .channel(`notifications_${user.userId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('🔄 通知實時更新:', payload.eventType, payload.new);
        
        // 對於插入事件，立即添加到本地狀態
        if (payload.eventType === 'INSERT' && payload.new) {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
          toast(`📢 新通知: ${newNotification.title}`);
        } else {
          // 其他事件重新載入確保一致性
          loadNotifications();
        }
      })
      .subscribe((status) => {
        console.log('📡 通知訂閱狀態:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('🧹 清理通知訂閱');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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
    deleteByTag,
    clearAllNotifications,
    markAsRead,
    loadNotifications,
    getAllTags
  };
}