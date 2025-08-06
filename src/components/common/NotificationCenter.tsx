import { useState } from "react";
import { 
  Bell, 
  Trash2, 
  CheckSquare, 
  Square, 
  RotateCcw,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { useNotificationManager } from "@/hooks/useNotificationManager";
import { SimpleNotificationCard } from "./SimpleNotificationCard";
import { cn } from "@/lib/utils";

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isLoading,
    deleteNotification,
    deleteMultipleNotifications,
    clearAllNotifications,
    markAsRead,
    loadNotifications
  } = useNotificationManager();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  // 選擇管理
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedIds(notifications.map(n => n.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  // 刪除操作
  const handleDeleteSingle = async (id: string) => {
    console.log('🗑️ 執行單個刪除:', id);
    await deleteNotification(id);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    
    console.log('🗑️ 執行批量刪除:', selectedIds);
    const success = await deleteMultipleNotifications(selectedIds);
    if (success) {
      setSelectedIds([]);
      setShowBatchDeleteDialog(false);
    }
  };

  const handleClearAll = async () => {
    console.log('🧹 執行清空所有通知');
    const success = await clearAllNotifications();
    if (success) {
      setSelectedIds([]);
      setShowClearDialog(false);
    }
  };

  const isAllSelected = selectedIds.length === notifications.length && notifications.length > 0;
  const isPartialSelected = selectedIds.length > 0 && selectedIds.length < notifications.length;

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
              isLoading && "animate-pulse"
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
                  {isLoading && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                </CardTitle>
                
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={loadNotifications}
                    disabled={isLoading}
                    className="h-7 px-2"
                    title="重新載入"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* 批量操作工具列 */}
              {notifications.length > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isAllSelected}
                        ref={(ref: any) => {
                          if (ref) ref.indeterminate = isPartialSelected;
                        }}
                        onCheckedChange={() => {
                          if (isAllSelected || isPartialSelected) {
                            deselectAll();
                          } else {
                            selectAll();
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {selectedIds.length > 0 
                          ? `已選擇 ${selectedIds.length} 個`
                          : `全選 (${notifications.length})`
                        }
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {selectedIds.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowBatchDeleteDialog(true)}
                          disabled={isLoading}
                          className="h-7 px-2 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          刪除選中
                        </Button>
                      )}
                      
                      {notifications.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowClearDialog(true)}
                          disabled={isLoading}
                          className="h-7 px-2 text-red-500 hover:text-red-700"
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          清空
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-96">
                <div className="space-y-2 p-3">
                  {notifications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>沒有通知</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <SimpleNotificationCard
                        key={notification.id}
                        notification={notification}
                        onDelete={handleDeleteSingle}
                        onMarkAsRead={markAsRead}
                        isLoading={isLoading}
                        isSelected={selectedIds.includes(notification.id)}
                        onSelect={toggleSelect}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>

      {/* 清空確認對話框 */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              確認清空所有通知
            </AlertDialogTitle>
            <AlertDialogDescription>
              這將永久刪除所有 {notifications.length} 個通知，此操作無法復原。您確定要繼續嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearAll}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              確認清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量刪除確認對話框 */}
      <AlertDialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              確認批量刪除
            </AlertDialogTitle>
            <AlertDialogDescription>
              這將永久刪除選中的 {selectedIds.length} 個通知，此操作無法復原。您確定要繼續嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBatchDelete}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}