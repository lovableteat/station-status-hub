
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Clock, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TimeRecordManagerProps {
  systemId: string;
  stationId: string;
  itemId: string;
  currentStartedAt?: string;
  currentCompletedAt?: string;
  onTimeUpdate: () => void;
}

export function TimeRecordManager({
  systemId,
  stationId,
  itemId,
  currentStartedAt,
  currentCompletedAt,
  onTimeUpdate,
}: TimeRecordManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startedAt, setStartedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // 當對話框打開時，重新初始化時間值
  const handleDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (open) {
      setStartedAt(formatDateTimeLocalTaiwan(currentStartedAt) || '');
      setCompletedAt(formatDateTimeLocalTaiwan(currentCompletedAt) || '');
    }
  };

  const handleTimeUpdate = async () => {
    if (isUpdating) return;
    
    try {
      setIsUpdating(true);
      const updates: any = {};
      
      if (startedAt) {
        // 將台灣時間轉換為UTC時間儲存
        const taiwanDate = new Date(startedAt);
        // 台灣時間減去8小時得到UTC時間
        const utcDate = new Date(taiwanDate.getTime() - (8 * 60 * 60 * 1000));
        updates.started_at = utcDate.toISOString();
      } else {
        updates.started_at = null;
      }
      
      if (completedAt) {
        // 將台灣時間轉換為UTC時間儲存
        const taiwanDate = new Date(completedAt);
        // 台灣時間減去8小時得到UTC時間
        const utcDate = new Date(taiwanDate.getTime() - (8 * 60 * 60 * 1000));
        updates.completed_at = utcDate.toISOString();
      } else {
        updates.completed_at = null;
      }

      console.log('Updating time records:', { systemId, stationId, itemId, updates });

      const { error } = await supabase
        .from('test_progress')
        .update(updates)
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .eq('item_id', itemId);

      if (error) {
        console.error('Error updating time records:', error);
        throw error;
      }

      console.log('Time records updated successfully');

      toast({
        title: "時間記錄已更新",
        description: "手動時間記錄已成功更新",
      });

      // 使用回調函數僅更新必要的數據，避免整個頁面重新載入
      onTimeUpdate();
    } catch (error) {
      console.error('Error updating time records:', error);
      toast({
        title: "更新失敗",
        description: "無法更新時間記錄",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearTimes = async () => {
    if (isUpdating) return;
    
    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from('test_progress')
        .update({
          started_at: null,
          completed_at: null
        })
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .eq('item_id', itemId);

      if (error) throw error;

      toast({
        title: "時間記錄已清空",
        description: "所有時間記錄已成功清空",
      });

      // 清空後重新設置輸入框
      setStartedAt('');
      setCompletedAt('');
      onTimeUpdate();
    } catch (error) {
      console.error('Error clearing time records:', error);
      toast({
        title: "清空失敗",
        description: "無法清空時間記錄",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 將UTC時間轉換為台灣時間格式供input使用
  const formatDateTimeLocalTaiwan = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const utcDate = new Date(isoString);
      // UTC時間加上8小時得到台灣時間
      const taiwanDate = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
      // 格式化為 YYYY-MM-DDTHH:mm 格式
      return taiwanDate.toISOString().slice(0, 16);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // 處理開始時間變更，避免跳動
  const handleStartTimeChange = (value: string) => {
    setStartedAt(value);
  };

  // 處理完成時間變更，避免跳動  
  const handleCompletedTimeChange = (value: string) => {
    setCompletedAt(value);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isUpdating}>
          <Clock className="h-3 w-3 mr-1 text-white" />
          時間管理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>時間記錄管理 (台灣時間)</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="started-at">開始時間</Label>
            <Input
              id="started-at"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              disabled={isUpdating}
              className="[&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:contrast-100"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="completed-at">完成時間</Label>
            <Input
              id="completed-at"
              type="datetime-local"
              value={completedAt}
              onChange={(e) => handleCompletedTimeChange(e.target.value)}
              disabled={isUpdating}
              className="[&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:contrast-100"
            />
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleTimeUpdate} 
              className="flex-1"
              disabled={isUpdating}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {isUpdating ? "更新中..." : "更新時間"}
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isUpdating}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  清空
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確認清空時間記錄</AlertDialogTitle>
                  <AlertDialogDescription>
                    這將清空此測試項目的所有時間記錄。此操作無法復原。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearTimes} disabled={isUpdating}>
                    確認清空
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isUpdating}>
              關閉
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
