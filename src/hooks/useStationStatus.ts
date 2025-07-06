import { useMemo } from 'react';

interface UnifiedSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
}

interface UnifiedStation {
  id: string;
  station_name: string;
  station_order: number;
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
  current_system?: string;
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
    if (systems.length === 0 || stations.length === 0) return [];
    
    return stations.map(station => {
      // Find systems currently at this station
      const systemsAtStation = systems.filter(s => s.current_station === station.station_name);
      
      // Calculate completion rate for this station across all systems
      const stationProgress = systems.map(system => {
        const systemStationProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        if (systemStationProgress.length === 0) return 0;
        
        const completedItems = systemStationProgress.filter(p => p.status === 'Done').length;
        return (completedItems / systemStationProgress.length) * 100;
      });

      const averageProgress = stationProgress.length > 0 
        ? stationProgress.reduce((sum, prog) => sum + prog, 0) / stationProgress.length 
        : 0;

      // Determine station status
      let status: "idle" | "working" | "warning" | "error" | "complete" = "idle";
      if (systemsAtStation.length > 0) {
        if (averageProgress < 50) status = "warning";
        else if (averageProgress < 100) status = "working";
        else status = "complete";
      }

      const completedSystems = systems.filter(s => {
        const systemProgress = progress.filter(p => 
          p.system_id === s.id && p.station_id === station.id && p.status === 'Done'
        );
        const totalItems = progress.filter(p => 
          p.system_id === s.id && p.station_id === station.id
        ).length;
        return totalItems > 0 && systemProgress.length === totalItems;
      }).length;

      const ongoingSystems = systemsAtStation.length;
      const efficiency = Math.round(averageProgress);

      // Calculate detailed progress for each system at this station
      const systemProgress = systemsAtStation.map(system => {
        const systemStationProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        const completedItems = systemStationProgress.filter(p => p.status === 'Done').length;
        const totalItems = systemStationProgress.length;
        const systemProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
        
        return {
          system,
          progress: Math.round(systemProgress),
          status: system.status,
          test_items_completed: completedItems,
          test_items_total: totalItems
        };
      });

      return {
        id: station.id,
        name: station.station_name,
        status,
        current_system: systemsAtStation[0]?.system_name,
        current_systems: systemsAtStation,
        efficiency: Math.max(0, Math.min(100, efficiency)),
        last_update: new Date().toISOString(),
        total_systems: systems.length,
        completed_systems: completedSystems,
        ongoing_systems: ongoingSystems,
        system_progress: systemProgress
      };
    });
  }, [systems, stations, progress]);
}