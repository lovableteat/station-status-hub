import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Eye, Tag } from 'lucide-react';
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

  const formatTime = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return '剛剛';
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`;
    return `${Math.floor(diffInMinutes / 1440)} 天前`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDelete(notification.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onMarkAsRead(notification.id);
  };

  const handleCardClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    if (onSelect) {
      onSelect(notification.id);
    }
  };

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all duration-200",
        !notification.is_read && "bg-blue-50/50 border-l-4 border-l-blue-500",
        notification.is_read && "bg-background",
        isSelected && "ring-2 ring-primary",
        isDeleting && "opacity-50 pointer-events-none"
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(
              "text-sm font-medium truncate",
              !notification.is_read && "font-semibold"
            )}>
              {notification.title}
            </h4>
            <div className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              getPriorityColor(notification.priority)
            )} />
          </div>
          
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {notification.message}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {notification.tags?.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0.5">
                  <Tag className="w-2.5 h-2.5 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTime(notification.created_at)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
          
          {!notification.is_read && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAsRead}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}