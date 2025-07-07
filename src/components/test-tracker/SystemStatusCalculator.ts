
import { TestSystem, TestStation, TestItem, TestProgress } from "../TestTracker";

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
    
    // 只考慮 Station 0-4
    const targetStations = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 4)
      .sort((a, b) => a.station_order - b.station_order);
    
    console.log(`目標站點數量: ${targetStations.length}`);
    
    const stationProgress = targetStations.map(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      
      if (stationItems.length === 0) {
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
        return itemProgress?.status === 'Done';
      });
      
      const isCompleted = completedItems.length === stationItems.length;
      const progressValue = isCompleted ? 1 : 0;
      
      console.log(`${station.station_name}: ${completedItems.length}/${stationItems.length} = ${progressValue}`);
      
      return {
        stationId: station.id,
        stationName: station.station_name,
        completed: isCompleted,
        progressValue
      };
    });
    
    // 計算總進度值（0-5）
    const totalProgressValue = stationProgress.reduce((sum, station) => sum + station.progressValue, 0);
    console.log(`總進度值: ${totalProgressValue}`);
    
    // 根據總進度值判斷狀態
    let currentStation: string;
    if (totalProgressValue === 0) {
      currentStation = '未開始';
    } else if (totalProgressValue >= 1 && totalProgressValue <= 4) {
      currentStation = '進行中';
    } else if (totalProgressValue === 5) {
      currentStation = '已完成';
    } else {
      currentStation = '未開始'; // 預設值
    }
    
    console.log(`最終狀態: ${currentStation}`);
    
    return {
      currentStation,
      overallProgress: Math.round((totalProgressValue / 5) * 100),
      stationProgress
    };
  }
}
