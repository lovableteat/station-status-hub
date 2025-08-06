import { useState, useEffect } from "react";
import { Users, Circle, Bell, X, AtSign, MessageSquare, AlertTriangle, Settings, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NotificationReplyDialog } from './NotificationReplyDialog';
import { useNotificationReplies } from '@/hooks/useNotificationReplies';

const moduleLabels: Record<string, string> = {
  dashboard: "儀表板",
  "test-tracker": "測試追蹤",
  "flow-info": "流程資訊",
  monitor: "生產監控",
  issues: "問題追蹤",
  data: "資料中心",
  tools: "工具管理",
  users: "用戶管理"
};

const roleColors: Record<string, string> = {
  admin: "bg-red-500",
  engineer: "bg-blue-500",
  manager: "bg-green-500",
  tester: "bg-yellow-500"
};

interface UserNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
  sender_id: string;
  status?: string;
  require_confirmation?: boolean;
  reply_id?: string;
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "notifications">("users");
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null);
  const { onlineUsers, totalOnlineUsers } = useUserPresence();
  const { toasts } = useToast();
  const { user } = useUser();
  const { confirmReply } = useNotificationReplies();
  const navigate = useNavigate();

  // 獲取用戶通知
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .select('*')
          .eq('recipient_id', user.userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        setNotifications(data || []);
        setUnreadCount(data?.filter(n => !n.is_read).length || 0);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();

    // 設置實時訂閱
    const channel = supabase
      .channel('user_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_id=eq.${user.userId}`
        },
        (payload) => {
          const newNotification = payload.new as UserNotification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // 標記通知為已讀
  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // 標記所有通知為已讀
  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.userId)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // 格式化時間
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return '剛剛';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分鐘前`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小時前`;
    return `${Math.floor(diffInSeconds / 86400)}天前`;
  };

  // 處理通知點擊 - 跳轉到相關頁面並打開特定項目
  const handleNotificationClick = (notification: UserNotification) => {
    setIsOpen(false);
    
    if (notification.reference_type && notification.reference_id) {
      switch (notification.reference_type) {
        case 'issue':
          // 跳轉到問題追蹤頁面並打開特定問題
          navigate(`/issues?openIssue=${notification.reference_id}`);
          break;
        case 'code_snippet':
          // 跳轉到工具管理頁面並打開特定程式碼片段
          navigate(`/tools?openSnippet=${notification.reference_id}&tab=code`);
          break;
        default:
          break;
      }
    }
  };

  // 獲取通知圖標 - 統一使用小鈴鐺
  const getNotificationIcon = (type: string) => {
    return <Bell className="h-4 w-4 text-primary" />;
  };

  // 處理通知點擊 - 擴展支援回覆功能
  const handleNotificationAction = (notification: UserNotification) => {
    if (notification.notification_type === 'mention' && notification.status === 'pending') {
      // 標註通知 - 打開回覆對話框
      setSelectedNotification(notification);
      setReplyDialogOpen(true);
    } else if (notification.notification_type === 'reply' && notification.require_confirmation) {
      // 回覆通知 - 確認並關閉
      handleConfirmReply(notification);
    } else {
      // 其他通知 - 原有邏輯
      handleNotificationClick(notification);
    }
    markAsRead(notification.id);
  };

  // 確認回覆並關閉通知
  const handleConfirmReply = async (notification: UserNotification) => {
    if (!notification.reply_id) return;
    
    const success = await confirmReply(notification.id, notification.reply_id);
    if (success) {
      // 更新本地狀態
      setNotifications(prev => prev.map(n => 
        n.id === notification.id 
          ? { ...n, status: 'closed' }
          : n
      ));
    }
  };

  // 獲取通知狀態顏色
  const getNotificationStatusColor = (notification: UserNotification) => {
    switch (notification.status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'replied':
        return 'bg-blue-500';
      case 'closed':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  // 獲取通知狀態文字
  const getNotificationStatusText = (notification: UserNotification) => {
    switch (notification.status) {
      case 'pending':
        return '待處理';
      case 'replied':
        return '已回覆';
      case 'closed':
        return '已完成';
      default:
        return '';
    }
  };

  const recentNotifications = toasts.slice(-5); // 顯示最近5個通知
  const totalNotifications = unreadCount + recentNotifications.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* 通知中心按鈕 */}
      {!isOpen && (
        <div className="flex gap-2">
          {/* 在線用戶指示器 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("users");
              setIsOpen(true);
            }}
            className="bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
          >
            <div className="relative">
              <Users className="h-4 w-4 text-primary" />
              <Circle className="absolute -top-1 -right-1 h-3 w-3 fill-green-500 text-green-500" />
            </div>
            <span className="ml-2 text-sm font-medium">{totalOnlineUsers}</span>
          </Button>

          {/* 通知指示器 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("notifications");
              setIsOpen(true);
            }}
            className="bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
          >
            <div className="relative">
              <Bell className="h-4 w-4 text-primary" />
              {totalNotifications > 0 && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                  {totalNotifications > 9 ? "9+" : totalNotifications}
                </div>
              )}
            </div>
          </Button>
        </div>
      )}

      {/* 通知中心面板 */}
      {isOpen && (
        <Card className="w-80 max-h-96 bg-background/95 backdrop-blur-sm border-primary/20 shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === "users" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("users")}
                  className="h-8"
                >
                  <Users className="h-4 w-4 mr-1" />
                  在線 ({totalOnlineUsers})
                </Button>
                <Button
                  variant={activeTab === "notifications" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("notifications")}
                  className="h-8"
                >
                  <Bell className="h-4 w-4 mr-1" />
                  通知 ({unreadCount})
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto">
              {activeTab === "users" && (
                <div className="p-3 space-y-2">
                  {onlineUsers.map((user) => (
                    <div key={user.userId} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {user.displayName?.charAt(0) || user.username.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                          roleColors[user.role] || "bg-gray-500"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{user.displayName || user.username}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {moduleLabels[user.currentModule || 'dashboard'] || user.currentModule}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          {user.role}
                        </Badge>
                        {user.isEditing && (
                          <Badge variant="secondary" className="text-xs">
                            編輯中
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {onlineUsers.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      目前只有您在線上
                    </div>
                  )}
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="p-3 space-y-2">
                  {/* 全部標為已讀按鈕 */}
                  {unreadCount > 0 && (
                    <div className="flex justify-end mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={markAllAsRead}
                        className="text-xs"
                      >
                        全部標為已讀
                      </Button>
                    </div>
                  )}
                  
                  {/* 標註通知 */}
                   {notifications.length > 0 ? (
                     notifications.map((notification) => (
                        <div
                        key={notification.id}
                        className={cn(
                          "p-2 rounded-lg border cursor-pointer transition-colors",
                          !notification.is_read 
                            ? "bg-primary/5 border-primary/20 hover:bg-primary/10" 
                            : "bg-muted/30 hover:bg-muted/50"
                        )}
                        onClick={() => handleNotificationAction(notification)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.notification_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium">{notification.title}</div>
                              {notification.status && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs px-1 py-0 ${getNotificationStatusColor(notification)} text-white border-0`}
                                >
                                  {getNotificationStatusText(notification)}
                                </Badge>
                              )}
                              {!notification.is_read && (
                                <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {notification.message}
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="text-xs text-muted-foreground">
                                {formatTime(notification.created_at)}
                              </div>
                              {notification.notification_type === 'mention' && notification.status === 'pending' && (
                                <Badge variant="secondary" className="text-xs">
                                  點擊回覆
                                </Badge>
                              )}
                              {notification.notification_type === 'reply' && notification.require_confirmation && (
                                <Badge variant="default" className="text-xs">
                                  點擊確認完成
                                </Badge>
                              )}
                              {notification.metadata?.issue_title && (
                                <div className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  點擊查看
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : recentNotifications.length > 0 ? (
                     recentNotifications.map((notification, index) => (
                      <div key={index} className="p-2 rounded-lg border bg-muted/30">
                        <div className="text-sm font-medium">{notification.title}</div>
                        {notification.description && (
                          <div className="text-xs text-muted-foreground mt-1">{notification.description}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      暫無新通知
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 回覆對話框 */}
      {selectedNotification && (
        <NotificationReplyDialog
          isOpen={replyDialogOpen}
          onClose={() => {
            setReplyDialogOpen(false);
            setSelectedNotification(null);
          }}
          notification={selectedNotification}
        />
      )}
    </div>
  );
}