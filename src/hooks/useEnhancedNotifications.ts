import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";
import { useToast } from "@/hooks/use-toast";

export interface EnhancedNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  category: string;
  priority: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: any;
  is_read: boolean;
  read_at?: string;
  expires_at?: string;
  action_url?: string;
  grouped_id?: string;
  created_at: string;
  updated_at: string;
  sender_id: string;
  recipient_id: string;
}

export interface NotificationStats {
  total_notifications: number;
  unread_notifications: number;
  high_priority_unread: number;
  urgent_priority_unread: number;
  categories_breakdown: any;
}

export interface NotificationPreferences {
  category: string;
  enabled: boolean;
  delivery_method: string[];
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export function useEnhancedNotifications() {
  const { user } = useUser();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<EnhancedNotification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch notifications with enhanced filtering and sorting
  const fetchNotifications = useCallback(async (options?: {
    category?: string;
    priority?: string;
    limit?: number;
    includeRead?: boolean;
  }) => {
    if (!user) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('user_notifications')
        .select('*')
        .eq('recipient_id', user.userId)
        .order('created_at', { ascending: false });

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      if (options?.priority) {
        query = query.eq('priority', options.priority);
      }

      if (!options?.includeRead) {
        query = query.eq('is_read', false);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "通知載入失敗",
        description: "無法載入通知，請稍後重試",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  // Fetch notification statistics
  const fetchStats = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_notification_stats', { user_uuid: user.userId });

      if (error) throw error;

      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error) {
      console.error('Error fetching notification stats:', error);
    }
  }, [user]);

  // Fetch user preferences
  const fetchPreferences = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.userId);

      if (error) throw error;

      setPreferences(data || []);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  }, [user]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId);

      if (error) throw error;

      // Track analytics
      await supabase
        .from('notification_analytics')
        .insert({
          notification_id: notificationId,
          user_id: user?.userId,
          action: 'read'
        });

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { 
          ...n, 
          is_read: true, 
          read_at: new Date().toISOString() 
        } : n)
      );

      // Update stats
      fetchStats();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [user?.userId, fetchStats]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async (category?: string) => {
    if (!user) return;

    try {
      let query = supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('recipient_id', user.userId)
        .eq('is_read', false);

      if (category) {
        query = query.eq('category', category);
      }

      const { error } = await query;

      if (error) throw error;

      setNotifications(prev => 
        prev.map(n => ({
          ...n,
          is_read: true,
          read_at: new Date().toISOString()
        }))
      );

      // Update stats
      fetchStats();

      toast({
        title: "通知已標記為已讀",
        description: category ? `${category} 類別的通知已全部標記為已讀` : "所有通知已標記為已讀",
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [user, fetchStats, toast]);

  // Dismiss/delete notification
  const dismissNotification = useCallback(async (notificationId: string) => {
    try {
      // Track analytics before deletion
      await supabase
        .from('notification_analytics')
        .insert({
          notification_id: notificationId,
          user_id: user?.userId,
          action: 'dismissed'
        });

      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      fetchStats();
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  }, [user?.userId, fetchStats]);

  // Update notification preferences
  const updatePreferences = useCallback(async (categoryPrefs: NotificationPreferences) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.userId,
          ...categoryPrefs,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setPreferences(prev => {
        const updated = prev.filter(p => p.category !== categoryPrefs.category);
        return [...updated, categoryPrefs];
      });

      toast({
        title: "偏好設定已更新",
        description: `${categoryPrefs.category} 類別的通知偏好已更新`,
      });
    } catch (error) {
      console.error('Error updating preferences:', error);
    }
  }, [user, toast]);

  // Group notifications by type/reference
  const groupedNotifications = notifications.reduce((acc, notification) => {
    const key = notification.grouped_id || notification.reference_id || notification.id;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(notification);
    return acc;
  }, {} as Record<string, EnhancedNotification[]>);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    fetchNotifications();
    fetchStats();
    fetchPreferences();

    const channel = supabase
      .channel('enhanced_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_id=eq.${user.userId}`
        },
        (payload) => {
          const newNotification = payload.new as EnhancedNotification;
          
          setNotifications(prev => [newNotification, ...prev]);
          fetchStats();

          // Show toast for high priority notifications
          if (newNotification.priority === 'high' || newNotification.priority === 'urgent') {
            toast({
              title: newNotification.title,
              description: newNotification.message,
              variant: newNotification.priority === 'urgent' ? "destructive" : "default",
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_id=eq.${user.userId}`
        },
        (payload) => {
          const updatedNotification = payload.new as EnhancedNotification;
          setNotifications(prev => 
            prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
          );
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications, fetchStats, fetchPreferences, toast]);

  return {
    notifications,
    groupedNotifications,
    stats,
    preferences,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    updatePreferences,
    refreshStats: fetchStats,
  };
}