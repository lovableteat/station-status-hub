
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
      
      // Get all test progress records with their station information
      let query = supabase
        .from('test_progress')
        .select(`
          *,
          test_systems!inner(
            id,
            system_name,
            actual_started_at,
            actual_completed_at
          ),
          test_flow_stations!inner(
            id,
            station_name,
            station_order
          )
        `);

      // Apply date filters based on test_systems timestamps
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
        console.error('Error loading test progress records:', error);
        toast({
          title: "載入失敗",
          description: "無法載入測試進度記錄",
          variant: "destructive"
        });
        return;
      }

      if (data) {
        // Group by system and station to calculate start and end times
        const stationTimeMap = new Map<string, {
          system_id: string;
          station_id: string;
          station_name: string;
          start_time: string | null;
          end_time: string | null;
          records: any[];
        }>();

        data.forEach(record => {
          const key = `${record.system_id}-${record.station_id}`;
          if (!stationTimeMap.has(key)) {
            stationTimeMap.set(key, {
              system_id: record.system_id,
              station_id: record.station_id,
              station_name: record.test_flow_stations.station_name,
              start_time: null,
              end_time: null,
              records: []
            });
          }
          stationTimeMap.get(key)!.records.push(record);
        });

        // Calculate start and end times for each station
        const processedRecords: StationTimeRecord[] = [];
        stationTimeMap.forEach((stationData, key) => {
          const records = stationData.records;
          const startTimes = records
            .filter(r => r.started_at)
            .map(r => new Date(r.started_at))
            .sort((a, b) => a.getTime() - b.getTime());
          
          const endTimes = records
            .filter(r => r.completed_at && r.status === 'Done')
            .map(r => new Date(r.completed_at))
            .sort((a, b) => b.getTime() - a.getTime());

          const startTime = startTimes.length > 0 ? startTimes[0].toISOString() : null;
          const endTime = endTimes.length > 0 ? endTimes[0].toISOString() : null;
          
          let totalHours = null;
          if (startTime && endTime) {
            const start = new Date(startTime);
            const end = new Date(endTime);
            totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // Convert to hours
          }

          processedRecords.push({
            id: key,
            system_id: stationData.system_id,
            station_id: stationData.station_id,
            station_name: stationData.station_name,
            start_time: startTime,
            end_time: endTime,
            total_hours: totalHours
          });
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
    // Only process records with complete time data
    const validRecords = records.filter(record => 
      record.start_time && record.end_time && record.total_hours !== null
    );

    // Group by station name and calculate average
    const stationGroups: { [key: string]: number[] } = {};
    
    validRecords.forEach(record => {
      if (!stationGroups[record.station_name]) {
        stationGroups[record.station_name] = [];
      }
      stationGroups[record.station_name].push(record.total_hours!);
    });

    // Calculate averages for each station
    const averages: StationAverageTime[] = Object.entries(stationGroups).map(([stationName, hours]) => ({
      station_name: stationName,
      average_hours: hours.reduce((sum, h) => sum + h, 0) / hours.length,
      total_records: hours.length
    }));

    // Sort by station order - 包含Station 4 的排序邏輯
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
