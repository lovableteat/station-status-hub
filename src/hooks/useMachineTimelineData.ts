import { useMemo, useState } from "react";
import { useUnifiedData } from "./useUnifiedData";

export interface MachineTimelineData {
  id: string;
  system_name: string;
  overall_progress: number;
  // Planned times (for timeline background)
  planned_start_time?: string;
  planned_end_time?: string;
  // Actual times (for progress calculation)
  actual_start_time?: string;
  actual_end_time?: string;
  status: string;
  current_station?: string;
}

export function useMachineTimelineData() {
  const { systems, progress, isLoading } = useUnifiedData();
  const [timeOffset, setTimeOffset] = useState(0);

  const timelineData = useMemo(() => {
    if (!systems.length) {
      return [];
    }

    return systems.map(system => {
      // Get all progress records for this system
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // Calculate planned times from test_progress data (existing logic)
      const allStartTimes = systemProgress.map(p => p.started_at).filter(Boolean);
      const allEndTimes = systemProgress.map(p => p.completed_at).filter(Boolean);
      
      const plannedStartTime = allStartTimes.length > 0 ? allStartTimes.sort()[0] : undefined;
      const plannedEndTime = allEndTimes.length > 0 ? allEndTimes.sort().reverse()[0] : undefined;

      return {
        id: system.id,
        system_name: system.system_name,
        overall_progress: system.overall_progress,
        // Planned times (user-set expected completion times from test_progress)
        planned_start_time: plannedStartTime,
        planned_end_time: plannedEndTime,
        // Actual times (system-calculated actual start/completion from test_systems)
        actual_start_time: system.actual_started_at,
        actual_end_time: system.actual_completed_at,
        status: system.status,
        current_station: system.current_station
      };
    });
  }, [systems, progress]);

  // Calculate timeline bounds with navigation offset
  const timelineBounds = useMemo(() => {
    const allTimes = timelineData.flatMap(machine => [
      machine.planned_start_time,
      machine.planned_end_time,
      machine.actual_start_time,
      machine.actual_end_time
    ]).filter(Boolean);

    if (allTimes.length === 0) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 7 + (timeOffset * 7));
      const end = new Date(now);
      end.setDate(now.getDate() + 7 + (timeOffset * 7));
      return { start, end };
    }

    const sortedTimes = allTimes.sort();
    const baseStartDate = new Date(sortedTimes[0]);
    const baseEndDate = new Date(sortedTimes[sortedTimes.length - 1]);
    
    // Apply time offset (weeks)
    const startDate = new Date(baseStartDate);
    startDate.setDate(baseStartDate.getDate() - 1 + (timeOffset * 7));
    const endDate = new Date(baseEndDate);
    endDate.setDate(baseEndDate.getDate() + 1 + (timeOffset * 7));
    
    return { start: startDate, end: endDate };
  }, [timelineData, timeOffset]);

  const navigateTimeline = (direction: 'prev' | 'next') => {
    setTimeOffset(prev => direction === 'next' ? prev + 1 : prev - 1);
  };

  return {
    timelineData,
    timelineBounds,
    isLoading,
    navigateTimeline
  };
}