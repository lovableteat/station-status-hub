
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
}

interface DateFilter {
  start_date?: string;
  end_date?: string;
  filter_type: 'estimated_start' | 'estimated_end' | 'actual_completed';
}

export function useStationTimeAnalytics() {
  const [stationTimeRecords, setStationTimeRecords] = useState<StationTimeRecord[]>([]);
  const [averageTimes, setAverageTimes] = useState<StationAverageTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadStationTimeRecords = async (dateFilter?: DateFilter) => {
    try {
      setIsLoading(true);
      
      // 根據每一筆測試資料的實際執行時數，依據工作站進行分類計算平均處理時間
      // 只取已完成的測試進度記錄（status = 'Done' 且有開始時間和完成時間）
      let query = supabase
        .from('test_progress')
        .select(`
          *,
          test_systems!inner(
            id,
            system_name,
            actual_started_at,
            actual_completed_at,
            exclude_from_dashboard
          ),
          test_flow_stations!inner(
            id,
            station_name,
            station_order
          )
        `)
        .eq('test_systems.exclude_from_dashboard', false)
        .eq('status', 'Done')
        .not('started_at', 'is', null)
        .not('completed_at', 'is', null);

      // Apply date filters
      if (dateFilter?.start_date || dateFilter?.end_date) {
        let timeColumn = 'completed_at';
        let tablePrefix = '';
        
        if (dateFilter.filter_type === 'estimated_start') {
          timeColumn = 'actual_started_at';
          tablePrefix = 'test_systems.';
        } else if (dateFilter.filter_type === 'estimated_end') {
          timeColumn = 'actual_completed_at';
          tablePrefix = 'test_systems.';
        } else if (dateFilter.filter_type === 'actual_completed') {
          timeColumn = 'completed_at';
          tablePrefix = '';
        }

        if (dateFilter.start_date) {
          const startDate = `${dateFilter.start_date}T00:00:00.000Z`;
          query = query.gte(`${tablePrefix}${timeColumn}`, startDate);
        }
        if (dateFilter.end_date) {
          const endDate = `${dateFilter.end_date}T23:59:59.999Z`;
          query = query.lte(`${tablePrefix}${timeColumn}`, endDate);
        }
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading test progress records:', error);
        toast({
          title: "載入失敗",
          description: "無法載入測試進度記錄",
          variant: "destructive"
        });
        return;
      }

      if (data) {
        // 計算每個測項的實際耗時
        const processedRecords: StationTimeRecord[] = [];
        
        data.forEach(record => {
          if (record.started_at && record.completed_at) {
            const startTime = new Date(record.started_at);
            const endTime = new Date(record.completed_at);
            const totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
            
            // 排除耗時為0或負數的異常資料
            if (totalHours > 0) {
              processedRecords.push({
                id: `${record.system_id}-${record.station_id}-${record.item_id}`,
                system_id: record.system_id,
                station_id: record.station_id,
                station_name: record.test_flow_stations.station_name,
                start_time: record.started_at,
                end_time: record.completed_at,
                total_hours: totalHours
              });
            }
          }
        });

        setStationTimeRecords(processedRecords);
        calculateAverageTimes(processedRecords);
      }
    } catch (error) {
      console.error('Error in loadStationTimeRecords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAverageTimes = (records: StationTimeRecord[]) => {
    // 將每一站的「實際耗時總和」除以「該站完成測試的樣本數」
    const stationGroups: { [key: string]: number[] } = {};
    
    records.forEach(record => {
      if (record.total_hours && record.total_hours > 0) {
        if (!stationGroups[record.station_name]) {
          stationGroups[record.station_name] = [];
        }
        stationGroups[record.station_name].push(record.total_hours);
      }
    });

    // Calculate averages for each station
    const averages: StationAverageTime[] = Object.entries(stationGroups).map(([stationName, hours]) => {
      const totalHours = hours.reduce((sum, h) => sum + h, 0);
      const averageHours = totalHours / hours.length;
      
      return {
        station_name: stationName,
        average_hours: Number(averageHours.toFixed(2)),
        total_records: hours.length
      };
    });

    // Sort by station order - 動態排序，包含Station 4
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
    isLoading,
    loadStationTimeRecords
  };
}
