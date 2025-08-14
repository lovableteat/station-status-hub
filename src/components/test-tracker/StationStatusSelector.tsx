
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StationStatusSelectorProps {
  systemId: string;
  currentStatus: string;
  onUpdate: () => void;
}

export function StationStatusSelector({ systemId, currentStatus, onUpdate }: StationStatusSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({ 
          current_station: newStatus,
          // 同時更新 status 以確保儀表板顯示正確
          status: newStatus === '已完成' ? 'Done' : 
                  newStatus === '進行中' ? 'On-going' : 
                  newStatus === '未開始' ? 'Not Start' : 'On-going'
        })
        .eq('id', systemId);

      if (error) throw error;

      // 觸發資料重新載入
      onUpdate();
      
      toast({
        title: "更新成功",
        description: `當前站點狀態已更新為：${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating station status:', error);
      toast({
        title: "更新失敗",
        description: "無法更新當前站點狀態",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isUpdating}>
      <SelectTrigger className="h-8 w-24 z-50">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-50 bg-background border shadow-lg">
        <SelectItem value="未開始">未開始</SelectItem>
        <SelectItem value="進行中">進行中</SelectItem>
        <SelectItem value="已完成">已完成</SelectItem>
      </SelectContent>
    </Select>
  );
}
