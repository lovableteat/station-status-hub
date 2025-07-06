import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UnifiedSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
}

interface UnifiedStation {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

interface UnifiedTestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
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
  current_system?: string; // 保留向後兼容性
  current_systems: UnifiedSystem[]; // 新增：所有在該站點的系統
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

export function useUnifiedData() {
  const [systems, setSystems] = useState<UnifiedSystem[]>([]);
  const [stations, setStations] = useState<UnifiedStation[]>([]);
  const [testItems, setTestItems] = useState<UnifiedTestItem[]>([]);
  const [progress, setProgress] = useState<UnifiedProgress[]>([]);
  const [stationStatuses, setStationStatuses] = useState<StationStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Memoize the expensive station status calculation
  const memoizedStationStatuses = useMemo(() => {
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

  // Debounced reload function to prevent excessive API calls
  const debouncedReload = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          loadAllData();
        }, 500); // 500ms debounce
      };
    })(),
    []
  );

  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Load all data in parallel
      const [systemsRes, stationsRes, itemsRes, progressRes] = await Promise.all([
        supabase.from('test_systems').select('*').order('system_name'),
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('test_progress').select('*')
      ]);

      if (systemsRes.data) setSystems(systemsRes.data);
      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setTestItems(itemsRes.data);
      if (progressRes.data) setProgress(progressRes.data);

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading unified data:', error);
      toast({
        title: "載入失敗",
        description: "無法載入系統資料",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  }, [toast]);

  // Set stationStatuses to use memoized version
  useEffect(() => {
    setStationStatuses(memoizedStationStatuses);
  }, [memoizedStationStatuses]);

  const updateProgress = useCallback(async (
    systemId: string,
    stationId: string,
    itemId: string,
    updates: Partial<UnifiedProgress>
  ) => {
    try {
      const existingProgress = progress.find(p => 
        p.system_id === systemId && 
        p.station_id === stationId && 
        p.item_id === itemId
      );

      if (existingProgress) {
        await supabase
          .from('test_progress')
          .update(updates)
          .eq('id', existingProgress.id);
      } else {
        await supabase
          .from('test_progress')
          .insert({
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            ...updates
          });
      }

      // Use debounced reload to prevent excessive API calls
      debouncedReload();
      
      return true;
    } catch (error) {
      console.error('Error updating progress:', error);
      return false;
    }
  }, [progress, debouncedReload]);

  useEffect(() => {
    loadAllData();
    
    // Set up real-time updates with debouncing
    const channel = supabase
      .channel('unified-data-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_progress'
        },
        () => {
          console.log('Test progress updated, reloading data...');
          debouncedReload(); // Use debounced reload
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_systems'
        },
        () => {
          console.log('Test systems updated, reloading data...');
          debouncedReload(); // Use debounced reload
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllData, debouncedReload]);

  return {
    systems,
    stations,
    testItems,
    progress,
    stationStatuses,
    isLoading,
    loadAllData,
    updateProgress
  };
}