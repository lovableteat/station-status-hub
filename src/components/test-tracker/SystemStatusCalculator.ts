
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

export class SystemStatusCalculator {
  /**
   * 計算系統當前狀態 - 基於 GB300 L10 測試進度邏輯
   * @param systemId 系統ID
   * @param stations 站點列表
   * @param items 測試項目列表
   * @param getProgressForSystemItem 獲取進度的函數
   * @returns 系統狀態物件
   */
  static calculateSystemStatus(
    systemId: string,
    stations: TestStation[],
    items: TestItem[],
    getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined
  ) {
    console.log(`=== 計算系統 ${systemId} 狀態（GB300 L10 邏輯）===`);
    
    // 只考慮 Station 0-4
    const targetStations = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 4)
      .sort((a, b) => a.station_order - b.station_order);
    
    if (targetStations.length === 0) {
      console.log('沒有找到 Station 0-4');
      return { status: '未開始', currentStation: 'Station 0', progressSum: 0 };
    }
    
    let progressSum = 0;
    const stationProgress: Array<{ station: TestStation; completed: boolean; progress: number }> = [];
    
    // 計算每個站點的進度
    for (const station of targetStations) {
      const stationItems = items.filter(item => item.station_id === station.id);
      
      if (stationItems.length === 0) {
        // 沒有測試項目的站點視為已完成
        stationProgress.push({ station, completed: true, progress: 100 });
        progressSum += 1;
        continue;
      }
      
      let completedItems = 0;
      for (const item of stationItems) {
        const itemProgress = getProgressForSystemItem(systemId, station.id, item.id);
        if (itemProgress?.status === 'Done') {
          completedItems++;
        }
      }
      
      const stationCompletionRate = (completedItems / stationItems.length) * 100;
      const isStationCompleted = stationCompletionRate === 100;
      
      stationProgress.push({ 
        station, 
        completed: isStationCompleted, 
        progress: stationCompletionRate 
      });
      
      // Station 完成度達到100%時計為1，否則計為0
      if (isStationCompleted) {
        progressSum += 1;
      }
      
      console.log(`Station ${station.station_order}: ${stationCompletionRate}% → ${isStationCompleted ? 1 : 0}`);
    }
    
    console.log(`進度總和: ${progressSum}`);
    
    // 根據進度總和判斷狀態
    let status: string;
    let currentStation: string;
    
    if (progressSum === 0) {
      status = '未開始';
      currentStation = 'Station 0';
    } else if (progressSum === 5) {
      status = '已完成';
      currentStation = 'Station 4';
    } else {
      status = '進行中';
      // 找到第一個未完成的Station作為當前站點
      const firstIncompleteStation = stationProgress.find(sp => !sp.completed);
      currentStation = firstIncompleteStation 
        ? `Station ${firstIncompleteStation.station.station_order}`
        : 'Station 4';
    }
    
    console.log(`狀態: ${status}, 當前站點: ${currentStation}`);
    
    return { status, currentStation, progressSum, stationProgress };
  }
  
  /**
   * 獲取系統最早開始時間
   */
  static getSystemEarliestStartTime(
    systemId: string,
    stations: TestStation[],
    items: TestItem[],
    getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined
  ): string | undefined {
    const targetStations = stations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allStartTimes: string[] = [];
    
    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.started_at) {
          allStartTimes.push(prog.started_at);
        }
      });
    });
    
    if (allStartTimes.length === 0) return undefined;
    return allStartTimes.sort()[0];
  }
  
  /**
   * 獲取系統最晚完成時間
   */
  static getSystemLatestCompletionTime(
    systemId: string,
    stations: TestStation[],
    items: TestItem[],
    getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined
  ): string | undefined {
    const targetStations = stations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allCompletionTimes: string[] = [];
    
    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.completed_at) {
          allCompletionTimes.push(prog.completed_at);
        }
      });
    });
    
    if (allCompletionTimes.length === 0) return undefined;
    return allCompletionTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }
}
