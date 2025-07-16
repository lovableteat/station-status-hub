
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ManualTimeTrackerProps {
  systemId: string;
  stationId: string;
  itemId: string;
  currentStartedAt?: string;
  currentCompletedAt?: string;
  onTimeUpdate: () => void;
}

export function ManualTimeTracker({
  systemId,
  stationId,
  itemId,
  currentStartedAt,
  currentCompletedAt,
  onTimeUpdate
}: ManualTimeTrackerProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // 計算處理時長
  const calculateDuration = () => {
    if (!currentStartedAt || !currentCompletedAt) return null;
    const start = new Date(currentStartedAt);
    const end = new Date(currentCompletedAt);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    return diffHours;
  };

  const handleStartTimer = async () => {
    if (isUpdating) return;
    
    try {
      setIsUpdating(true);
      const currentTime = new Date().toISOString();
      
      // 更新測試進度，設定開始時間和狀態
      const { error } = await supabase
        .from('test_progress')
        .upsert({
          system_id: systemId,
          station_id: stationId,
          item_id: itemId,
          started_at: currentTime,
          status: 'On-going',
          progress_percent: 0,
          notes: '',
          completed_at: null // 清除完成時間
        }, {
          onConflict: 'system_id,station_id,item_id'
        });

      if (error) throw error;

      toast({
        title: "計時開始",
        description: "測試項目計時已開始",
      });

      onTimeUpdate();
    } catch (error) {
      console.error('Error starting timer:', error);
      toast({
        title: "開始計時失敗",
        description: "無法開始計時，請重試",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStopTimer = async () => {
    if (isUpdating) return;
    
    try {
      setIsUpdating(true);
      const currentTime = new Date().toISOString();
      
      // 計算實際小時數
      let actualHours = 0;
      if (currentStartedAt) {
        const start = new Date(currentStartedAt);
        const end = new Date(currentTime);
        const diffMs = end.getTime() - start.getTime();
        actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(4)); // 保留4位小數精度
      }
      
      // 更新測試進度，設定完成時間和狀態
      const { error } = await supabase
        .from('test_progress')
        .upsert({
          system_id: systemId,
          station_id: stationId,
          item_id: itemId,
          started_at: currentStartedAt, // 保持原有開始時間
          completed_at: currentTime,
          status: 'Done',
          progress_percent: 100,
          actual_hours: actualHours,
          notes: ''
        }, {
          onConflict: 'system_id,station_id,item_id'
        });

      if (error) throw error;

      toast({
        title: "計時結束",
        description: "測試項目已完成並儲存",
      });

      onTimeUpdate();
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast({
        title: "結束計時失敗",
        description: "無法結束計時，請重試",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const duration = calculateDuration();
  const isRunning = currentStartedAt && !currentCompletedAt;
  const isCompleted = currentStartedAt && currentCompletedAt;

  return (
    <div className="flex items-center gap-2">
      {!currentStartedAt ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleStartTimer}
          disabled={isUpdating}
          className="h-8 px-2"
        >
          <Play className="h-3 w-3 mr-1" />
          開始
        </Button>
      ) : isRunning ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
            <Clock className="h-3 w-3 mr-1" />
            進行中
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStopTimer}
            disabled={isUpdating}
            className="h-8 px-2"
          >
            <Square className="h-3 w-3 mr-1" />
            結束
          </Button>
        </div>
      ) : isCompleted ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
            完成
          </Badge>
          {duration && (
            <span className="text-xs text-muted-foreground">
              {duration} 小時
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
