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

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      
      // Load all data in parallel
      const [systemsRes, stationsRes, itemsRes, progressRes, settingsRes, dailyStatsRes, timeAnalyticsRes] = await Promise.all([
        supabase.from('test_systems').select('*').order('system_name'),
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('test_progress').select('*'),
        supabase.from('system_settings').select('*').eq('category', 'work_time').maybeSingle(),
        supabase.from('daily_production_stats').select('*').order('date', { ascending: false }).limit(7),
        supabase.from('station_time_analytics').select('*').order('created_at', { ascending: false }).limit(100)
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
          progressRes.data,
          settingsRes.data?.settings,
          dailyStatsRes.data || [],
          timeAnalyticsRes.data || []
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
    progress: UnifiedProgress[],
    settings?: any,
    dailyStats?: any[],
    timeAnalytics?: any[]
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

      // Calculate efficiency based on selected method
      let efficiency = Math.round(averageProgress); // Default: completion efficiency
      
      const efficiencyMethod = settings?.efficiency_calculation_method || 'completion';
      
      switch (efficiencyMethod) {
        case 'time':
          // Time efficiency: estimated vs actual time
          const stationTimeData = timeAnalytics?.filter(t => t.station_id === station.id) || [];
          if (stationTimeData.length > 0) {
            const avgTimeEfficiency = stationTimeData.reduce((sum, t) => {
              const timeEff = t.estimated_hours > 0 ? Math.min((t.estimated_hours / t.actual_hours) * 100, 100) : 0;
              return sum + timeEff;
            }, 0) / stationTimeData.length;
            efficiency = Math.round(avgTimeEfficiency);
          }
          break;
          
        case 'capacity':
          // Capacity efficiency: daily completed vs target
          const latestStats = dailyStats?.[0];
          if (latestStats && latestStats.target_systems > 0) {
            efficiency = Math.round((latestStats.completed_systems / latestStats.target_systems) * 100);
          }
          break;
          
        case 'runtime':
          // Runtime efficiency: working time vs total time
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
          const currentTime = now.getTime() - todayStart.getTime();
          const workingHours = settings?.daily_work_hours || 8;
          const totalWorkTime = workingHours * 60 * 60 * 1000; // in milliseconds
          
          if (systemsAtStation.length > 0 && currentTime > 0) {
            // Assume station is "working" if it has active systems
            const runtimeEfficiency = Math.min((currentTime / totalWorkTime) * 100, 100);
            efficiency = Math.round(runtimeEfficiency);
          } else {
            efficiency = 0; // Idle stations have 0% runtime efficiency
          }
          break;
          
        default:
          // Completion efficiency (default)
          efficiency = Math.round(averageProgress);
      }

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
        current_system: systemsAtStation[0]?.system_name, // 保留向後兼容性
        current_systems: systemsAtStation, // 所有在該站點的系統
        efficiency: Math.max(0, Math.min(100, efficiency)), // Ensure 0-100 range
        last_update: new Date().toISOString(),
        total_systems: systems.length,
        completed_systems: completedSystems,
        ongoing_systems: ongoingSystems,
        system_progress: systemProgress
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
          console.log('Test progress updated, reloading data...');
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
          console.log('Test systems updated, reloading data...');
          loadAllData(); // Reload when systems change
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_flow_items'
        },
        () => {
          console.log('Test flow items updated, reloading data...');
          loadAllData(); // Reload when test items change
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_flow_stations'
        },
        () => {
          console.log('Test flow stations updated, reloading data...');
          loadAllData(); // Reload when stations change
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