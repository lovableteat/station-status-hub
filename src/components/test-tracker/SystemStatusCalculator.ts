
export interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
  actual_started_at?: string;
  actual_completed_at?: string;
}

export interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

export interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
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

export class SystemStatusCalculator {
  static calculateSystemStatus(
    system: TestSystem,
    stations: TestStation[],
    items: TestItem[],
    progress: TestProgress[]
  ): {
    status: string;
    overallProgress: number;
    currentStation: string;
    isComplete: boolean;
  } {
    console.log(`=== 計算系統 ${system.id} 狀態 ===`);

    // 只考慮 Station 0-4 (station_order 0-4)
    const targetStations = stations
      .filter(s => s.station_order >= 0 && s.station_order <= 4)
      .sort((a, b) => a.station_order - b.station_order);

    console.log('目標站點數量:', targetStations.length);
    console.log('站點詳情:', targetStations.map(s => 
      `Station ${s.station_order} - ${s.station_name}`
    ));

    let totalProgressValue = 0;
    const maxProgressValue = targetStations.length; // 每個站點最大值為1
    const stationProgressValues: number[] = [];

    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      
      if (stationItems.length === 0) {
        console.log(`${station.station_name}: 無測項`);
        stationProgressValues.push(0);
        return;
      }

      // 計算此站點的完成項目數
      let completedCount = 0;
      stationItems.forEach(item => {
        const prog = progress.find(p => 
          p.system_id === system.id && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        
        console.log(`  - ${item.item_name}: ${prog?.status || 'Not Start'}`);
        
        if (prog?.status === 'Done') {
          completedCount++;
        }
      });

      // 站點進度值：完成項目數 / 總項目數
      const stationProgressValue = completedCount / stationItems.length;
      stationProgressValues.push(stationProgressValue);
      totalProgressValue += stationProgressValue;
      
      console.log(`${station.station_name}: ${completedCount}/${stationItems.length} = ${stationProgressValue}`);
    });

    console.log('總進度值:', `${totalProgressValue}/${maxProgressValue}`);
    console.log('各站點進度值:', targetStations.map((station, index) => 
      `${station.station_name}: ${stationProgressValues[index]}`
    ));

    // 計算整體進度百分比
    const overallProgress = Math.round((totalProgressValue / maxProgressValue) * 100);

    // 判斷系統狀態 - 更嚴格的完成條件
    let status: string;
    let isComplete = false;
    
    if (totalProgressValue >= maxProgressValue) {
      // 所有站點都完成才算完成
      const allStationsComplete = stationProgressValues.every(value => value === 1);
      if (allStationsComplete) {
        status = '已完成';
        isComplete = true;
      } else {
        status = '進行中';
      }
    } else if (totalProgressValue > 0) {
      status = '進行中';
    } else {
      status = '未開始';
    }

    // 確定當前站點 - 找第一個未完成的站點
    let currentStation = targetStations[0]?.station_name || 'Station 0';
    for (let i = 0; i < stationProgressValues.length; i++) {
      if (stationProgressValues[i] < 1) {
        currentStation = targetStations[i].station_name;
        break;
      } else if (i === stationProgressValues.length - 1) {
        // 如果所有站點都完成，當前站點為最後一個站點
        currentStation = targetStations[i].station_name;
      }
    }

    console.log(`最終狀態判斷: 總進度值=${totalProgressValue}, 最大值=${maxProgressValue}, 狀態=${status}`);
    console.log(`系統 ${system.system_name}:`);
    console.log(`- 資料庫狀態: "${system.status}"`);
    console.log(`- 計算狀態: "${status}"`);
    console.log(`- 是否完成: ${isComplete}`);

    return {
      status,
      overallProgress,
      currentStation,
      isComplete
    };
  }

  static shouldUpdateSystem(
    system: TestSystem,
    calculatedStatus: string,
    calculatedProgress: number,
    calculatedCurrentStation: string
  ): boolean {
    // 檢查是否需要更新
    const needsUpdate = 
      system.status !== calculatedStatus ||
      system.overall_progress !== calculatedProgress ||
      system.current_station !== calculatedCurrentStation;

    if (needsUpdate) {
      console.log(`系統 ${system.system_name} 需要更新:`);
      console.log(`- 狀態: "${system.status}" → "${calculatedStatus}"`);
      console.log(`- 進度: ${system.overall_progress}% → ${calculatedProgress}%`);
      console.log(`- 當前站點: "${system.current_station}" → "${calculatedCurrentStation}"`);
    }

    return needsUpdate;
  }
}
