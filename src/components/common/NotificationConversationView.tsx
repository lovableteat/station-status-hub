import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Separator } from "@/components/ui/separator";

interface NotificationConversationViewProps {
  issueId?: string;
  referenceType?: string;
  referenceId?: string;
}

interface ConversationData {
  notification: {
    id: string;
    title: string;
    message: string;
    created_at: string;
    status?: string;
    sender_name?: string;
    sender_display_name?: string;
  };
  replies: Array<{
    id: string;
    content: string;
    created_at: string;
    status: string;
    confirmed_at?: string;
    sender_name?: string;
    sender_display_name?: string;
    confirmed_by_name?: string;
  }>;
}

export function NotificationConversationView({ 
  issueId, 
  referenceType = 'issue', 
  referenceId 
}: NotificationConversationViewProps) {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const targetReferenceId = referenceId || issueId;
    if (targetReferenceId) {
      loadConversations(targetReferenceId, referenceType);
    }

    // 監聽通知回覆事件
    const handleReplyUpdate = () => {
      if (targetReferenceId) {
        loadConversations(targetReferenceId, referenceType);
      }
    };

    window.addEventListener('notification-reply-sent', handleReplyUpdate);
    window.addEventListener('notification-conversation-updated', handleReplyUpdate);

    return () => {
      window.removeEventListener('notification-reply-sent', handleReplyUpdate);
      window.removeEventListener('notification-conversation-updated', handleReplyUpdate);
    };
  }, [issueId, referenceType, referenceId]);

  const loadConversations = async (refId: string, refType: string) => {
    setIsLoading(true);
    try {
      // 獲取所有相關通知
      const { data: notifications, error: notifError } = await supabase
        .from('user_notifications')
        .select(`
          id,
          title,
          message,
          created_at,
          status,
          sender_id,
          notification_type
        `)
        .eq('reference_type', refType)
        .eq('reference_id', refId)
        .order('created_at', { ascending: true });

      if (notifError) throw notifError;

      if (!notifications || notifications.length === 0) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      // 獲取所有回覆
      const notificationIds = notifications.map(n => n.id);
      const { data: replies, error: repliesError } = await supabase
        .from('notification_replies')
        .select(`
          id,
          notification_id,
          content,
          created_at,
          status,
          confirmed_at,
          sender_id,
          confirmed_by
        `)
        .in('notification_id', notificationIds)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      // 獲取所有相關用戶信息
      const allUserIds = [
        ...notifications.map(n => n.sender_id).filter(Boolean),
        ...replies?.map(r => r.sender_id).filter(Boolean) || [],
        ...replies?.map(r => r.confirmed_by).filter(Boolean) || []
      ];
      
      const uniqueUserIds = [...new Set(allUserIds)];
      
      const { data: users, error: usersError } = await supabase
        .from('system_users')
        .select('id, username, display_name')
        .in('id', uniqueUserIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.id, u]) || []);

      // 組織對話數據
      const conversationMap = new Map<string, ConversationData>();

      notifications.forEach(notification => {
        const sender = userMap.get(notification.sender_id);
        conversationMap.set(notification.id, {
          notification: {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            created_at: notification.created_at,
            status: notification.status,
            sender_name: sender?.username,
            sender_display_name: sender?.display_name
          },
          replies: []
        });
      });

      // 添加回覆到對應的通知
      replies?.forEach(reply => {
        const conversation = conversationMap.get(reply.notification_id);
        if (conversation) {
          const sender = userMap.get(reply.sender_id);
          const confirmedBy = userMap.get(reply.confirmed_by);
          
          conversation.replies.push({
            id: reply.id,
            content: reply.content,
            created_at: reply.created_at,
            status: reply.status,
            confirmed_at: reply.confirmed_at,
            sender_name: sender?.username,
            sender_display_name: sender?.display_name,
            confirmed_by_name: confirmedBy?.display_name || confirmedBy?.username
          });
        }
      });

      setConversations(Array.from(conversationMap.values()));
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { 
        addSuffix: true, 
        locale: zhCN 
      });
    } catch (error) {
      return '時間未知';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'replied':
        return 'bg-blue-500';
      case 'confirmed':
        return 'bg-green-500';
      case 'closed':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'pending':
        return '待處理';
      case 'replied':
        return '已回覆';
      case 'confirmed':
        return '已確認';
      case 'closed':
        return '已關閉';
      default:
        return '未知狀態';
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-center text-muted-foreground">載入對話中...</div>
        </CardContent>
      </Card>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-center text-muted-foreground">暫無標註對話</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {conversations.map((conversation) => (
        <Card key={conversation.notification.id} className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              標註對話記錄
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* 原始通知 */}
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {conversation.notification.sender_display_name?.charAt(0) || 
                   conversation.notification.sender_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {conversation.notification.sender_display_name || 
                     conversation.notification.sender_name || '未知用戶'}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getStatusColor(conversation.notification.status)} text-white border-0`}
                  >
                    {getStatusText(conversation.notification.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(conversation.notification.created_at)}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{conversation.notification.title}</div>
                  <div className="text-muted-foreground mt-1">
                    {conversation.notification.message}
                  </div>
                </div>
              </div>
            </div>

            {/* 回覆 */}
            {conversation.replies.map((reply, index) => (
              <div key={reply.id}>
                <Separator />
                <div className="flex items-start gap-3 p-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {reply.sender_display_name?.charAt(0) || 
                       reply.sender_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {reply.sender_display_name || reply.sender_name || '未知用戶'}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getStatusColor(reply.status)} text-white border-0`}
                      >
                        回覆 - {getStatusText(reply.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(reply.created_at)}
                      </span>
                    </div>
                    <div className="text-sm bg-background p-2 rounded border">
                      {reply.content}
                    </div>
                    {reply.status === 'confirmed' && reply.confirmed_at && (
                      <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                        ✓ 已於 {formatTime(reply.confirmed_at)} 由 {reply.confirmed_by_name || '管理員'} 確認完成
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}