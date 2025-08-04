// PDF專用進度計算邏輯
import { TestSystem, TestStation, TestItem, TestProgress } from "../SystemStatusCalculator";

export interface PDFSystemData {
  id: string;
  systemName: string;
  status: string;
  assignedEngineer: string;
  overallProgress: number;
  station0Progress: number;
  station1Progress: number;
  station2Progress: number;
  station3Progress: number;
  actualStartedAt?: string;
  actualCompletedAt?: string;
  excludeFromDashboard: boolean;
}

export interface PDFStatsData {
  totalSystems: number;
  completedSystems: number;
  inProgressSystems: number;
  notStartedSystems: number;
  completionRate: number;
}

export class PDFProgressCalculator {
  static calculateSystemsData(
    systems: TestSystem[],
    stations: TestStation[],
    items: TestItem[],
    progress: TestProgress[]
  ): PDFSystemData[] {
    return systems.map(system => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // 計算各站點進度
      const station0 = this.calculateStationProgress(system, 0, stations, items, systemProgress);
      const station1 = this.calculateStationProgress(system, 1, stations, items, systemProgress);
      const station2 = this.calculateStationProgress(system, 2, stations, items, systemProgress);
      const station3 = this.calculateStationProgress(system, 3, stations, items, systemProgress);

      return {
        id: system.id,
        systemName: system.system_name,
        status: system.status,
        assignedEngineer: system.assigned_engineer || 'Unassigned',
        overallProgress: system.overall_progress || 0,
        station0Progress: station0,
        station1Progress: station1,
        station2Progress: station2,
        station3Progress: station3,
        actualStartedAt: system.actual_started_at,
        actualCompletedAt: system.actual_completed_at,
        excludeFromDashboard: (system as any).exclude_from_dashboard || false
      };
    });
  }

  private static calculateStationProgress(
    system: TestSystem,
    stationOrder: number,
    stations: TestStation[],
    items: TestItem[],
    systemProgress: TestProgress[]
  ): number {
    // 如果系統已完成，所有站點都應該顯示100%
    if (system.status === '已完成') {
      return 100;
    }

    const station = stations.find(s => s.station_order === stationOrder);
    if (!station) return 0;

    const stationItems = items.filter(item => item.station_id === station.id);
    if (stationItems.length === 0) return 0;

    const completedItems = stationItems.filter(item => {
      const itemProgress = systemProgress.find(p => 
        p.station_id === station.id && 
        p.item_id === item.id &&
        p.status === 'Done'
      );
      return itemProgress !== undefined;
    });

    return Math.round((completedItems.length / stationItems.length) * 100);
  }

  static calculateStats(systemsData: PDFSystemData[]): PDFStatsData {
    const total = systemsData.length;
    const completed = systemsData.filter(s => s.status === '已完成').length;
    const inProgress = systemsData.filter(s => s.status === '進行中').length;
    const notStarted = systemsData.filter(s => s.status === '未開始').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      totalSystems: total,
      completedSystems: completed,
      inProgressSystems: inProgress,
      notStartedSystems: notStarted,
      completionRate
    };
  }

  static getProgressColorClass(progress: number): string {
    if (progress === 100) return 'progress-100';
    if (progress >= 50) return 'progress-high';
    if (progress > 0) return 'progress-low';
    return 'progress-zero';
  }

  static getStatusColorClass(status: string): string {
    switch (status) {
      case '已完成': return 'status-completed';
      case '進行中': return 'status-ongoing';
      case '未開始': return 'status-notstarted';
      default: return 'status-unknown';
    }
  }
}