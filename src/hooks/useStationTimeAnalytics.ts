
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
      
      let query = supabase
        .from('station_time_records')
        .select(`
          *,
          test_systems!inner(
            id,
            system_name,
            actual_started_at,
            actual_completed_at
          )
        `);

      // 如果有日期篩選，根據測試系統的時間欄位進行篩選
      if (dateFilter?.start_date || dateFilter?.end_date) {
        let timeColumn = 'actual_completed_at';
        if (dateFilter.filter_type === 'estimated_start') {
          timeColumn = 'actual_started_at';
        } else if (dateFilter.filter_type === 'estimated_end') {
          timeColumn = 'actual_completed_at';
        }

        if (dateFilter.start_date) {
          query = query.gte(`test_systems.${timeColumn}`, dateFilter.start_date);
        }
        if (dateFilter.end_date) {
          query = query.lte(`test_systems.${timeColumn}`, dateFilter.end_date);
        }
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading station time records:', error);
        toast({
          title: "載入失敗",
          description: "無法載入站別時間記錄",
          variant: "destructive"
        });
        return;
      }

      if (data) {
        setStationTimeRecords(data);
        calculateAverageTimes(data);
      }
    } catch (error) {
      console.error('Error in loadStationTimeRecords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAverageTimes = (records: StationTimeRecord[]) => {
    // 只處理有完整時間記錄的資料
    const validRecords = records.filter(record => 
      record.start_time && record.end_time && record.total_hours !== null
    );

    // 按站別分組計算平均時間
    const stationGroups: { [key: string]: number[] } = {};
    
    validRecords.forEach(record => {
      if (!stationGroups[record.station_name]) {
        stationGroups[record.station_name] = [];
      }
      stationGroups[record.station_name].push(record.total_hours!);
    });

    // 計算每個站別的平均時間
    const averages: StationAverageTime[] = Object.entries(stationGroups).map(([stationName, hours]) => ({
      station_name: stationName,
      average_hours: hours.reduce((sum, h) => sum + h, 0) / hours.length,
      total_records: hours.length
    }));

    // 按站別順序排序 (Station 0, Station 1 等)
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
