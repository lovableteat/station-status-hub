import { Trash2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Notification {
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
}

interface SimpleNotificationCardProps {
  notification: Notification;
  onDelete: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  isLoading?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

export function SimpleNotificationCard({
  notification,
  onDelete,
  onMarkAsRead,
  isLoading = false,
  isSelected = false,
  onSelect
}: SimpleNotificationCardProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return '剛剛';
    if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} 小時前`;
    return date.toLocaleDateString('zh-TW');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'replied': return 'bg-blue-500';
      case 'closed': return 'bg-gray-500';
      case 'completed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoading) {
      console.log('🗑️ 刪除按鍵被點擊:', notification.id);
      onDelete(notification.id);
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notification.is_read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(notification.id);
    }
    if (!notification.is_read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <Card 
      className={cn(
        "p-3 cursor-pointer transition-all duration-200 hover:shadow-md",
        !notification.is_read && "border-l-4 border-l-blue-500 bg-blue-50/50",
        isSelected && "ring-2 ring-primary",
        isLoading && "opacity-50 pointer-events-none"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* 標題行 */}
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-2">
              {!notification.is_read && (
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
              )}
              <h4 className="font-medium text-sm truncate">
                {notification.title}
              </h4>
            </div>
            <div className={cn("w-2 h-2 rounded-full", getStatusColor(notification.status))} />
          </div>

          {/* 訊息內容 */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {notification.message}
          </p>

          {/* 底部資訊 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTime(notification.created_at)}
            </div>
            
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {notification.notification_type}
              </Badge>
              {notification.status !== 'closed' && (
                <Badge variant="secondary" className="text-xs">
                  {notification.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* 操作區域 */}
        <div className="flex flex-col items-center gap-1">
          {/* 刪除按鍵 - 最重要 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isLoading}
            className={cn(
              "h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50",
              "transition-colors duration-200"
            )}
            title="刪除通知"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* 標記已讀按鍵 */}
          {!notification.is_read && onMarkAsRead && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAsRead}
              className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
              title="標記為已讀"
            >
              <AlertCircle className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}