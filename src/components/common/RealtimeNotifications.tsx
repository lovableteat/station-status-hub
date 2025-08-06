import { useState, useEffect } from "react";
import { Bell, X, MessageSquare, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";
import { useNotificationReplies } from "@/hooks/useNotificationReplies";
import { NotificationReplyDialog } from "@/components/common/NotificationReplyDialog";
import { NotificationConversationView } from "@/components/issues/NotificationConversationView";
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

interface UserNotification {
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
  require_confirmation?: boolean;
  reply_id?: string;
}

export function RealtimeNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null);
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [showConversation, setShowConversation] = useState<{ issueId?: string; referenceType?: string; referenceId?: string } | null>(null);
  
  const { sendReply, confirmReply, deleteNotification, isLoading } = useNotificationReplies();

  // 載入用戶通知
  useEffect(() => {
    if (!user) return;

    const fetchUserNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .select('*')
          .eq('recipient_id', user.userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        
        setUserNotifications(data || []);
        setUnreadCount(data?.filter(n => !n.is_read).length || 0);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchUserNotifications();
  }, [user]);

  // 實時監聽
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
      // 監聽用戶通知
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        const newNotification = payload.new as UserNotification;
        setUserNotifications(prev => [newNotification, ...prev.slice(0, 19)]);
        if (!newNotification.is_read) {
          setUnreadCount(prev => prev + 1);
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        const updatedNotification = payload.new as UserNotification;
        setUserNotifications(prev => 
          prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
        );
        
        // 重新計算未讀數量
        setUserNotifications(current => {
          const unread = current.filter(n => !n.is_read).length;
          setUnreadCount(unread);
          return current;
        });
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

  const markUserNotificationAsRead = async (notification: UserNotification) => {
    if (notification.is_read) return;
    
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notification.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
  };

  const handleQuickReply = async (notification: UserNotification) => {
    setSelectedNotification(notification);
    setShowReplyDialog(true);
    await markUserNotificationAsRead(notification);
  };

  const handleConfirmReply = async (notification: UserNotification, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    if (!notification.reply_id) {
      console.error('No reply_id found for notification:', notification.id);
      return;
    }
    
    console.log('Confirming reply for notification:', notification.id, 'reply_id:', notification.reply_id);
    const success = await confirmReply(notification.id, notification.reply_id);
    if (success) {
      await markUserNotificationAsRead(notification);
    }
  };

  const handleShowConversation = async (notification: UserNotification) => {
    await markUserNotificationAsRead(notification);
    setShowConversation({
      issueId: notification.reference_id,
      referenceType: notification.reference_type,
      referenceId: notification.reference_id
    });
  };

  const handleDeleteNotification = async (notification: UserNotification, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    if (!confirm("確定要刪除這個通知嗎？")) return;
    
    const success = await deleteNotification(notification.id);
    if (success) {
      // 從列表中移除通知
      setUserNotifications(prev => prev.filter(n => n.id !== notification.id));
      if (!notification.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
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

  const getUserNotificationIcon = (type: string) => {
    return <Bell className="h-4 w-4 text-primary" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'replied': return 'text-blue-600';
      case 'closed': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待回覆';
      case 'replied': return '已回覆';
      case 'closed': return '已關閉';
      default: return status;
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
    <>
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
                    全部標記已讀 ({unreadCount})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                {/* 用戶通知 */}
                {userNotifications.length > 0 && (
                  <div className="space-y-1 p-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">用戶通知</div>
                    {userNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          notification.is_read 
                            ? "bg-muted/50 border-transparent" 
                            : "bg-background border-primary/20 shadow-sm"
                        )}
                      >
                        <div className="mt-0.5"><Bell className="h-4 w-4 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{notification.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {notification.message}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn("text-xs", getStatusColor(notification.status))}>
                              {getStatusText(notification.status)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(notification.created_at)}
                            </span>
                          </div>
                          
                          {/* 操作按鈕 */}
                          <div className="flex gap-1 mt-2">
                            {notification.notification_type === 'mention' && notification.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuickReply(notification)}
                                className="h-6 text-xs px-2"
                                disabled={isLoading}
                              >
                                快速回覆
                              </Button>
                            )}
                            {notification.notification_type === 'reply' && notification.require_confirmation && notification.reply_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleConfirmReply(notification, e)}
                                className="h-6 text-xs px-2"
                                disabled={isLoading}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                確認完成
                              </Button>
                             )}
                             {(notification.reference_type === 'issue' || notification.reference_type === 'test_progress') && (
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => handleShowConversation(notification)}
                                 className="h-6 text-xs px-2"
                               >
                                 <MessageSquare className="h-3 w-3 mr-1" />
                                 查看對話
                               </Button>
                             )}
                             {/* 刪除按鈕 - 只有發送者且狀態為已完成時可見 */}
                             {notification.sender_id === user?.userId && 
                              ['closed', 'completed', 'replied'].includes(notification.status) && (
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={(e) => handleDeleteNotification(notification, e)}
                                 className="h-6 text-xs px-2 text-red-600 hover:text-red-700"
                                 disabled={isLoading}
                               >
                                 <Trash2 className="h-3 w-3 mr-1" />
                                 刪除
                               </Button>
                             )}
                           </div>
                         </div>
                         {!notification.is_read && (
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => markUserNotificationAsRead(notification)}
                             className="h-6 w-6 p-0"
                           >
                             <X className="h-3 w-3" />
                           </Button>
                         )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 系統通知 */}
                {notifications.length > 0 && (
                  <>
                    {userNotifications.length > 0 && <Separator />}
                    <div className="space-y-1 p-4">
                      <div className="text-xs font-medium text-muted-foreground mb-2">系統通知</div>
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
                  </>
                )}

                {/* 無通知顯示 */}
                {notifications.length === 0 && userNotifications.length === 0 && (
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
      
      {/* 回覆對話框 */}
      {selectedNotification && (
        <NotificationReplyDialog
          isOpen={showReplyDialog}
          onClose={() => {
            setShowReplyDialog(false);
            setSelectedNotification(null);
          }}
          notification={selectedNotification}
        />
      )}

      {/* 對話歷史 */}
      {showConversation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">通知對話歷史</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConversation(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                <NotificationConversationView
                  issueId={showConversation.issueId}
                  referenceType={showConversation.referenceType || 'issue'}
                  referenceId={showConversation.referenceId || ''}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
