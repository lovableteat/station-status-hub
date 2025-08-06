import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";
import { cn } from "@/lib/utils";

interface RealtimeNotification {
  id: string;
  type: 'system_update' | 'user_action' | 'issue_created' | 'test_completed';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  metadata?: any;
}

export function RealtimeNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Listen to real-time changes and create notifications
    const channel = supabase
      .channel('notification_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'test_systems' }, (payload) => {
        addNotification({
          type: 'system_update',
          title: '新系統已加入',
          message: `系統 "${payload.new.system_name}" 已加入測試流程`,
          metadata: { systemId: payload.new.id }
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'test_systems' }, (payload) => {
        if (payload.new.status === 'Done' && payload.old.status !== 'Done') {
          addNotification({
            type: 'test_completed',
            title: '測試完成',
            message: `系統 "${payload.new.system_name}" 已完成所有測試`,
            metadata: { systemId: payload.new.id }
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'issues' }, (payload) => {
        addNotification({
          type: 'issue_created',
          title: '新問題回報',
          message: `問題 "${payload.new.title}" 需要處理`,
          metadata: { issueId: payload.new.id }
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'test_progress' }, (payload) => {
        if (payload.new.status === 'Done' && payload.old.status !== 'Done') {
          addNotification({
            type: 'user_action',
            title: '測試項目完成',
            message: `測試項目已由 ${payload.new.assigned_to || '系統'} 標記為完成`,
            metadata: { progressId: payload.new.id }
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addNotification = (notification: Omit<RealtimeNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: RealtimeNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      read: false
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 19)]); // Keep only 20 notifications
    setUnreadCount(prev => prev + 1);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
  };

  const getNotificationIcon = (type: RealtimeNotification['type']) => {
    switch (type) {
      case 'system_update': return '🔧';
      case 'user_action': return '👤';
      case 'issue_created': return '⚠️';
      case 'test_completed': return '✅';
      default: return '📢';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return '剛剛';
    if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} 小時前`;
    return date.toLocaleDateString('zh-TW');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "fixed top-4 left-1/2 transform -translate-x-1/2 z-50",
            "bg-primary/10 border border-primary/20 backdrop-blur-sm hover:bg-primary/20",
            "animate-fade-in"
          )}
        >
          <div className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-96">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">即時通知</CardTitle>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  全部標記已讀
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-80">
              {notifications.length > 0 ? (
                <div className="space-y-1 p-4">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                        notification.read 
                          ? "bg-muted/50 border-transparent" 
                          : "bg-background border-primary/20 shadow-sm"
                      )}
                    >
                      <div className="text-lg">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{notification.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {notification.message}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatTimestamp(notification.timestamp)}
                        </div>
                      </div>
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead(notification.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">暫無通知</div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}