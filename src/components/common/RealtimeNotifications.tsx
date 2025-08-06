import { useState, useEffect } from "react";
import { Bell, X, Trash2 } from "lucide-react";
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
import { NotificationCard } from "@/components/common/NotificationCard";
import { useOptimizedRealtime } from "@/hooks/useOptimizedRealtime";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  archived_at?: string;
  archived_by?: string;
}

export function RealtimeNotifications() {
  const { user } = useUser();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null);
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [showConversation, setShowConversation] = useState<{ issueId?: string; referenceType?: string; referenceId?: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const { 
    sendReply, 
    confirmReply, 
    deleteNotification, 
    clearCompletedNotifications,
    clearReadNotifications,
    isLoading 
  } = useNotificationReplies();

  useOptimizedRealtime();

  const loadUserNotifications = async () => {
    if (!user?.userId) return;

    try {
      setIsUpdating(true);
      console.log('Loading user notifications...');
      
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('recipient_id', user.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      const uniqueNotifications = data?.filter((notification, index, self) => 
        index === self.findIndex((n) => 
          n.id === notification.id || 
          (n.reference_id === notification.reference_id && 
           n.notification_type === notification.notification_type &&
           n.sender_id === notification.sender_id &&
           Math.abs(new Date(n.created_at).getTime() - new Date(notification.created_at).getTime()) < 60000)
        )
      ) || [];
      
      setUserNotifications(uniqueNotifications);
      setUnreadCount(uniqueNotifications.filter(n => !n.is_read).length);
      
      console.log(`Loaded ${uniqueNotifications.length} notifications, ${uniqueNotifications.filter(n => !n.is_read).length} unread`);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "載入通知失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadUserNotifications();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time subscription for notifications...');

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
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('Received new notification:', payload.new);
        const newNotification = payload.new as UserNotification;
        if (!newNotification.archived_at) {
          setUserNotifications(prev => {
            const exists = prev.some(n => 
              n.id === newNotification.id ||
              (n.reference_id === newNotification.reference_id && 
               n.notification_type === newNotification.notification_type &&
               n.sender_id === newNotification.sender_id &&
               Math.abs(new Date(n.created_at).getTime() - new Date(newNotification.created_at).getTime()) < 60000)
            );
            
            if (exists) return prev;
            
            return [newNotification, ...prev.slice(0, 49)];
          });
          
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('Notification updated:', payload.new);
        const updatedNotification = payload.new as UserNotification;
        
        if (updatedNotification.archived_at) {
          setUserNotifications(prev => prev.filter(n => n.id !== updatedNotification.id));
          if (!payload.old.is_read && updatedNotification.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
          return;
        }
        
        setUserNotifications(prev => 
          prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
        );
        
        if (!payload.old.is_read && updatedNotification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        } else if (payload.old.is_read && !updatedNotification.is_read) {
          setUnreadCount(prev => prev + 1);
        }
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'user_notifications',
        filter: `recipient_id=eq.${user.userId}`
      }, (payload) => {
        console.log('Notification deleted:', payload.old);
        const deletedNotification = payload.old as UserNotification;
        setUserNotifications(prev => prev.filter(n => n.id !== deletedNotification.id));
        if (!deletedNotification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      })
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscription...');
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const addNotification = (notification: Omit<RealtimeNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: RealtimeNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      read: false
    };

    setNotifications(prev => {
      const exists = prev.some(n => 
        n.metadata?.systemId === newNotification.metadata?.systemId &&
        n.type === newNotification.type
      );
      
      if (exists) return prev;
      
      return [newNotification, ...prev.slice(0, 19)];
    });
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
      console.log('Marking notification as read:', notification.id);
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notification.id)
        .is('archived_at', null);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast({
        title: "操作失敗",
        description: "標記已讀失敗",
        variant: "destructive"
      });
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    try {
      console.log('Marking all notifications as read...');
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('recipient_id', user.userId)
        .eq('is_read', false)
        .is('archived_at', null);

      if (error) throw error;

      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
      setUnreadCount(0);
      
      toast({
        title: "成功",
        description: "所有通知已標記為已讀"
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast({
        title: "錯誤",
        description: "標記已讀失敗",
        variant: "destructive"
      });
    }
  };

  const handleQuickReply = async (notification: UserNotification) => {
    console.log('Opening quick reply for:', notification.id);
    setSelectedNotification(notification);
    setShowReplyDialog(true);
    await markUserNotificationAsRead(notification);
  };

  const handleConfirmReply = async (notification: UserNotification) => {
    if (!notification.reply_id) {
      toast({
        title: "錯誤",
        description: "找不到回覆記錄",
        variant: "destructive"
      });
      return;
    }
    
    console.log('Confirming reply for:', notification.id, notification.reply_id);
    const success = await confirmReply(notification.id, notification.reply_id);
    if (success) {
      await markUserNotificationAsRead(notification);
    }
  };

  const handleShowConversation = async (notification: UserNotification) => {
    console.log('Showing conversation for:', notification.id);
    await markUserNotificationAsRead(notification);
    setShowConversation({
      issueId: notification.reference_id,
      referenceType: notification.reference_type,
      referenceId: notification.reference_id
    });
  };

  const handleDeleteNotification = async (notification: UserNotification) => {
    console.log('Deleting notification:', notification.id);
    const success = await deleteNotification(notification.id);
    if (success) {
      console.log('Notification deleted successfully');
    }
  };

  const handleClearCompleted = async () => {
    console.log('Clearing completed notifications...');
    const success = await clearCompletedNotifications();
    if (success) {
      console.log('Completed notifications cleared successfully');
    }
  };

  const handleClearRead = async () => {
    console.log('Clearing read notifications...');
    const success = await clearReadNotifications();
    if (success) {
      console.log('Read notifications cleared successfully');
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return '剛剛';
    if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} 小時前`;
    return date.toLocaleDateString('zh-TW');
  };

  const completedCount = userNotifications.filter(n => 
    ['closed', 'completed', 'replied'].includes(n.status)
  ).length;
  
  const readCount = userNotifications.filter(n => n.is_read).length;

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
              "animate-fade-in",
              isUpdating && "animate-pulse"
            )}
            disabled={isLoading}
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
        <PopoverContent align="center" className="w-96 p-0">
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  通知中心
                  {isUpdating && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                </CardTitle>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={markAllAsRead}
                      className="text-xs px-2 h-7"
                      disabled={isLoading}
                    >
                      全部已讀
                    </Button>
                  )}
                  
                  {(completedCount > 0 || readCount > 0) && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs px-2 h-7"
                          disabled={isLoading}
                        >
                          清理
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48" align="end">
                        <div className="space-y-2">
                          {completedCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearCompleted}
                              disabled={isLoading}
                              className="w-full justify-start text-xs"
                            >
                              <Trash2 className="h-3 w-3 mr-2" />
                              清理已完成 ({completedCount})
                            </Button>
                          )}
                          {readCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearRead}
                              disabled={isLoading}
                              className="w-full justify-start text-xs"
                            >
                              <Trash2 className="h-3 w-3 mr-2" />
                              清理已讀 ({readCount})
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                <div className="space-y-1 p-3">
                  {/* 用戶通知 */}
                  {userNotifications.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground mb-3 px-1">
                        用戶通知 ({userNotifications.length})
                      </div>
                      {userNotifications.map((notification) => (
                        <NotificationCard
                          key={notification.id}
                          notification={notification}
                          currentUserId={user?.userId}
                          isLoading={isLoading}
                          onQuickReply={handleQuickReply}
                          onConfirmReply={handleConfirmReply}
                          onShowConversation={handleShowConversation}
                          onDelete={handleDeleteNotification}
                          onMarkAsRead={markUserNotificationAsRead}
                        />
                      ))}
                    </>
                  )}

                  {/* 系統通知 */}
                  {notifications.length > 0 && (
                    <>
                      {userNotifications.length > 0 && <Separator className="my-4" />}
                      <div className="text-xs font-medium text-muted-foreground mb-3 px-1">
                        系統通知 ({notifications.length})
                      </div>
                      {notifications.map((notification) => (
                        <Card
                          key={notification.id}
                          className={cn(
                            "p-3 transition-all duration-200 cursor-pointer hover:shadow-md",
                            notification.read 
                              ? "bg-muted/30 border-transparent" 
                              : "bg-background border-primary/20 shadow-sm"
                          )}
                          onClick={() => markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-lg mt-0.5">{getNotificationIcon(notification.type)}</div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{notification.title}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {notification.message}
                              </div>
                              <div className="text-xs text-muted-foreground mt-2">
                                {formatTimestamp(notification.timestamp)}
                              </div>
                            </div>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                            )}
                          </div>
                        </Card>
                      ))}
                    </>
                  )}

                  {/* 無通知顯示 */}
                  {notifications.length === 0 && userNotifications.length === 0 && !isUpdating && (
                    <div className="p-8 text-center text-muted-foreground">
                      <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <div className="text-sm font-medium">暫無通知</div>
                      <div className="text-xs mt-1 opacity-75">新的通知會在這裡顯示</div>
                    </div>
                  )}

                  {/* 載入狀態 */}
                  {isUpdating && userNotifications.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                      <div className="text-sm">載入通知中...</div>
                    </div>
                  )}
                </div>
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
                  disabled={isLoading}
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
