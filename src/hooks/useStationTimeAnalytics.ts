
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StationTimeRecord {
  id: string;
  system_id: string;
  station_id: string;
  station_name: string;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
}

interface StationAverageTime {
  station_name: string;
  average_hours: number;
  total_records: number;
  total_hours_sum: number;
  calculation_details: string;
}

interface SystemStationTime {
  system_id: string;
  system_name: string;
  station_id: string;
  station_name: string;
  total_duration: number;
}

interface DateFilter {
  start_date?: string;
  end_date?: string;
  filter_type: 'estimated_start' | 'estimated_end' | 'actual_completed';
}

function calculateAverageTimesFromSystems(systemData: SystemStationTime[]) {
  const stationGroups: Record<string, number[]> = {};

  systemData.forEach(data => {
    if (data.total_duration <= 0) return;
    if (!stationGroups[data.station_name]) stationGroups[data.station_name] = [];
    stationGroups[data.station_name].push(data.total_duration);
  });

  const averages: StationAverageTime[] = Object.entries(stationGroups).map(([stationName, durations]) => {
    const totalHours = durations.reduce((sum, hours) => sum + hours, 0);
    const averageHours = totalHours / durations.length;

    return {
      station_name: stationName,
      average_hours: Number(averageHours.toFixed(2)),
      total_records: durations.length,
      total_hours_sum: Number(totalHours.toFixed(2)),
      calculation_details: `${totalHours.toFixed(2)} 小時 ÷ ${durations.length} 台機台 (各測項時間加總)`
    };
  });

  const getStationOrder = (name: string) => {
    const match = name.match(/Station\s*(\d+)/i);
    return match ? parseInt(match[1]) : 999;
  };

  return averages.sort((a, b) => getStationOrder(a.station_name) - getStationOrder(b.station_name));
}

export function useStationTimeAnalytics() {
  const [stationTimeRecords, setStationTimeRecords] = useState<StationTimeRecord[]>([]);
  const [averageTimes, setAverageTimes] = useState<StationAverageTime[]>([]);
  const [systemStationTimes, setSystemStationTimes] = useState<SystemStationTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadStationTimeRecords = useCallback(async (dateFilter?: DateFilter) => {
    try {
      setIsLoading(true);
      
      // 從GB300測試追蹤頁面計算各機台在不同站別的總時長
      // 首先取得所有符合條件的系統及其測試進度
      let systemQuery = supabase
        .from('test_systems')
        .select(`
          id,
          system_name,
          status,
          actual_started_at,
          actual_completed_at,
          exclude_from_dashboard
        `)
        .eq('exclude_from_dashboard', false)
        .neq('status', 'Not Start'); // 排除還未開始的機台

      // Apply date filters to systems
      if (dateFilter?.start_date && dateFilter?.end_date) {
        let timeColumn = 'actual_completed_at';
        
        if (dateFilter.filter_type === 'estimated_start') {
          timeColumn = 'actual_started_at';
        } else if (dateFilter.filter_type === 'estimated_end') {
          timeColumn = 'actual_completed_at';
        }

        // 只在 actual_completed_at 不為 null 的情況下篩選
        if (timeColumn === 'actual_completed_at') {
          systemQuery = systemQuery
            .not('actual_completed_at', 'is', null)
            .gte(timeColumn, dateFilter.start_date)
            .lte(timeColumn, dateFilter.end_date);
        } else {
          systemQuery = systemQuery
            .not('actual_started_at', 'is', null)
            .gte(timeColumn, dateFilter.start_date)
            .lte(timeColumn, dateFilter.end_date);
        }
      }

      // 系統、站點與排除設定彼此獨立，平行載入可省下多次網路往返。
      const [systemResult, stationResult, exclusionResult] = await Promise.all([
        systemQuery,
        supabase
          .from('test_flow_stations')
          .select('id,station_name,station_order')
          .order('station_order'),
        supabase
          .from('dashboard_item_exclusions')
          .select('system_id,item_id')
      ]);

      const { data: systems, error: systemError } = systemResult;
      
      if (systemError) {
        console.error('Error loading systems:', systemError);
        toast({
          title: "載入失敗",
          description: "無法載入系統資料",
          variant: "destructive"
        });
        return;
      }

      if (!systems || systems.length === 0) {
        setSystemStationTimes([]);
        setAverageTimes([]);
        return;
      }

      const { data: stations, error: stationError } = stationResult;

      if (stationError) {
        console.error('Error loading stations:', stationError);
        return;
      }

      const { data: exclusions, error: exclusionError } = exclusionResult;

      if (exclusionError) {
        console.error('Error loading exclusions:', exclusionError);
      }
      const excludedMap = new Map<string, Set<string>>();
      (exclusions || []).forEach(e => {
        if (!excludedMap.has(e.system_id)) excludedMap.set(e.system_id, new Set());
        excludedMap.get(e.system_id)!.add(e.item_id);
      });

      // 批次取得所有機台的完成進度，並分頁避開 Supabase 單次回傳筆數上限。
      const progressRecords: Array<{
        system_id: string;
        station_id: string;
        item_id: string;
        started_at: string;
        completed_at: string;
      }> = [];
      const systemIds = systems.map(system => system.id);
      const pageSize = 1000;
      let page = 0;

      while (true) {
        const { data: progressPage, error: progressError } = await supabase
          .from('test_progress')
          .select('system_id,station_id,item_id,started_at,completed_at')
          .in('system_id', systemIds)
          .eq('status', 'Done')
          .not('started_at', 'is', null)
          .not('completed_at', 'is', null)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (progressError) {
          console.error('Error loading progress:', progressError);
          return;
        }

        progressRecords.push(...(progressPage || []));
        if (!progressPage || progressPage.length < pageSize) break;
        page += 1;
      }

      const durationBySystemStation = new Map<string, number>();

      progressRecords.forEach(item => {
        if (excludedMap.get(item.system_id)?.has(item.item_id)) return;

        const startTime = new Date(item.started_at!).getTime();
        const endTime = new Date(item.completed_at!).getTime();
        const itemDuration = (endTime - startTime) / (1000 * 60 * 60);
        if (itemDuration <= 0) return;

        const key = `${item.system_id}:${item.station_id}`;
        durationBySystemStation.set(key, (durationBySystemStation.get(key) || 0) + itemDuration);
      });

      // 維持原本的機台、站點排列與統計規則，只改成讀取已彙整的結果。
      const systemStationData: SystemStationTime[] = [];
      systems.forEach(system => {
        (stations || []).forEach(station => {
          const totalDuration = durationBySystemStation.get(`${system.id}:${station.id}`) || 0;
          if (totalDuration <= 0) return;

          systemStationData.push({
            system_id: system.id,
            system_name: system.system_name,
            station_id: station.id,
            station_name: station.station_name,
            total_duration: totalDuration
          });
        });
      });

      setSystemStationTimes(systemStationData);
      setAverageTimes(calculateAverageTimesFromSystems(systemStationData));
      
    } catch (error) {
      console.error('Error in loadStationTimeRecords:', error);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStationTimeRecords();
  }, [loadStationTimeRecords]);

  return {
    stationTimeRecords,
    averageTimes,
    systemStationTimes,
    isLoading,
    loadStationTimeRecords
  };
}
