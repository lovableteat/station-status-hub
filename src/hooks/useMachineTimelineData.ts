import { useMemo } from "react";
import { useUnifiedData } from "./useUnifiedData";

export interface MachineTimelineData {
  id: string;
  system_name: string;
  assigned_engineer: string;
  status: string;
  overall_progress: number;
  start_time?: string;
  end_time?: string;
  duration_hours?: number;
  stations: Array<{
    id: string;
    name: string;
    start_time?: string;
    end_time?: string;
    progress: number;
    status: string;
  }>;
}

export function useMachineTimelineData() {
  const { systems, stations, testItems, progress, isLoading } = useUnifiedData();

  const timelineData = useMemo(() => {
    if (!systems.length || !stations.length || !progress.length) {
      return [];
    }

    return systems.map(system => {
      // Get all progress records for this system
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // Calculate system-level start and end times
      const allStartTimes = systemProgress.map(p => p.started_at).filter(Boolean);
      const allEndTimes = systemProgress.map(p => p.completed_at).filter(Boolean);
      
      const systemStartTime = allStartTimes.length > 0 ? allStartTimes.sort()[0] : undefined;
      const systemEndTime = allEndTimes.length > 0 ? allEndTimes.sort().reverse()[0] : undefined;
      
      // Calculate duration in hours
      let durationHours: number | undefined;
      if (systemStartTime && systemEndTime) {
        const start = new Date(systemStartTime);
        const end = new Date(systemEndTime);
        durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }

      // Get station data with their progress
      const stationData = stations
        .filter(station => station.station_order >= 0 && station.station_order <= 3)
        .map(station => {
          const stationItems = testItems.filter(item => item.station_id === station.id);
          const stationProgress = stationItems.map(item =>
            systemProgress.find(p => p.station_id === station.id && p.item_id === item.id)
          ).filter(Boolean);

          const stationStartTimes = stationProgress.map(p => p?.started_at).filter(Boolean);
          const stationEndTimes = stationProgress.map(p => p?.completed_at).filter(Boolean);
          
          const completedItems = stationProgress.filter(p => p?.status === 'Done').length;
          const totalItems = stationItems.length;
          const stationProgressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

          return {
            id: station.id,
            name: station.station_name,
            start_time: stationStartTimes.length > 0 ? stationStartTimes.sort()[0] : undefined,
            end_time: stationEndTimes.length > 0 ? stationEndTimes.sort().reverse()[0] : undefined,
            progress: stationProgressPercent,
            status: stationProgressPercent === 100 ? 'Done' : stationProgressPercent > 0 ? 'On-going' : 'Not Start'
          };
        });

      return {
        id: system.id,
        system_name: system.system_name,
        assigned_engineer: system.assigned_engineer,
        status: system.status,
        overall_progress: system.overall_progress,
        start_time: systemStartTime,
        end_time: systemEndTime,
        duration_hours: durationHours,
        stations: stationData
      };
    });
  }, [systems, stations, testItems, progress]);

  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    const allTimes = timelineData.flatMap(machine => [
      machine.start_time,
      machine.end_time
    ]).filter(Boolean);

    if (allTimes.length === 0) {
      return { start: new Date(), end: new Date() };
    }

    const sortedTimes = allTimes.sort();
    return {
      start: new Date(sortedTimes[0]),
      end: new Date(sortedTimes[sortedTimes.length - 1])
    };
  }, [timelineData]);

  return {
    timelineData,
    timelineBounds,
    isLoading
  };
}