import { useMemo } from 'react';

interface UnifiedSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
}

interface UnifiedProgress {
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

export interface GanttTask {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  assignee: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
}

export function useGanttTasks(
  systems: UnifiedSystem[],
  progress: UnifiedProgress[]
): GanttTask[] {
  return useMemo(() => {
    if (!systems.length) return [];

    return systems.map((system) => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // Calculate actual start and end dates from progress data
      const allStartTimes = systemProgress
        .map(p => p.started_at)
        .filter(Boolean)
        .map(t => new Date(t!));
      
      const allEndTimes = systemProgress
        .map(p => p.completed_at)
        .filter(Boolean)
        .map(t => new Date(t!));
      
      const startDate = allStartTimes.length > 0 
        ? new Date(Math.min(...allStartTimes.map(d => d.getTime())))
        : null;
        
      const endDate = allEndTimes.length > 0
        ? new Date(Math.max(...allEndTimes.map(d => d.getTime())))
        : null;
      
      // Calculate progress percentage based on completed stations (25% per station)
      const stationProgress = new Map();
      systemProgress.forEach(p => {
        if (!stationProgress.has(p.station_id)) {
          stationProgress.set(p.station_id, { total: 0, completed: 0 });
        }
        const station = stationProgress.get(p.station_id);
        station.total += 1;
        if (p.status === 'Done') {
          station.completed += 1;
        }
      });
      
      // Count completed stations (25% each)
      let completedStations = 0;
      const totalStations = 4; // Station 0, 1, 2, 3
      stationProgress.forEach(station => {
        if (station.total > 0 && station.completed === station.total) {
          completedStations += 1;
        }
      });
      
      const progressPercent = Math.round((completedStations / totalStations) * 100);
      
      // Determine status
      let status: GanttTask['status'] = 'not_started';
      if (progressPercent === 100) {
        status = 'completed';
      } else if (progressPercent > 0) {
        status = 'in_progress';
      }

      return {
        id: system.id,
        name: system.system_name,
        startDate,
        endDate,
        progress: progressPercent,
        assignee: system.assigned_engineer || 'Unassigned',
        status
      };
    });
  }, [systems, progress]);
}