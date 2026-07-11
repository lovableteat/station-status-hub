
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Clock, RotateCcw, Trash2 } from "lucide-react";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
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
  const { activeProjectId } = useTestProject();

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

      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const updates: Record<string, string | number | null> = {};
      
      if (startedAt) {
        updates.started_at = new Date(startedAt).toISOString();
      } else {
        updates.started_at = null;
      }
      
      if (completedAt) {
        updates.completed_at = new Date(completedAt).toISOString();
      } else {
        updates.completed_at = null;
      }

      if (updates.started_at && updates.completed_at) {
        const duration = new Date(String(updates.completed_at)).getTime() - new Date(String(updates.started_at)).getTime();
        if (duration < 0) {
          toast({ title: "時間範圍錯誤", description: "完成時間不能早於開始時間。", variant: "destructive" });
          return;
        }
        updates.actual_hours = Number((duration / 3_600_000).toFixed(4));
      } else {
        updates.actual_hours = 0;
      }

      console.log('Updating time records:', { systemId, stationId, itemId, updates });

      const { data: existingRecord, error: lookupError } = await supabase
        .from('test_progress')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .eq('item_id', itemId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      const result = existingRecord
        ? await supabase
            .from('test_progress')
            .update(updates)
            .eq('id', existingRecord.id)
        : await supabase.from('test_progress').insert({
            ...updates,
            item_id: itemId,
            progress_percent: updates.completed_at ? 100 : 0,
            project_id: activeProjectId,
            station_id: stationId,
            status: updates.completed_at ? 'Done' : updates.started_at ? 'On-going' : 'Not Start',
            system_id: systemId,
          });

      if (result.error) {
        console.error('Error updating time records:', result.error);
        throw result.error;
      }

      console.log('Time records updated successfully');

      toast({
        title: "時間記錄已更新",
        description: "手動時間記錄已成功更新",
      });

      // 使用回調函數僅更新必要的數據，避免整個頁面重新載入
      onTimeUpdate();
      setDialogOpen(false);
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
      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const { error } = await supabase
        .from('test_progress')
        .update({
          started_at: null,
          completed_at: null,
          actual_hours: 0
        })
        .eq('project_id', activeProjectId)
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

  const formatDateTimeLocalTaiwan = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
      return localTime.toISOString().slice(0, 16);
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
        <Button variant="outline" size="sm" disabled={isUpdating} className="h-8 border-[#3c6380] bg-[#10263a] text-[#dce9f2] hover:bg-[#16324b]">
          <Clock className="mr-1 h-3.5 w-3.5" />
          校正時間
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
