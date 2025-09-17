
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
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // Use the optimized station status hook
  const stationStatuses = useStationStatus(systems, stations, progress);

  // Incremental update functions for specific tables
  const updateSystems = useCallback(async (payload: any) => {
    setIsUpdating(true);
    try {
      if (payload.eventType === 'DELETE') {
        setSystems(prev => prev.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
        setSystems(prev => [...prev, payload.new]);
      } else if (payload.eventType === 'UPDATE') {
        setSystems(prev => prev.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ));
      }
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, []);

  const updateProgressData = useCallback(async (payload: any) => {
    setIsUpdating(true);
    try {
      if (payload.eventType === 'DELETE') {
        setProgress(prev => prev.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
        setProgress(prev => [...prev, payload.new]);
      } else if (payload.eventType === 'UPDATE') {
        setProgress(prev => prev.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ));
      }
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, []);

  const updateStations = useCallback(async (payload: any) => {
    setIsUpdating(true);
    try {
      if (payload.eventType === 'DELETE') {
        setStations(prev => prev.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
        setStations(prev => [...prev, payload.new].sort((a, b) => a.station_order - b.station_order));
      } else if (payload.eventType === 'UPDATE') {
        setStations(prev => prev.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ).sort((a, b) => a.station_order - b.station_order));
      }
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, []);

  const updateTestItems = useCallback(async (payload: any) => {
    setIsUpdating(true);
    try {
      if (payload.eventType === 'DELETE') {
        setTestItems(prev => prev.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
        setTestItems(prev => [...prev, payload.new].sort((a, b) => a.item_order - b.item_order));
      } else if (payload.eventType === 'UPDATE') {
        setTestItems(prev => prev.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ).sort((a, b) => a.item_order - b.item_order));
      }
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, []);

  const updateStationContents = useCallback(async (payload: any) => {
    setIsUpdating(true);
    try {
      if (payload.eventType === 'DELETE') {
        setStationContents(prev => prev.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'INSERT') {
        setStationContents(prev => [...prev, payload.new].sort((a, b) => a.order_num - b.order_num));
      } else if (payload.eventType === 'UPDATE') {
        setStationContents(prev => prev.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ).sort((a, b) => a.order_num - b.order_num));
      }
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, []);

  // Debounced reload function as fallback for complex updates
  const debouncedReload = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          loadAllData();
        }, 300);
      };
    })(),
    []
  );

  const loadAllData = useCallback(async (systemIdToOptimize?: string) => {
    setIsLoading(true);
    try {
      
      // 批量載入資料，減少資料庫查詢次數
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

    } catch (error) {
      console.error('載入統一資料錯誤:', error);
      toast({
        title: "載入失敗",
        description: "無法載入系統資料",
        variant: "destructive"
      });
    } finally {
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

      let result;
      if (existingProgress) {
        result = await supabase
          .from('test_progress')
          .update({
            ...updates,
            assigned_to: user?.username || updates.assigned_to || 'system'
          })
          .eq('id', existingProgress.id);
      } else {
        result = await supabase
          .from('test_progress')
          .insert({
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            assigned_to: user?.username || 'system',
            ...updates
          });
      }

      if (result.error) {
        throw result.error;
      }

      // 不立即重新載入整個資料集，讓實時更新處理
      return true;
    } catch (error) {
      console.error('進度更新錯誤:', error);
      return false;
    }
  }, [progress, user]);

  useEffect(() => {
    loadAllData();
    
    // 設置實時更新，減少日誌輸出
    const channel = supabase
      .channel('unified_data_changes')
      // 核心表格使用增量更新
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_systems' }, updateSystems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_progress' }, updateProgressData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_flow_stations' }, updateStations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_flow_items' }, updateTestItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_contents' }, updateStationContents)
      // 其他表格使用防抖重載
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_time_records' }, debouncedReload)
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
    isUpdating,
    refetch: loadAllData,
    updateProgress
  };
}
