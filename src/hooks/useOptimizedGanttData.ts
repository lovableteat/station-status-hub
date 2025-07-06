import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GanttSystemData {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface OptimizedGanttData {
  systems: GanttSystemData[];
  isLoading: boolean;
  error: string | null;
}

export function useOptimizedGanttData(): OptimizedGanttData {
  const [systems, setSystems] = useState<GanttSystemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGanttData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 優化查詢：一次獲取所有需要的數據
      const { data: systemsData, error: systemsError } = await supabase
        .from('test_systems')
        .select(`
          id,
          system_name,
          assigned_engineer,
          current_station,
          overall_progress,
          status
        `)
        .order('system_name');

      if (systemsError) throw systemsError;

      // 獲取所有系統的進度數據
      const systemIds = systemsData?.map(s => s.id) || [];
      const { data: progressData, error: progressError } = await supabase
        .from('test_progress')
        .select('system_id, started_at, completed_at, status')
        .in('system_id', systemIds);

      if (progressError) throw progressError;

      // 計算每個系統的開始和結束時間
      const ganttSystems: GanttSystemData[] = systemsData?.map(system => {
        const systemProgress = progressData?.filter(p => p.system_id === system.id) || [];
        
        // 獲取最早開始時間和最晚結束時間
        const startTimes = systemProgress
          .map(p => p.started_at)
          .filter(Boolean)
          .map(t => new Date(t!))
          .sort((a, b) => a.getTime() - b.getTime());

        const endTimes = systemProgress
          .map(p => p.completed_at)
          .filter(Boolean)
          .map(t => new Date(t!))
          .sort((a, b) => b.getTime() - a.getTime());

        const startDate = startTimes.length > 0 ? startTimes[0] : null;
        const endDate = endTimes.length > 0 ? endTimes[0] : null;

        return {
          ...system,
          startDate,
          endDate
        };
      }) || [];

      setSystems(ganttSystems);
    } catch (err) {
      console.error('Error loading Gantt data:', err);
      setError(err instanceof Error ? err.message : '載入甘特圖數據失敗');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGanttData();

    // 設置實時更新，但優化頻率
    const channel = supabase
      .channel('gantt-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_progress'
        },
        () => {
          // 使用 debounce 避免過於頻繁的更新
          setTimeout(loadGanttData, 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadGanttData]);

  return useMemo(() => ({
    systems,
    isLoading,
    error
  }), [systems, isLoading, error]);
}