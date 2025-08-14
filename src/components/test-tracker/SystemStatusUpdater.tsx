
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
            system,
            stations,
            items,
            progress
          );
          
          const isComplete = statusResult.isComplete;
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
          
          // 系統狀態更新 - 使用更加細緻的邏輯
          // 只有在特定情況下才更新 status 和 current_station
          const newStatus = statusResult.status;
          
          // 如果系統已完成（100%），強制設定為 Done 和 已完成
          if (isComplete && statusResult.overallProgress === 100) {
            if (system.status !== 'Done') {
              updatedFields.status = 'Done';
              needsUpdate = true;
              console.log(`系統已完成，更新狀態: "${system.status}" → "Done"`);
            }
            if (system.current_station !== '已完成') {
              updatedFields.current_station = '已完成';
              needsUpdate = true;
              console.log(`系統已完成，更新當前站點: "${system.current_station}" → "已完成"`);
            }
          }
          // 如果系統未開始且沒有任何進度，設定為 Not Start 和 未開始
          else if (statusResult.overallProgress === 0 && system.current_station === '未開始') {
            if (system.status !== 'Not Start') {
              updatedFields.status = 'Not Start';
              needsUpdate = true;
              console.log(`系統未開始，更新狀態: "${system.status}" → "Not Start"`);
            }
          }
          // 如果有進度但不是 Done/已完成，且用戶設定的是 "進行中"，保持不變
          else if (statusResult.overallProgress > 0 && statusResult.overallProgress < 100) {
            // 只在當前沒有手動設定或狀態不一致時才更新
            if (system.current_station === '未開始' || system.current_station === '已完成') {
              // 如果用戶之前設定為未開始或已完成，但現在有進度了，更新為進行中
              updatedFields.current_station = '進行中';
              needsUpdate = true;
              console.log(`有進度但狀態不符，更新當前站點: "${system.current_station}" → "進行中"`);
            }
            if (system.status !== 'On-going') {
              updatedFields.status = 'On-going';
              needsUpdate = true;
              console.log(`有進度，更新狀態: "${system.status}" → "On-going"`);
            }
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
