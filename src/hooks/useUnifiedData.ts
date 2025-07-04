import { useState, useEffect } from "react";
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
  current_system?: string;
  efficiency: number;
  last_update: string;
  total_systems: number;
  completed_systems: number;
  ongoing_systems: number;
}

export function useUnifiedData() {
  const [systems, setSystems] = useState<UnifiedSystem[]>([]);
  const [stations, setStations] = useState<UnifiedStation[]>([]);
  const [testItems, setTestItems] = useState<UnifiedTestItem[]>([]);
  const [progress, setProgress] = useState<UnifiedProgress[]>([]);
  const [stationStatuses, setStationStatuses] = useState<StationStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadAllData = async () => {
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

      // Calculate station statuses based on real data
      if (systemsRes.data && stationsRes.data && progressRes.data) {
        const calculatedStatuses = calculateStationStatuses(
          systemsRes.data,
          stationsRes.data,
          progressRes.data
        );
        setStationStatuses(calculatedStatuses);
      }

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
  };

  const calculateStationStatuses = (
    systems: UnifiedSystem[],
    stations: UnifiedStation[],
    progress: UnifiedProgress[]
  ): StationStatus[] => {
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

      return {
        id: station.id,
        name: station.station_name,
        status,
        current_system: systemsAtStation[0]?.system_name,
        efficiency: Math.round(averageProgress),
        last_update: new Date().toISOString(),
        total_systems: systems.length,
        completed_systems: completedSystems,
        ongoing_systems: ongoingSystems
      };
    });
  };

  const updateProgress = async (
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

      // Reload data to get fresh calculations
      await loadAllData();
      
      return true;
    } catch (error) {
      console.error('Error updating progress:', error);
      return false;
    }
  };

  useEffect(() => {
    loadAllData();
    
    // Set up real-time updates
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
          loadAllData(); // Reload when progress changes
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
          loadAllData(); // Reload when systems change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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