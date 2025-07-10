
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StationTimeRecord {
  id: string;
  station_name: string;
  station_order: number;
  system_name: string;
  actual_hours: number;
  estimated_hours: number;
  started_at: string;
  completed_at: string;
  efficiency_ratio: number;
}

interface StationAverageData {
  station_name: string;
  station_order: number;
  average_hours: number;
  estimated_hours: number;
  efficiency_percentage: number;
  record_count: number;
  total_actual_hours: number;
}

export function useStationTimeAnalytics() {
  const [records, setRecords] = useState<StationTimeRecord[]>([]);
  const [averages, setAverages] = useState<StationAverageData[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadStationTimeRecords = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get all test progress records with their station information - 動態載入所有站點
      let query = supabase
        .from('test_progress')
        .select(`
          *,
          test_systems!inner(
            id,
            system_name
          ),
          test_flow_stations!inner(
            id,
            station_name,
            station_order,
            estimated_hours
          )
        `)
        .not('started_at', 'is', null)
        .not('completed_at', 'is', null);

      const { data: progressData, error } = await query;

      if (error) {
        console.error('Error loading progress data:', error);
        toast({
          title: "載入失敗",
          description: "無法載入站點時間分析數據",
          variant: "destructive"
        });
        return;
      }

      // 載入所有站點資訊
      const { data: stationsData, error: stationsError } = await supabase
        .from('test_flow_stations')
        .select('*')
        .order('station_order');

      if (stationsError) {
        console.error('Error loading stations:', stationsError);
      } else {
        setStations(stationsData || []);
      }

      if (!progressData || progressData.length === 0) {
        console.log('No completed progress records found');
        setRecords([]);
        setAverages([]);
        return;
      }

      // Transform data with calculated hours
      const transformedRecords: StationTimeRecord[] = progressData.map(record => {
        const startTime = new Date(record.started_at);
        const endTime = new Date(record.completed_at);
        const actualHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        const estimatedHours = record.test_flow_stations?.estimated_hours || 0;
        const efficiencyRatio = estimatedHours > 0 ? actualHours / estimatedHours : 0;

        return {
          id: record.id,
          station_name: record.test_flow_stations?.station_name || 'Unknown',
          station_order: record.test_flow_stations?.station_order || 999,
          system_name: record.test_systems?.system_name || 'Unknown',
          actual_hours: Math.round(actualHours * 100) / 100,
          estimated_hours: estimatedHours,
          started_at: record.started_at,
          completed_at: record.completed_at,
          efficiency_ratio: Math.round(efficiencyRatio * 100) / 100
        };
      });

      setRecords(transformedRecords);

      // Calculate averages by station
      const stationGroups = transformedRecords.reduce((acc, record) => {
        const key = record.station_name;
        if (!acc[key]) {
          acc[key] = {
            station_name: record.station_name,
            station_order: record.station_order,
            records: [],
            estimated_hours: record.estimated_hours
          };
        }
        acc[key].records.push(record);
        return acc;
      }, {} as Record<string, {
        station_name: string;
        station_order: number;
        records: StationTimeRecord[];
        estimated_hours: number;
      }>);

      const averageData: StationAverageData[] = Object.values(stationGroups).map(group => {
        const totalHours = group.records.reduce((sum, r) => sum + r.actual_hours, 0);
        const averageHours = totalHours / group.records.length;
        const estimatedHours = group.estimated_hours;
        const efficiencyPercentage = estimatedHours > 0 ? (estimatedHours / averageHours) * 100 : 0;

        return {
          station_name: group.station_name,
          station_order: group.station_order,
          average_hours: Math.round(averageHours * 100) / 100,
          estimated_hours: estimatedHours,
          efficiency_percentage: Math.round(efficiencyPercentage),
          record_count: group.records.length,
          total_actual_hours: Math.round(totalHours * 100) / 100
        };
      });

      // Sort by station order - 支援所有站點的排序邏輯
      averageData.sort((a, b) => {
        const getStationOrder = (name: string) => {
          const match = name.match(/Station\s*(\d+)/i);
          return match ? parseInt(match[1]) : 999;
        };
        
        const orderA = getStationOrder(a.station_name);
        const orderB = getStationOrder(b.station_name);
        
        return orderA - orderB;
      });

      setAverages(averageData);

    } catch (error) {
      console.error('Error in loadStationTimeRecords:', error);
      toast({
        title: "載入錯誤",
        description: "載入站點時間分析時發生錯誤",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStationTimeRecords();
  }, [loadStationTimeRecords]);

  return {
    records,
    averages,
    stations,
    isLoading,
    refetch: loadStationTimeRecords
  };
}
