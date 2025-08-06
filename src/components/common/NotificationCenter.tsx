import React, { useState } from 'react';
import { Bell, Tag, X, Trash2, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useNotificationManager } from '@/hooks/useNotificationManager';
import { SimpleNotificationCard } from './SimpleNotificationCard';

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isLoading,
    selectedTag,
    setSelectedTag,
    deleteNotification,
    deleteByTag,
    clearAllNotifications,
    markAsRead,
    getAllTags
  } = useNotificationManager();

  const [isOpen, setIsOpen] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showTagDeleteDialog, setShowTagDeleteDialog] = useState<string | null>(null);

  const allTags = getAllTags();

  const handleDeleteSingle = async (id: string) => {
    const success = await deleteNotification(id);
    if (success) {
      console.log('✅ 通知刪除成功');
    }
  };

  const handleDeleteByTag = async (tag: string) => {
    const success = await deleteByTag(tag);
    if (success) {
      setShowTagDeleteDialog(null);
      setSelectedTag(null);
    }
  };

  const handleClearAll = async () => {
    const success = await clearAllNotifications();
    if (success) {
      setShowClearDialog(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0 min-w-[20px]"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-96 p-0" align="end">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">通知中心</h3>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowClearDialog(true)}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    清空
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {/* Microsoft 365 風格的標籤過濾 */}
            {allTags.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={selectedTag === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTag(null)}
                    className="h-6 px-2 text-xs"
                  >
                    全部
                  </Button>
                  {allTags.map(tag => (
                    <div key={tag} className="flex items-center gap-1">
                      <Button
                        variant={selectedTag === tag ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTag(tag)}
                        className="h-6 px-2 text-xs"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Button>
                      {selectedTag === tag && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowTagDeleteDialog(tag)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ScrollArea className="h-96">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {selectedTag ? `沒有 "${selectedTag}" 標籤的通知` : '沒有通知'}
                </p>
              </div>
            ) : (
              <div className="p-2">
                {notifications.map((notification, index) => (
                  <React.Fragment key={notification.id}>
                    <SimpleNotificationCard
                      notification={notification}
                      onDelete={handleDeleteSingle}
                      onMarkAsRead={handleMarkAsRead}
                    />
                    {index < notifications.length - 1 && (
                      <Separator className="my-2" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* 清空所有通知確認對話框 */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有通知</AlertDialogTitle>
            <AlertDialogDescription>
              此操作將永久刪除所有通知，且無法復原。確定要繼續嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確定清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 按標籤刪除確認對話框 */}
      <AlertDialog open={!!showTagDeleteDialog} onOpenChange={() => setShowTagDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除標籤通知</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除所有標籤為 "{showTagDeleteDialog}" 的通知嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => showTagDeleteDialog && handleDeleteByTag(showTagDeleteDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}