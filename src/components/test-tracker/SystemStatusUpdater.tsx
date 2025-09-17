
import { useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SystemStatusCalculator, TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";

interface SystemStatusUpdaterProps {
  systems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  onSystemUpdate: () => void;
  lastCreatedSystemId?: string; // 新增：最後創建的系統ID，用於增量更新
}

export function SystemStatusUpdater({
  systems,
  stations,
  items,
  progress,
  onSystemUpdate,
  lastCreatedSystemId,
}: SystemStatusUpdaterProps) {
  const { toast } = useToast();
  const updateInProgress = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

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

  // 增量更新系統狀態（優化性能）
  const systemsToUpdate = useMemo(() => {
    if (lastCreatedSystemId) {
      // 如果有新創建的系統，優先更新該系統
      return systems.filter(s => s.id === lastCreatedSystemId);
    }
    // 否則只更新有進度變更的系統
    return systems;
  }, [systems, lastCreatedSystemId]);

  // 防抖更新機制
  const debouncedUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      if (updateInProgress.current) return;

      updateInProgress.current = true;

      try {
        const updates = [];
        
        for (const system of systemsToUpdate) {
          const statusResult = SystemStatusCalculator.calculateSystemStatus(
            system,
            stations,
            items,
            progress
          );
          
          const isComplete = statusResult.isComplete;
          const latestCompletionTime = getSystemLatestCompletionTime(system.id);
          
          let updatedFields: any = {};
          let needsUpdate = false;
          
          // 整體進度更新
          if (system.overall_progress !== statusResult.overallProgress) {
            updatedFields.overall_progress = statusResult.overallProgress;
            needsUpdate = true;
          }
          
          // 系統狀態更新 - 使用更加細緻的邏輯
          // 只有在特定情況下才更新 status 和 current_station
          const newStatus = statusResult.status;
          
          // 系統狀態更新邏輯（減少日誌輸出）
          if (isComplete && statusResult.overallProgress === 100) {
            if (system.status !== 'Done') {
              updatedFields.status = 'Done';
              needsUpdate = true;
            }
            if (system.current_station !== '已完成') {
              updatedFields.current_station = '已完成';
              needsUpdate = true;
            }
          }
          else if (statusResult.overallProgress === 0 && system.current_station === '未開始') {
            if (system.status !== 'Not Start') {
              updatedFields.status = 'Not Start';
              needsUpdate = true;
            }
          }
          else if (statusResult.overallProgress > 0 && statusResult.overallProgress < 100) {
            if (system.current_station === '未開始' || system.current_station === '已完成') {
              updatedFields.current_station = '進行中';
              needsUpdate = true;
            }
            if (system.status !== 'On-going') {
              updatedFields.status = 'On-going';
              needsUpdate = true;
            }
          }
          
          // 實際完成時間處理
          if (isComplete && latestCompletionTime) {
            if (!system.actual_completed_at) {
              updatedFields.actual_completed_at = latestCompletionTime;
              needsUpdate = true;
            }
          } else if (!isComplete && system.actual_completed_at) {
            updatedFields.actual_completed_at = null;
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            updates.push({
              id: system.id,
              fields: updatedFields,
              name: system.system_name
            });
          }
        }
        
        // 批量更新實施
        if (updates.length > 0) {
          try {
            // 使用 Promise.allSettled 進行並行更新
            const updatePromises = updates.map(update => 
              supabase
                .from('test_systems')
                .update(update.fields)
                .eq('id', update.id)
            );
            
            const results = await Promise.allSettled(updatePromises);
            
            let successCount = 0;
            results.forEach((result, index) => {
              if (result.status === 'fulfilled' && !result.value.error) {
                successCount++;
              }
            });
            
            if (successCount > 0) {
              onSystemUpdate();
            }
          } catch (error) {
            console.error('批量更新失敗:', error);
          }
        }
      } catch (error) {
        console.error('系統狀態更新錯誤:', error);
      } finally {
        updateInProgress.current = false;
      }
    }, 300); // 300ms 防抖延遲
  }, [systemsToUpdate, stations, items, progress, getSystemLatestCompletionTime, onSystemUpdate]);

  useEffect(() => {
    debouncedUpdate();
    
    // 清理函數
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [debouncedUpdate]);

  return null; // 這是一個邏輯組件，不渲染任何UI
}
