import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Eye, Tag, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  status: string;
  is_read: boolean;
  created_at: string;
  priority: string;
  tags: string[];
}

interface SimpleNotificationCardProps {
  notification: Notification;
  onDelete: (id: string) => void;
  onMarkAsRead: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

export function SimpleNotificationCard({
  notification,
  onDelete,
  onMarkAsRead,
  isSelected = false,
  onSelect
}: SimpleNotificationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const formatTime = (timestamp: string) => {
    try {
      const now = new Date();
      const time = new Date(timestamp);
      const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
      
      if (diffInMinutes < 1) return '剛剛';
      if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`;
      return `${Math.floor(diffInMinutes / 1440)} 天前`;
    } catch (error) {
      console.error('❌ 時間格式化錯誤:', error);
      return '時間未知';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'urgent': return '緊急';
      case 'high': return '重要';
      case 'normal': return '一般';
      case 'low': return '低';
      default: return priority;
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    
    setIsDeleting(true);
    console.log('🗑️ 刪除通知卡片:', notification.id);
    
    try {
      await onDelete(notification.id);
    } catch (error) {
      console.error('❌ 刪除通知卡片失敗:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMarkingRead || notification.is_read) return;
    
    setIsMarkingRead(true);
    console.log('👁️ 標記通知已讀:', notification.id);
    
    try {
      await onMarkAsRead(notification.id);
    } catch (error) {
      console.error('❌ 標記已讀失敗:', error);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const handleCardClick = () => {
    console.log('📱 點擊通知卡片:', notification.id, '已讀狀態:', notification.is_read);
    
    if (!notification.is_read && !isMarkingRead) {
      handleMarkAsRead({ stopPropagation: () => {} } as React.MouseEvent);
    }
    
    if (onSelect) {
      onSelect(notification.id);
    }
  };

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all duration-200 hover:shadow-md",
        !notification.is_read && "bg-blue-50/50 border-l-4 border-l-blue-500 dark:bg-blue-950/20",
        notification.is_read && "bg-background",
        isSelected && "ring-2 ring-primary",
        (isDeleting || isMarkingRead) && "opacity-50 pointer-events-none"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 主要內容 */}
        <div className="flex-1 min-w-0">
          {/* 標題和優先級 */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(
              "text-sm truncate flex-1",
              !notification.is_read ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
            )}>
              {notification.title}
            </h4>
            <div className="flex items-center gap-1">
              <div 
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  getPriorityColor(notification.priority)
                )}
                title={`優先級: ${getPriorityText(notification.priority)}`}
              />
              {!notification.is_read && (
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" title="未讀" />
              )}
            </div>
          </div>
          
          {/* 訊息內容 */}
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
            {notification.message}
          </p>
          
          {/* 標籤和時間 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              {notification.tags?.map(tag => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="text-xs px-1.5 py-0.5 h-5"
                >
                  <Tag className="w-2.5 h-2.5 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{formatTime(notification.created_at)}</span>
            </div>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            title="刪除通知"
          >
            {isDeleting ? (
              <div className="w-3 h-3 animate-spin border border-current border-t-transparent rounded-full" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </Button>
          
          {!notification.is_read && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAsRead}
              disabled={isMarkingRead}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              title="標記為已讀"
            >
              {isMarkingRead ? (
                <div className="w-3 h-3 animate-spin border border-current border-t-transparent rounded-full" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}