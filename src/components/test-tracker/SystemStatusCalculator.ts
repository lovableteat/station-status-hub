
export interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  actual_completed_at?: string;
}

export interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

export interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
}

export interface TestProgress {
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

export interface SystemStatusResult {
  currentStation: string;
  overallProgress: number;
  stationProgress: Array<{
    stationId: string;
    stationName: string;
    completed: boolean;
    progressValue: number; // 0 or 1
  }>;
}

export class SystemStatusCalculator {
  static calculateSystemStatus(
    systemId: string,
    stations: TestStation[],
    items: TestItem[],
    progress: TestProgress[]
  ): SystemStatusResult {
    console.log(`=== 計算系統 ${systemId} 狀態 ===`);
    
    // 確保包含 Station 0-4（共5個站點）
    const targetStations = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 4)
      .sort((a, b) => a.station_order - b.station_order);
    
    console.log(`目標站點數量: ${targetStations.length}`);
    console.log(`站點詳情:`, targetStations.map(s => `Station ${s.station_order} - ${s.station_name}`));
    
    const stationProgress = targetStations.map(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      
      if (stationItems.length === 0) {
        console.log(`${station.station_name}: 無測試項目 = 0`);
        return {
          stationId: station.id,
          stationName: station.station_name,
          completed: false,
          progressValue: 0
        };
      }
      
      const completedItems = stationItems.filter(item => {
        const itemProgress = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        const isDone = itemProgress?.status === 'Done';
        console.log(`  - ${item.item_name}: ${isDone ? 'Done' : itemProgress?.status || 'Not Start'}`);
        return isDone;
      });
      
      const isCompleted = completedItems.length === stationItems.length && stationItems.length > 0;
      const progressValue = isCompleted ? 1 : 0;
      
      console.log(`${station.station_name}: ${completedItems.length}/${stationItems.length} = ${progressValue}`);
      
      return {
        stationId: station.id,
        stationName: station.station_name,
        completed: isCompleted,
        progressValue
      };
    });
    
    // 計算總進度值（應該是0-5）
    const totalProgressValue = stationProgress.reduce((sum, station) => sum + station.progressValue, 0);
    const maxPossibleProgress = targetStations.length; // 應該是5
    
    console.log(`總進度值: ${totalProgressValue}/${maxPossibleProgress}`);
    
    // 根據總進度值判斷狀態
    let currentStation: string;
    if (totalProgressValue === 0) {
      currentStation = '未開始';
    } else if (totalProgressValue >= 1 && totalProgressValue < maxPossibleProgress) {
      currentStation = '進行中';
    } else if (totalProgressValue === maxPossibleProgress) {
      currentStation = '已完成';
    } else {
      console.warn(`異常的總進度值: ${totalProgressValue}, 最大值: ${maxPossibleProgress}`);
      currentStation = '進行中'; // 預設值
    }
    
    console.log(`最終狀態: ${currentStation}`);
    
    return {
      currentStation,
      overallProgress: Math.round((totalProgressValue / maxPossibleProgress) * 100),
      stationProgress
    };
  }
}
