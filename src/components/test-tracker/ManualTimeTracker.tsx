import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";

interface ManualTimeTrackerProps {
  systemId: string;
  stationId: string;
  itemId: string;
  currentStartedAt?: string;
  currentCompletedAt?: string;
  onTimeUpdate: () => void;
}

export default function ManualTimeTracker({
  systemId,
  stationId,
  itemId,
  currentStartedAt,
  currentCompletedAt,
  onTimeUpdate
}: ManualTimeTrackerProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();

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
      
      console.log('開始計時 - 參數:', { 
        systemId, 
        stationId, 
        itemId, 
        currentTime,
        type: typeof systemId,
        stationIdType: typeof stationId,
        itemIdType: typeof itemId
      });
      
      // 直接使用 INSERT ON CONFLICT，避免觸發器問題
      const { data, error } = await supabase
        .from('test_progress')
        .insert({
          system_id: systemId,
          station_id: stationId,
          item_id: itemId,
          started_at: currentTime,
          status: 'On-going',
          progress_percent: 0,
          completed_at: null,
          notes: '',
          actual_hours: 0
        })
        .select()
        .single();

      // 如果插入失敗（可能是重複），嘗試更新
      if (error && error.code === '23505') {
        console.log('記錄已存在，執行更新操作');
        
        const { data: updateData, error: updateError } = await supabase
          .from('test_progress')
          .update({
            started_at: currentTime,
            status: 'On-going',
            progress_percent: 0,
            completed_at: null,
            notes: ''
          })
          .eq('system_id', systemId)
          .eq('station_id', stationId)
          .eq('item_id', itemId)
          .select()
          .single();

        if (updateError) {
          console.error('更新失敗:', updateError);
          throw updateError;
        }

      console.log('計時開始成功 (更新):', updateData);
      } else if (error) {
        console.error('插入失敗:', error);
        throw error;
      } else {
        console.log('計時開始成功 (插入):', data);
      }

      // 記錄修改歷史
      try {
        await supabase.from('test_progress_audit').insert({
          system_id: systemId,
          station_id: stationId,
          item_id: itemId,
          change_type: 'start_timer',
          old_values: {},
          new_values: {
            started_at: currentTime,
            status: 'On-going',
            user: user?.displayName || user?.username || '未知用戶'
          },
          user_id: user?.userId
        });
      } catch (auditError) {
        console.error('記錄審計失敗:', auditError);
      }

      toast({
        title: "計時開始",
        description: "測試項目計時已開始",
      });

      onTimeUpdate();
    } catch (error: any) {
      console.error('開始計時錯誤:', error);
      toast({
        title: "開始計時失敗",
        description: error.message || "無法開始計時，請重試",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStopTimer = async () => {
    if (isUpdating || !currentStartedAt) return;
    
    try {
      setIsUpdating(true);
      const currentTime = new Date().toISOString();
      
      // 計算實際小時數
      const start = new Date(currentStartedAt);
      const end = new Date(currentTime);
      const diffMs = end.getTime() - start.getTime();
      const actualHours = Number((diffMs / (1000 * 60 * 60)).toFixed(4));
      
      console.log('結束計時 - 參數:', { 
        systemId, 
        stationId, 
        itemId, 
        currentTime, 
        actualHours,
        startTime: currentStartedAt
      });
      
      // 直接更新完成狀態
      const { data, error } = await supabase
        .from('test_progress')
        .update({
          completed_at: currentTime,
          status: 'Done',
          progress_percent: 100,
          actual_hours: actualHours
        })
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .eq('item_id', itemId)
        .select()
        .single();

      if (error) {
        console.error('結束計時失敗:', error);
        throw error;
      }

      console.log('計時結束成功:', data);

      // 記錄修改歷史
      try {
        await supabase.from('test_progress_audit').insert({
          system_id: systemId,
          station_id: stationId,
          item_id: itemId,
          change_type: 'complete_timer',
          old_values: {
            started_at: currentStartedAt,
            status: 'On-going'
          },
          new_values: {
            completed_at: currentTime,
            status: 'Done',
            actual_hours: actualHours,
            user: user?.displayName || user?.username || '未知用戶'
          },
          user_id: user?.userId
        });
      } catch (auditError) {
        console.error('記錄審計失敗:', auditError);
      }

      toast({
        title: "計時結束",
        description: `測試項目已完成，耗時 ${actualHours.toFixed(2)} 小時`,
      });

      onTimeUpdate();
    } catch (error: any) {
      console.error('結束計時錯誤:', error);
      toast({
        title: "結束計時失敗",
        description: error.message || "無法結束計時，請重試",
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
          {isUpdating ? "處理中..." : "開始"}
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
            {isUpdating ? "處理中..." : "結束"}
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