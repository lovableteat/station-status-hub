
import { useState, useEffect } from "react";
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

export function useStationTimeAnalytics() {
  const [stationTimeRecords, setStationTimeRecords] = useState<StationTimeRecord[]>([]);
  const [averageTimes, setAverageTimes] = useState<StationAverageTime[]>([]);
  const [systemStationTimes, setSystemStationTimes] = useState<SystemStationTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadStationTimeRecords = async (dateFilter?: DateFilter) => {
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
      if (dateFilter?.start_date || dateFilter?.end_date) {
        let timeColumn = 'actual_completed_at';
        
        if (dateFilter.filter_type === 'estimated_start') {
          timeColumn = 'actual_started_at';
        } else if (dateFilter.filter_type === 'estimated_end') {
          timeColumn = 'actual_completed_at';
        }

        if (dateFilter.start_date) {
          const startDate = `${dateFilter.start_date}T00:00:00.000Z`;
          systemQuery = systemQuery.gte(timeColumn, startDate);
        }
        if (dateFilter.end_date) {
          const endDate = `${dateFilter.end_date}T23:59:59.999Z`;
          systemQuery = systemQuery.lte(timeColumn, endDate);
        }
      }

      const { data: systems, error: systemError } = await systemQuery;
      
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

      // 取得所有站點資訊
      const { data: stations, error: stationError } = await supabase
        .from('test_flow_stations')
        .select('*')
        .order('station_order');

      if (stationError) {
        console.error('Error loading stations:', stationError);
        return;
      }

      // 計算每個系統在每個站的總時長
      const systemStationData: SystemStationTime[] = [];
      
      for (const system of systems) {
        for (const station of stations || []) {
          // 取得該系統在該站的所有測項進度
          const { data: progress, error: progressError } = await supabase
            .from('test_progress')
            .select('*')
            .eq('system_id', system.id)
            .eq('station_id', station.id)
            .eq('status', 'Done')
            .not('started_at', 'is', null)
            .not('completed_at', 'is', null);

          if (progressError) {
            console.error('Error loading progress:', progressError);
            continue;
          }

          if (progress && progress.length > 0) {
            // 計算該站別下所有測項的實際執行時間加總
            let stationTotalHours = 0;
            
            progress.forEach(item => {
              const startTime = new Date(item.started_at!).getTime();
              const endTime = new Date(item.completed_at!).getTime();
              const itemDuration = (endTime - startTime) / (1000 * 60 * 60);
              
              if (itemDuration > 0) {
                stationTotalHours += itemDuration;
              }
            });
            
            // 只有當站別總時間大於0時才加入統計
            if (stationTotalHours > 0) {
              systemStationData.push({
                system_id: system.id,
                system_name: system.system_name,
                station_id: station.id,
                station_name: station.station_name,
                total_duration: stationTotalHours
              });
            }
          }
        }
      }

      setSystemStationTimes(systemStationData);
      calculateAverageTimesFromSystems(systemStationData);
      
    } catch (error) {
      console.error('Error in loadStationTimeRecords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAverageTimesFromSystems = (systemData: SystemStationTime[]) => {
    // 按站點分組計算平均處理時間
    const stationGroups: { [key: string]: number[] } = {};
    
    systemData.forEach(data => {
      if (data.total_duration > 0) {
        if (!stationGroups[data.station_name]) {
          stationGroups[data.station_name] = [];
        }
        stationGroups[data.station_name].push(data.total_duration);
      }
    });

    // 計算各站的平均處理時間
    const averages: StationAverageTime[] = Object.entries(stationGroups).map(([stationName, durations]) => {
      const totalHours = durations.reduce((sum, h) => sum + h, 0);
      const averageHours = totalHours / durations.length;
      const calculationDetail = `${totalHours.toFixed(2)} 小時 ÷ ${durations.length} 台機台 (各測項時間加總)`;
      
      return {
        station_name: stationName,
        average_hours: Number(averageHours.toFixed(2)),
        total_records: durations.length,
        total_hours_sum: Number(totalHours.toFixed(2)),
        calculation_details: calculationDetail
      };
    });

    // 按站點順序排序
    averages.sort((a, b) => {
      const getStationOrder = (name: string) => {
        const match = name.match(/Station\s*(\d+)/i);
        return match ? parseInt(match[1]) : 999;
      };
      return getStationOrder(a.station_name) - getStationOrder(b.station_name);
    });

    setAverageTimes(averages);
  };

  useEffect(() => {
    loadStationTimeRecords();
  }, []);

  return {
    stationTimeRecords,
    averageTimes,
    systemStationTimes,
    isLoading,
    loadStationTimeRecords
  };
}
