
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SystemStatusCalculator } from "./SystemStatusCalculator";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  actual_completed_at?: string;
}

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
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

interface SystemStatusUpdaterProps {
  filteredSystems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  onSystemUpdate: () => void;
}

export function SystemStatusUpdater({
  filteredSystems,
  stations,
  items,
  progress,
  getProgressForSystemItem,
  onSystemUpdate,
}: SystemStatusUpdaterProps) {
  const updateInProgress = useRef(false);

  const updateSystemStatus = useCallback(async () => {
    if (updateInProgress.current) {
      return;
    }

    updateInProgress.current = true;
    console.log('=== 開始系統狀態自動更新（GB300 L10 邏輯）===');

    try {
      const updates = [];
      
      for (const system of filteredSystems) {
        const calculatedResult = SystemStatusCalculator.calculateSystemStatus(
          system.id,
          stations,
          items,
          getProgressForSystemItem
        );
        
        const isComplete = calculatedResult.status === '已完成';
        const latestCompletionTime = SystemStatusCalculator.getSystemLatestCompletionTime(
          system.id,
          stations,
          items,
          getProgressForSystemItem
        );
        
        console.log(`系統 ${system.system_name}:`);
        console.log(`- 資料庫狀態: "${system.current_station}"`);
        console.log(`- 計算狀態: "${calculatedResult.currentStation}"`);
        console.log(`- 進度總和: ${calculatedResult.progressSum}`);
        console.log(`- 是否完成: ${isComplete}`);
        
        let updatedFields: any = {};
        let needsUpdate = false;
        
        // 當前站點狀態更新
        if (system.current_station !== calculatedResult.currentStation) {
          updatedFields.current_station = calculatedResult.currentStation;
          needsUpdate = true;
          console.log(`需要更新當前站點: "${system.current_station}" → "${calculatedResult.currentStation}"`);
        }
        
        // 系統狀態更新
        const newStatus = calculatedResult.status === '已完成' ? 'Done' : 
                         calculatedResult.status === '未開始' ? 'Not Start' : 'On-going';
        if (system.status !== newStatus) {
          updatedFields.status = newStatus;
          needsUpdate = true;
          console.log(`需要更新狀態: "${system.status}" → "${newStatus}"`);
        }
        
        // 整體進度更新（基於進度總和）
        const newOverallProgress = Math.round((calculatedResult.progressSum / 5) * 100);
        if (system.overall_progress !== newOverallProgress) {
          updatedFields.overall_progress = newOverallProgress;
          needsUpdate = true;
          console.log(`需要更新整體進度: ${system.overall_progress}% → ${newOverallProgress}%`);
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
  }, [filteredSystems, stations, items, getProgressForSystemItem, onSystemUpdate]);

  useEffect(() => {
    updateSystemStatus();
  }, [updateSystemStatus, progress]);

  return null; // 這是一個邏輯組件，不渲染任何內容
}
