
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/components/auth/UserContext';
import { toast } from 'sonner';

interface NotificationData {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  priority: string;
  tags: string[];
}

export function useNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // 載入通知
  const fetchNotifications = async () => {
    if (!user?.userId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('id, title, message, is_read, created_at, priority, tags')
        .eq('recipient_id', user.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('載入通知失敗:', error);
      toast.error('載入通知失敗');
    } finally {
      setLoading(false);
    }
  };

  // 標記為已讀
  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('標記已讀失敗:', error);
      toast.error('標記已讀失敗');
    }
  };

  // 刪除通知
  const deleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const notification = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      
      if (notification && !notification.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      toast.success('通知已刪除');
    } catch (error) {
      console.error('刪除通知失敗:', error);
      toast.error('刪除通知失敗');
    }
  };

  // 清空所有通知
  const clearAll = async () => {
    if (!user?.userId) return;
    
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('recipient_id', user.userId);

      if (error) throw error;

      setNotifications([]);
      setUnreadCount(0);
      toast.success('所有通知已清除');
    } catch (error) {
      console.error('清空通知失敗:', error);
      toast.error('清空通知失敗');
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.userId]);

  // 實時訂閱
  useEffect(() => {
    if (!user?.userId) return;

    const channel = supabase
      .channel(`user_notifications_${user.userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newNotification = payload.new as NotificationData;
          setNotifications(prev => [newNotification, ...prev]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
            toast(`新通知: ${newNotification.title}`);
          }
        } else {
          fetchNotifications();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    deleteNotification,
    clearAll,
    refresh: fetchNotifications
  };
}
