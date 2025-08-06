import { useState, useEffect } from "react";
import { X, Bell, AtSign, AlertCircle, CheckCircle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface FacebookNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
  sender_id: string;
}

interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export function FacebookStyleNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<FacebookNotification[]>([]);
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);

  // 獲取用戶通知
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .select('*')
          .eq('recipient_id', user.userId)
          .eq('is_read', false)
          .neq('notification_type', 'mention') // 過濾掉標註通知
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setNotifications(data || []);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();

    // 設置實時訂閱 - 過濾掉標註通知
    const channel = supabase
      .channel('facebook_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_id=eq.${user.userId}`
        },
        (payload) => {
          const newNotification = payload.new as FacebookNotification;
          
          // 完全過濾掉標註通知，不在右下角顯示
          if (newNotification.notification_type === 'mention') {
            return;
          }
          
          setNotifications(prev => [newNotification, ...prev.slice(0, 4)]);
          
          // 創建臨時顯示的toast通知
          const toastId = crypto.randomUUID();
          setToastNotifications(prev => [...prev, {
            id: toastId,
            title: newNotification.title,
            message: newNotification.message,
            type: getToastType(newNotification.notification_type),
            duration: 5000
          }]);

          // 5秒後自動移除toast
          setTimeout(() => {
            setToastNotifications(prev => prev.filter(t => t.id !== toastId));
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // 標記通知為已讀並移除
  const dismissNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  // 移除toast通知
  const dismissToast = (toastId: string) => {
    setToastNotifications(prev => prev.filter(t => t.id !== toastId));
  };

  // 格式化時間
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return '剛剛';
    if (diffInMinutes < 60) return `${diffInMinutes}分鐘前`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}小時前`;
    return `${Math.floor(diffInMinutes / 1440)}天前`;
  };

  // 獲取通知圖標
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'mention':
        return <AtSign className="h-5 w-5 text-blue-500" />;
      case 'system':
        return <Bell className="h-5 w-5 text-gray-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  // 獲取Toast類型
  const getToastType = (notificationType: string): 'info' | 'success' | 'warning' | 'error' => {
    switch (notificationType) {
      case 'mention':
        return 'info';
      case 'system':
        return 'success';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  // 獲取Toast圖標
  const getToastIcon = (type: 'info' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  // 獲取Toast背景顏色
  const getToastBgColor = (type: 'info' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <>
      {/* Toast 通知 - 臨時顯示在螢幕頂部 */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] space-y-2">
        {toastNotifications.map((toast) => (
          <Card
            key={toast.id}
            className={cn(
              "w-96 p-4 shadow-lg border-l-4 animate-fade-in",
              getToastBgColor(toast.type)
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getToastIcon(toast.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-gray-900">{toast.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{toast.message}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissToast(toast.id)}
                className="h-6 w-6 p-0 hover:bg-gray-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Facebook 風格持久通知 - 右下角 */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-3 w-80">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className="p-4 bg-white shadow-lg border-l-4 border-l-blue-500 animate-scale-in"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  {getNotificationIcon(notification.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-gray-900">
                      {notification.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {formatTime(notification.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    {notification.message}
                  </p>
                  
                  {/* 標註通知的特殊顯示 */}
                  {notification.notification_type === 'mention' && notification.metadata?.sender_name && (
                    <p className="text-xs text-blue-600 mt-2">
                      來自 {notification.metadata.sender_name} 的標註
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissNotification(notification.id)}
                  className="h-6 w-6 p-0 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}