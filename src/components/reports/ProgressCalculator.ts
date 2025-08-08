// 進度計算邏輯
export interface SystemProgressData {
  systemId: string;
  systemName: string;
  status: string;
  assignedEngineer: string;
  station0Progress: number;
  station1Progress: number;
  station2Progress: number;
  station3Progress: number;
  overallProgress: number;
  excludeFromDashboard: boolean;
  actualStartedAt?: string;
  actualCompletedAt?: string;
}

export interface StationProgressInfo {
  stationId: string;
  stationName: string;
  completedItems: number;
  totalItems: number;
  progressPercent: number;
}

export class ProgressCalculator {
  static calculateSystemProgress(
    systems: any[],
    stations: any[],
    testItems: any[],
    progress: any[]
  ): SystemProgressData[] {
    return systems.map(system => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // 計算各站點進度
      const stationProgresses = this.calculateStationProgresses(
        system.id,
        stations,
        testItems,
        systemProgress
      );
      
      // 獲取各站點進度值
      const station0 = stationProgresses.find(s => 
        s.stationName.includes('Station 0') || s.stationName.includes('工廠組裝')
      );
      const station1 = stationProgresses.find(s => 
        s.stationName.includes('Station 1') || s.stationName.includes('開機')
      );
      const station2 = stationProgresses.find(s => 
        s.stationName.includes('Station 2') || s.stationName.includes('FW') || s.stationName.includes('SFT')
      );
      const station3 = stationProgresses.find(s => 
        s.stationName.includes('Station 3') || s.stationName.includes('NV') || s.stationName.includes('diag') || s.stationName.includes('Pega')
      );

      // 如果系統已完成，所有站點都應該顯示100%
      const isCompleted = system.status === '已完成';
      
      return {
        systemId: system.id,
        systemName: system.system_name,
        status: system.status,
        assignedEngineer: system.assigned_engineer || 'Unassigned',
        station0Progress: isCompleted ? 100 : (station0?.progressPercent || 0),
        station1Progress: isCompleted ? 100 : (station1?.progressPercent || 0),
        station2Progress: isCompleted ? 100 : (station2?.progressPercent || 0),
        station3Progress: isCompleted ? 100 : (station3?.progressPercent || 0),
        overallProgress: system.overall_progress || 0,
        excludeFromDashboard: system.exclude_from_dashboard || false,
        actualStartedAt: system.actual_started_at,
        actualCompletedAt: system.actual_completed_at
      };
    });
  }

  private static calculateStationProgresses(
    systemId: string,
    stations: any[],
    testItems: any[],
    systemProgress: any[]
  ): StationProgressInfo[] {
    return stations.map(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      const completedItems = stationItems.filter(item => {
        const itemProgress = systemProgress.find(p => 
          p.station_id === station.id && 
          p.item_id === item.id &&
          p.status === 'Done'
        );
        return itemProgress !== undefined;
      });

      const progressPercent = stationItems.length > 0 
        ? Math.round((completedItems.length / stationItems.length) * 100)
        : 0;

      return {
        stationId: station.id,
        stationName: station.station_name,
        completedItems: completedItems.length,
        totalItems: stationItems.length,
        progressPercent
      };
    });
  }

  static getStatusColor(status: string): string {
    switch (status) {
      case '已完成': return 'text-green-600';
      case '進行中': return 'text-orange-600';
      case '未開始': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }

  static getProgressColor(progress: number): string {
    if (progress === 100) return 'text-green-600';
    if (progress >= 50) return 'text-orange-600';
    if (progress > 0) return 'text-blue-600';
    return 'text-red-600';
  }
}