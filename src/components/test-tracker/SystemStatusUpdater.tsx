
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SystemStatusCalculator, TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";

interface SystemStatusUpdaterProps {
  systems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  onSystemUpdate: () => void;
}

export function SystemStatusUpdater({
  systems,
  stations,
  items,
  progress,
  onSystemUpdate,
}: SystemStatusUpdaterProps) {
  const { toast } = useToast();
  const updateInProgress = useRef(false);

  // 獲取系統最晚完成時間
  const getSystemLatestCompletionTime = useCallback((systemId: string) => {
    const targetStations = stations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allCompletionTimes: string[] = [];
    
    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        if (prog?.completed_at) {
          allCompletionTimes.push(prog.completed_at);
        }
      });
    });
    
    if (allCompletionTimes.length === 0) return undefined;
    return allCompletionTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [stations, items, progress]);

  // 系統狀態自動更新（僅更新整體進度和系統狀態，不覆蓋手動設定的當前站點）
  useEffect(() => {
    if (updateInProgress.current) {
      return;
    }

    const updateSystemStatus = async () => {
      updateInProgress.current = true;
      console.log('=== 開始系統狀態自動更新 ===');

      try {
        const updates = [];
        
        for (const system of systems) {
          const statusResult = SystemStatusCalculator.calculateSystemStatus(
            system.id,
            stations,
            items,
            progress
          );
          
          const isComplete = statusResult.currentStation === '已完成';
          const latestCompletionTime = getSystemLatestCompletionTime(system.id);
          
          console.log(`系統 ${system.system_name}:`);
          console.log(`- 資料庫狀態: "${system.current_station}"`);
          console.log(`- 計算狀態: "${statusResult.currentStation}"`);
          console.log(`- 是否完成: ${isComplete}`);
          
          let updatedFields: any = {};
          let needsUpdate = false;
          
          // 整體進度更新
          if (system.overall_progress !== statusResult.overallProgress) {
            updatedFields.overall_progress = statusResult.overallProgress;
            needsUpdate = true;
            console.log(`需要更新整體進度: ${system.overall_progress}% → ${statusResult.overallProgress}%`);
          }
          
          // 系統狀態更新
          const newStatus = statusResult.currentStation === '已完成' ? 'Done' : 
                           statusResult.currentStation === '未開始' ? 'Not Start' : 'On-going';
          if (system.status !== newStatus) {
            updatedFields.status = newStatus;
            needsUpdate = true;
            console.log(`需要更新狀態: "${system.status}" → "${newStatus}"`);
          }
          
          // 實際完成時間處理
          if (isComplete && latestCompletionTime) {
            if (!system.actual_completed_at) {
              updatedFields.actual_completed_at = latestCompletionTime;
              needsUpdate = true;
              console.log(`設定實際完成時間: ${latestCompletionTime}`);
            }
          } else if (!isComplete && system.actual_completed_at) {
            updatedFields.actual_completed_at = null;
            needsUpdate = true;
            console.log(`清除實際完成時間`);
          }
          
          // 注意：不再自動更新 current_station，保留用戶手動設定的值
          
          if (needsUpdate) {
            updates.push({
              id: system.id,
              fields: updatedFields,
              name: system.system_name
            });
          }
        }
        
        // 執行批量更新
        if (updates.length > 0) {
          console.log(`執行 ${updates.length} 個系統更新...`);
          
          for (const update of updates) {
            try {
              const { error } = await supabase
                .from('test_systems')
                .update(update.fields)
                .eq('id', update.id);

              if (error) throw error;
              console.log(`成功更新系統 ${update.name}`);
            } catch (error) {
              console.error(`更新系統 ${update.name} 失敗:`, error);
            }
          }
          
          // 觸發資料重新載入
          onSystemUpdate();
        }
      } catch (error) {
        console.error('系統狀態更新錯誤:', error);
      } finally {
        updateInProgress.current = false;
      }
    };

    // 立即執行更新
    updateSystemStatus();
  }, [systems, stations, items, progress, getSystemLatestCompletionTime, onSystemUpdate]);

  return null; // 這是一個邏輯組件，不渲染任何UI
}
