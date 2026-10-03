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

export function calculateStationStatuses(
  systems: UnifiedSystem[],
  stations: UnifiedStation[],
  progress: UnifiedProgress[]
): StationStatus[] {
    if (systems.length === 0 || stations.length === 0) return [];
    
    // Build the indexes once per snapshot instead of rescanning every progress
    // row for every station/system pair. Nested maps avoid composite-key collisions.
    const counts = new Map<string, Map<string, { total: number; done: number }>>();
    for (const row of progress) {
      let stationCounts = counts.get(row.station_id);
      if (!stationCounts) counts.set(row.station_id, stationCounts = new Map());
      let count = stationCounts.get(row.system_id);
      if (!count) stationCounts.set(row.system_id, count = { total: 0, done: 0 });
      count.total += 1;
      if (row.status === 'Done') count.done += 1;
    }
    const currentSystems = new Map<string, UnifiedSystem[]>();
    for (const system of systems) {
      const bucket = currentSystems.get(system.current_station);
      if (bucket) bucket.push(system);
      else currentSystems.set(system.current_station, [system]);
    }

    return stations.map(station => {
      // Find systems currently at this station
      const systemsAtStation = currentSystems.get(station.station_name) ?? [];
      
      // Calculate completion rate for this station - focus on systems currently at this station
      const currentSystemsProgress = systemsAtStation.map(system => {
        const count = counts.get(station.id)?.get(system.id);
        return count ? (count.done / count.total) * 100 : 0;
      });

      // For station efficiency, use the progress of systems currently at this station
      const averageProgress = currentSystemsProgress.length > 0 
        ? currentSystemsProgress.reduce((sum, prog) => sum + prog, 0) / currentSystemsProgress.length 
        : 0;

      // Determine station status
      let status: "idle" | "working" | "warning" | "error" | "complete" = "idle";
      if (systemsAtStation.length > 0) {
        if (averageProgress < 50) status = "warning";
        else if (averageProgress < 100) status = "working";
        else status = "complete";
      }

      const completedSystems = systems.filter(s => {
        const count = counts.get(station.id)?.get(s.id);
        return count !== undefined && count.done === count.total;
      }).length;

      const ongoingSystems = systemsAtStation.length;
      const efficiency = Math.round(averageProgress);

      // Calculate detailed progress for each system at this station
      const systemProgress = systemsAtStation.map(system => {
        const count = counts.get(station.id)?.get(system.id);
        const completedItems = count?.done ?? 0;
        const totalItems = count?.total ?? 0;
        // If all items are done, show 100%, otherwise calculate percentage
        const systemProgressPercent = totalItems > 0 ? 
          (completedItems === totalItems ? 100 : Math.round((completedItems / totalItems) * 100)) : 0;
        
        return {
          system,
          progress: systemProgressPercent,
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
}

export function useStationStatus(
  systems: UnifiedSystem[],
  stations: UnifiedStation[],
  progress: UnifiedProgress[]
): StationStatus[] {
  return useMemo(() => calculateStationStatuses(systems, stations, progress), [systems, stations, progress]);
}
