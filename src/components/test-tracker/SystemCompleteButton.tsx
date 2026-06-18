import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface SystemCompleteButtonProps {
  systemId: string;
  systemName: string;
  stations: Array<{
    id: string;
    station_name: string;
    station_order: number;
  }>;
  items: Array<{
    id: string;
    station_id: string;
    item_name: string;
  }>;
  onSystemUpdate: (newSystemId?: string) => void;
}

export function SystemCompleteButton({
  systemId,
  systemName,
  stations,
  items,
  onSystemUpdate
}: SystemCompleteButtonProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleCompleteSystem = async () => {
    try {
      setIsCompleting(true);

      // 獲取Station 0-4的站點 (根據系統邏輯)
      const targetStations = stations.filter(station => 
        station.station_order >= 0 && station.station_order <= 4
      );

      // 批量更新或新增所有測試項目進度為完成
      const currentTime = new Date().toISOString();

      // 首先獲取現有的進度記錄
      const { data: existingProgress, error: fetchError } = await supabase
        .from('test_progress')
        .select('*')
        .eq('system_id', systemId);

      if (fetchError) {
        console.error('獲取現有進度錯誤:', fetchError);
        throw fetchError;
      }

      const progressUpdates = [];
      const progressInserts = [];

      for (const station of targetStations) {
        const stationItems = items.filter(item => item.station_id === station.id);
        
        for (const item of stationItems) {
          const existingRecord = existingProgress?.find(p => 
            p.station_id === station.id && p.item_id === item.id
          );

          const progressData = {
            system_id: systemId,
            station_id: station.id,
            item_id: item.id,
            status: 'Done',
            progress_percent: 100,
            notes: '一鍵完成功能自動設定',
            started_at: currentTime,
            completed_at: currentTime
          };

          if (existingRecord) {
            // 更新現有記錄
            progressUpdates.push({
              id: existingRecord.id,
              ...progressData
            });
          } else {
            // 新增記錄
            progressInserts.push(progressData);
          }
        }
      }

      if (progressUpdates.length === 0 && progressInserts.length === 0) {
        toast({
          title: "無法完成",
          description: "此系統沒有找到可完成的測試項目",
          variant: "destructive"
        });
        return;
      }

      // 分別處理更新和新增
      if (progressUpdates.length > 0) {
        for (const update of progressUpdates) {
          const { error } = await supabase
            .from('test_progress')
            .update({
              status: update.status,
              progress_percent: update.progress_percent,
              notes: update.notes,
              started_at: update.started_at,
              completed_at: update.completed_at
            })
            .eq('id', update.id);

          if (error) {
            console.error('更新進度錯誤:', error);
            throw error;
          }
        }
      }

      if (progressInserts.length > 0) {
        const { error: insertError } = await supabase
          .from('test_progress')
          .insert(progressInserts);

        if (insertError) {
          console.error('插入進度錯誤:', insertError);
          throw insertError;
        }
      }

      // 手動更新系統狀態為完成
      const { error: systemError } = await supabase
        .from('test_systems')
        .update({
          status: 'Done',
          current_station: '已完成',
          overall_progress: 100,
          actual_completed_at: currentTime
        })
        .eq('id', systemId);

      if (systemError) {
        console.error('系統狀態更新錯誤:', systemError);
        throw systemError;
      }

      toast({
        title: "一鍵完成成功",
        description: `機台 ${systemName} 的所有測試項目已標記為完成 (共 ${progressUpdates.length + progressInserts.length} 項)`
      });

      // 觸發資料重新載入
      onSystemUpdate();

    } catch (error) {
      console.error('一鍵完成失敗:', error);
      toast({
        title: "一鍵完成失敗",
        description: `無法完成機台 ${systemName} 的進度，請稍後重試`,
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          disabled={isCompleting}
          className="text-success hover:text-success hover:bg-success/10 border-success/30"
        >
          <CheckSquare className={`${isMobile ? 'h-4 w-4 mr-2' : 'h-3 w-3 mr-1'}`} />
          {isMobile ? "一鍵完成" : "完成"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-slate-700/80 bg-slate-950/95 text-slate-50 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-50">確認一鍵完成機台測試</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-slate-300">
            <p>您確定要將機台 <strong>"{systemName}"</strong> 的所有測試進度設為完成嗎？</p>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.10] p-3 text-sm text-amber-50">
              <p className="font-semibold text-amber-100">⚠️ 注意事項</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-50/90 marker:text-amber-200">
                <li>此操作將所有Station 0-4的測試項目標記為100%完成</li>
                <li>會自動設定開始和完成時間為當前時間</li>
                <li>此操作無法復原，請謹慎使用</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCompleting} className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white">
            取消
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleCompleteSystem}
            disabled={isCompleting}
            className="bg-success text-success-foreground hover:bg-success/90"
          >
            {isCompleting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>處理中...</span>
              </div>
            ) : (
              "確認一鍵完成"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
