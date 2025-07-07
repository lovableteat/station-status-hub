
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TestProgress {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status: string;
  progress_percent: number;
  notes: string;
  started_at?: string;
  completed_at?: string;
}

export class SystemTimeManager {
  static async updateSystemTime(
    systemId: string,
    timeType: 'start' | 'end',
    newTime: string | null,
    progress: TestProgress[],
    filteredStations: TestStation[],
    onSystemUpdate: () => void,
    toast: ReturnType<typeof useToast>["toast"]
  ) {
    try {
      const systemProgressRecords = progress.filter(p => p.system_id === systemId);
      
      if (systemProgressRecords.length === 0) {
        toast({
          title: "無法更新",
          description: "該系統尚未有任何測試進度記錄",
          variant: "destructive"
        });
        return;
      }

      const updateColumn = timeType === 'start' ? 'started_at' : 'completed_at';
      
      const targetStationIds = filteredStations
        .filter(station => station.station_order >= 0 && station.station_order <= 4)
        .map(station => station.id);
      
      const { error } = await supabase
        .from('test_progress')
        .update({ [updateColumn]: newTime })
        .eq('system_id', systemId)
        .in('station_id', targetStationIds);

      if (error) throw error;
      
      await onSystemUpdate();
      
      toast({
        title: "更新成功",
        description: `系統${timeType === 'start' ? '開始' : '完成'}時間已更新（僅影響Station 0-4）`,
      });
    } catch (error) {
      console.error('Error updating system time:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統時間",
        variant: "destructive"
      });
    }
  }
  
  static async updateActualCompletionTime(
    systemId: string,
    newActualTime: string | null,
    onSystemUpdate: () => void,
    toast: ReturnType<typeof useToast>["toast"]
  ) {
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({ actual_completed_at: newActualTime })
        .eq('id', systemId);

      if (error) throw error;
      
      await onSystemUpdate();
      
      toast({
        title: "更新成功",
        description: "實際完成時間已更新",
      });
    } catch (error) {
      console.error('Error updating actual completion time:', error);
      toast({
        title: "更新失敗",
        description: "無法更新實際完成時間",
        variant: "destructive"
      });
    }
  }
}
