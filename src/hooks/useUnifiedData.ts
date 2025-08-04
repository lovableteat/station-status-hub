
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";
import { useStationStatus } from "./useStationStatus";

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
  ubuntu_version?: string;
  cuda_version?: string;
  exclude_from_dashboard?: boolean;
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
  assigned_to?: string;
}

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
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
  const { user } = useUser();
  const [systems, setSystems] = useState<UnifiedSystem[]>([]);
  const [stations, setStations] = useState<UnifiedStation[]>([]);
  const [testItems, setTestItems] = useState<UnifiedTestItem[]>([]);
  const [progress, setProgress] = useState<UnifiedProgress[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Use the optimized station status hook
  const stationStatuses = useStationStatus(systems, stations, progress);

  // Debounced reload function to prevent excessive API calls
  const debouncedReload = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          loadAllData();
        }, 300); // 減少延遲時間以更快響應
      };
    })(),
    []
  );

  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Load all data in parallel
      const [systemsRes, stationsRes, itemsRes, progressRes, contentsRes] = await Promise.all([
        supabase.from('test_systems').select('*').order('system_name'),
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('test_progress').select('*'),
        supabase.from('station_contents').select('*').order('order_num')
      ]);

      if (systemsRes.data) setSystems(systemsRes.data);
      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setTestItems(itemsRes.data);
      if (progressRes.data) setProgress(progressRes.data);
      if (contentsRes.data) setStationContents(contentsRes.data);

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
          .update({
            ...updates,
            assigned_to: user?.username || updates.assigned_to || 'system'
          })
          .eq('id', existingProgress.id);
      } else {
        await supabase
          .from('test_progress')
          .insert({
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            assigned_to: user?.username || 'system',
            ...updates
          });
      }

      // 立即重新載入資料以確保UI更新
      await loadAllData();
      
      return true;
    } catch (error) {
      console.error('Error updating progress:', error);
      return false;
    }
  }, [progress, loadAllData, user]);

  useEffect(() => {
    loadAllData();
    
    // Set up real-time updates with immediate refresh for all critical tables
    const channel = supabase
      .channel('unified_data_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_systems' }, () => {
        console.log('test_systems changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_progress' }, () => {
        console.log('test_progress changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_flow_stations' }, () => {
        console.log('test_flow_stations changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_flow_items' }, () => {
        console.log('test_flow_items changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => {
        console.log('issues changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issue_attachments' }, () => {
        console.log('issue_attachments changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_time_records' }, () => {
        console.log('station_time_records changed, reloading...');
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_time_analytics' }, () => {
        console.log('station_time_analytics changed, reloading...');
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllData]);

  return {
    systems,
    stations,
    testItems,
    progress,
    stationContents,
    stationStatuses,
    isLoading,
    refetch: loadAllData,
    updateProgress
  };
}
