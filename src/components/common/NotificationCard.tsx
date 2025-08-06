
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, MessageSquare, Check, Trash2, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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

interface NotificationCardProps {
  notification: UserNotification;
  currentUserId?: string;
  isLoading: boolean;
  onQuickReply: (notification: UserNotification) => void;
  onConfirmReply: (notification: UserNotification) => void;
  onShowConversation: (notification: UserNotification) => void;
  onDelete: (notification: UserNotification) => void;
  onMarkAsRead: (notification: UserNotification) => void;
}

interface PrimaryAction {
  label: string;
  icon: LucideIcon;
  onClick: (e: React.MouseEvent) => void;
  variant: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
    case 'replied': return 'bg-blue-500/10 text-blue-700 border-blue-200';
    case 'closed': return 'bg-green-500/10 text-green-700 border-green-200';
    case 'completed': return 'bg-green-500/10 text-green-700 border-green-200';
    default: return 'bg-gray-500/10 text-gray-700 border-gray-200';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '待處理';
    case 'replied': return '已回覆';
    case 'closed': return '已關閉';
    case 'completed': return '已完成';
    default: return '未知';
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

export function NotificationCard({
  notification,
  currentUserId,
  isLoading,
  onQuickReply,
  onConfirmReply,
  onShowConversation,
  onDelete,
  onMarkAsRead
}: NotificationCardProps) {
  const handleCardClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification);
    }
  };

  const handleQuickReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickReply(notification);
  };

  const handleConfirmReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfirmReply(notification);
  };

  const handleShowConversation = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShowConversation(notification);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification);
  };

  // 獲取主要操作按鈕 - 修復動態圖標問題
  const getPrimaryAction = (): PrimaryAction | null => {
    if (notification.notification_type === 'mention' && notification.status === 'pending') {
      return {
        label: '回覆',
        icon: MessageSquare,
        onClick: handleQuickReply,
        variant: 'default'
      };
    }
    
    if (notification.notification_type === 'reply' && notification.require_confirmation && notification.reply_id) {
      return {
        label: '確認完成',
        icon: Check,
        onClick: handleConfirmReply,
        variant: 'default'
      };
    }

    if (notification.reference_type === 'issue' || notification.reference_type === 'test_progress') {
      return {
        label: '查看對話',
        icon: MessageSquare,
        onClick: handleShowConversation,
        variant: 'outline'
      };
    }

    return null;
  };

  const primaryAction = getPrimaryAction();
  
  // 簡化刪除條件
  const canDelete = ['closed', 'completed', 'replied'].includes(notification.status) || notification.is_read;

  // 修復動態圖標渲染 - 使用正確的 JSX 語法
  const renderPrimaryActionButton = () => {
    if (!primaryAction) return null;
    
    const IconComponent = primaryAction.icon;
    
    return (
      <Button
        variant={primaryAction.variant}
        size="sm"
        onClick={primaryAction.onClick}
        disabled={isLoading}
        className="h-7 text-xs px-2 hover:bg-primary/10 transition-colors"
      >
        <IconComponent className="h-3 w-3 mr-1" />
        {primaryAction.label}
      </Button>
    );
  };

  return (
    <Card 
      className={cn(
        "p-4 transition-all duration-200 cursor-pointer hover:shadow-md",
        notification.is_read 
          ? "bg-muted/30 border-transparent" 
          : "bg-background border-primary/20 shadow-sm ring-1 ring-primary/10"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="font-medium text-sm line-clamp-2">{notification.title}</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {notification.message}
              </p>
            </div>
            
            {!notification.is_read && (
              <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
            )}
          </div>
          
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn("text-xs", getStatusColor(notification.status))}
              >
                {getStatusText(notification.status)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(notification.created_at)}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              {/* 主要操作按鈕 - 使用修復後的渲染函數 */}
              {renderPrimaryActionButton()}

              {/* 直接顯示刪除按鈕 */}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                  title="刪除通知"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              
              {/* 下拉選單用於其他操作 */}
              {!primaryAction && (notification.reference_type === 'issue' || notification.reference_type === 'test_progress') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      disabled={isLoading}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem 
                      onClick={handleShowConversation}
                      disabled={isLoading}
                      className="hover:bg-muted transition-colors"
                    >
                      <MessageSquare className="h-3 w-3 mr-2" />
                      查看對話
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      disabled={isLoading}
                      className="text-red-600 focus:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      刪除通知
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
