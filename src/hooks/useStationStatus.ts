
import { useMemo } from 'react';

interface UnifiedSystem {
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

interface UnifiedStation {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
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

interface StationStatus {
  id: string;
  name: string;
  status: "idle" | "working" | "warning" | "error" | "complete";
  current_systems: UnifiedSystem[];
  efficiency: number;
  last_update: string;
  total_systems: number;
  completed_systems: number;
  ongoing_systems: number;
  system_progress: Array<{
    system: UnifiedSystem;
    progress: number;
    status: string;
    test_items_completed: number;
    test_items_total: number;
  }>;
}

export function useStationStatus(
  systems: UnifiedSystem[],
  stations: UnifiedStation[], 
  progress: UnifiedProgress[]
): StationStatus[] {
  return useMemo(() => {
    return stations.map(station => {
      // Find systems currently at this station
      const systemsAtStation = systems.filter(system => 
        system.current_station === station.station_name
      );

      // Calculate progress for each system at this station
      const systemProgress = systemsAtStation.map(system => {
        const systemProgressRecords = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        const totalItems = systemProgressRecords.length;
        const completedItems = systemProgressRecords.filter(p => p.status === 'Done').length;
        const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        
        return {
          system,
          progress: progressPercent,
          status: system.status,
          test_items_completed: completedItems,
          test_items_total: totalItems
        };
      });

      // Calculate station metrics
      const totalSystemsProcessed = systems.filter(system => {
        const hasProgressAtStation = progress.some(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        return hasProgressAtStation;
      }).length;

      const completedSystems = systems.filter(system => {
        const stationProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        const totalStationItems = stationProgress.length;
        const completedStationItems = stationProgress.filter(p => p.status === 'Done').length;
        return totalStationItems > 0 && completedStationItems === totalStationItems;
      }).length;

      const ongoingSystems = systemsAtStation.filter(system => 
        system.status === 'On-going'
      ).length;

      // Calculate efficiency based on completion rate
      const efficiency = totalSystemsProcessed > 0 
        ? Math.round((completedSystems / totalSystemsProcessed) * 100)
        : 0;

      // Determine station status
      let status: "idle" | "working" | "warning" | "error" | "complete";
      
      if (systemsAtStation.length === 0) {
        status = "idle";
      } else if (ongoingSystems > 0) {
        const avgProgress = systemProgress.reduce((sum, sp) => sum + sp.progress, 0) / systemProgress.length;
        if (avgProgress >= 80) {
          status = "working";
        } else if (avgProgress >= 50) {
          status = "working";
        } else {
          status = "warning";
        }
      } else {
        status = "complete";
      }

      return {
        id: station.id,
        name: station.station_name,
        status,
        current_systems: systemsAtStation,
        efficiency,
        last_update: new Date().toISOString(),
        total_systems: totalSystemsProcessed,
        completed_systems: completedSystems,
        ongoing_systems: ongoingSystems,
        system_progress: systemProgress
      };
    });
  }, [systems, stations, progress]);
}
