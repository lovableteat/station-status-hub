import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Clock, CheckCircle, User } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useUser } from '@/components/auth/UserContext';

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
    sender_id: string;
    recipient_id: string;
    status: string;
    metadata?: Json;
  };
  replies: Array<{
    id: string;
    content: string;
    reply_type: string;
    status: string;
    created_at: string;
    sender_id: string;
    confirmed_at?: string;
  }>;
  users: Record<string, { displayName: string; role: string }>;
}

export function NotificationConversationView({ 
  issueId, 
  referenceType = 'issue', 
  referenceId 
}: NotificationConversationViewProps) {
  const { user } = useUser();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const targetId = referenceId || issueId;
    if (targetId) {
      loadConversations();
    }
  }, [issueId, referenceId, referenceType]);

  const loadConversations = async () => {
    const targetId = referenceId || issueId;
    if (!targetId) return;
    
    setIsLoading(true);
    try {
      // 獲取與此問題相關的所有通知
      const { data: notifications, error: notificationsError } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('reference_type', referenceType)
        .eq('reference_id', targetId)
        .order('created_at', { ascending: true });

      if (notificationsError) throw notificationsError;

      if (!notifications || notifications.length === 0) {
        setConversations([]);
        return;
      }

      // 獲取所有相關的回覆
      const notificationIds = notifications.map(n => n.id);
      const { data: replies, error: repliesError } = await supabase
        .from('notification_replies')
        .select('*')
        .in('notification_id', notificationIds)
        .order('created_at', { ascending: true });

      if (repliesError) throw repliesError;

      // 獲取所有相關用戶信息
      const userIds = new Set([
        ...notifications.map(n => n.sender_id),
        ...notifications.map(n => n.recipient_id),
        ...(replies || []).map(r => r.sender_id)
      ]);

      const { data: users, error: usersError } = await supabase
        .from('system_users')
        .select('id, display_name, role')
        .in('id', Array.from(userIds));

      if (usersError) throw usersError;

      const userMap = (users || []).reduce((acc, u) => {
        acc[u.id] = { displayName: u.display_name || 'Unknown', role: u.role };
        return acc;
      }, {} as Record<string, { displayName: string; role: string }>);

      // 組織對話數據
      const conversationData = notifications.map(notification => ({
        notification,
        replies: (replies || []).filter(r => r.notification_id === notification.id),
        users: userMap
      }));

      setConversations(conversationData);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '剛剛';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border-amber-400/45 bg-amber-500/15 text-amber-100';
      case 'replied': return 'border-primary/35 bg-primary/15 text-primary';
      case 'confirmed': case 'closed': return 'border-primary/40 bg-primary/20 text-primary';
      default: return 'border-border/70 bg-secondary/70 text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待處理';
      case 'replied': return '已回覆';
      case 'confirmed': return '已確認';
      case 'closed': return '已完成';
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            標註對話
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            載入對話中...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            標註對話
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            暫無標註對話
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/75 bg-card/90">
      <CardHeader className="bg-secondary/25">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          標註對話 ({conversations.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-96">
          <div className="space-y-4">
            {conversations.map((conversation, index) => {
              const { notification, replies, users } = conversation;
              const senderName = users[notification.sender_id]?.displayName || 'Unknown';
              const recipientName = users[notification.recipient_id]?.displayName || 'Unknown';

              return (
                <div key={notification.id} className="space-y-3">
                  {/* 原始標註 */}
                  <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/45 p-3">
                    <div className="rounded-full border border-primary/20 bg-primary/10 p-2 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{senderName}</span>
                          <span className="text-muted-foreground text-xs">標註了</span>
                          <span className="font-medium text-sm">{recipientName}</span>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(notification.status)}`}>
                            {getStatusText(notification.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(notification.created_at)}
                        </div>
                      </div>
                      <div className="mt-1">
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                      </div>
                    </div>
                  </div>

                  {/* 回覆記錄 */}
                  {replies.map((reply) => {
                    const replyerName = users[reply.sender_id]?.displayName || 'Unknown';
                    
                    return (
                      <div key={reply.id} className="ml-6 flex items-start gap-3 rounded-xl border border-border/70 bg-background/75 p-3">
                        <div className="rounded-full border border-border/70 bg-secondary/75 p-2 text-secondary-foreground">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{replyerName}</span>
                              <span className="text-muted-foreground text-xs">回覆</span>
                              <Badge variant={reply.reply_type === 'completion' ? 'default' : 'secondary'} className="text-xs">
                                {reply.reply_type === 'completion' ? '已完成' : 
                                 reply.reply_type === 'progress' ? '進行中' : '有問題'}
                              </Badge>
                              {reply.status === 'confirmed' && (
                                <Badge variant="outline" className="border-primary/35 bg-primary/15 text-xs text-primary">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  已確認
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(reply.created_at)}
                            </div>
                          </div>
                          <p className="text-sm mt-1">{reply.content}</p>
                          {reply.confirmed_at && (
                            <p className="mt-1 text-xs text-primary">
                              ✓ 於 {formatTime(reply.confirmed_at)} 確認完成
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {index < conversations.length - 1 && <Separator className="my-4" />}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
