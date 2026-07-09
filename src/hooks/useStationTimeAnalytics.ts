import { useCallback, useEffect, useState } from "react";

import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  filter_type: "estimated_start" | "estimated_end" | "actual_completed";
}

function calculateAverageTimesFromSystems(systemData: SystemStationTime[]) {
  const stationGroups: Record<string, number[]> = {};

  systemData.forEach((entry) => {
    if (entry.total_duration <= 0) return;

    if (!stationGroups[entry.station_name]) {
      stationGroups[entry.station_name] = [];
    }

    stationGroups[entry.station_name].push(entry.total_duration);
  });

  const averages: StationAverageTime[] = Object.entries(stationGroups).map(
    ([stationName, durations]) => {
      const totalHours = durations.reduce((sum, hours) => sum + hours, 0);
      const averageHours = totalHours / durations.length;

      return {
        station_name: stationName,
        average_hours: Number(averageHours.toFixed(2)),
        total_records: durations.length,
        total_hours_sum: Number(totalHours.toFixed(2)),
        calculation_details: `${totalHours.toFixed(2)}h / ${durations.length} systems`,
      };
    }
  );

  const getStationOrder = (name: string) => {
    const match = name.match(/Station\s*(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : 999;
  };

  return averages.sort(
    (left, right) => getStationOrder(left.station_name) - getStationOrder(right.station_name)
  );
}

export function useStationTimeAnalytics() {
  const { activeProjectId } = useTestProject();
  const { toast } = useToast();
  const [stationTimeRecords, setStationTimeRecords] = useState<StationTimeRecord[]>([]);
  const [averageTimes, setAverageTimes] = useState<StationAverageTime[]>([]);
  const [systemStationTimes, setSystemStationTimes] = useState<SystemStationTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadStationTimeRecords = useCallback(
    async (dateFilter?: DateFilter) => {
      try {
        setIsLoading(true);

        if (!activeProjectId) {
          setStationTimeRecords([]);
          setAverageTimes([]);
          setSystemStationTimes([]);
          return;
        }

        let systemQuery = supabase
          .from("test_systems")
          .select(
            `
              id,
              system_name,
              status,
              actual_started_at,
              actual_completed_at,
              exclude_from_dashboard
            `
          )
          .eq("project_id", activeProjectId)
          .eq("exclude_from_dashboard", false)
          .neq("status", "Not Start");

        if (dateFilter?.start_date && dateFilter?.end_date) {
          let timeColumn = "actual_completed_at";

          if (dateFilter.filter_type === "estimated_start") {
            timeColumn = "actual_started_at";
          }

          if (timeColumn === "actual_completed_at") {
            systemQuery = systemQuery
              .not("actual_completed_at", "is", null)
              .gte(timeColumn, dateFilter.start_date)
              .lte(timeColumn, dateFilter.end_date);
          } else {
            systemQuery = systemQuery
              .not("actual_started_at", "is", null)
              .gte(timeColumn, dateFilter.start_date)
              .lte(timeColumn, dateFilter.end_date);
          }
        }

        const [systemResult, stationResult, exclusionResult] = await Promise.all([
          systemQuery,
          supabase
            .from("test_flow_stations")
            .select("id, station_name, station_order")
            .eq("project_id", activeProjectId)
            .order("station_order"),
          supabase.from("dashboard_item_exclusions").select("system_id, item_id"),
        ]);

        const { data: systems, error: systemError } = systemResult;
        if (systemError) throw systemError;

        if (!systems || systems.length === 0) {
          setStationTimeRecords([]);
          setAverageTimes([]);
          setSystemStationTimes([]);
          return;
        }

        const { data: stations, error: stationError } = stationResult;
        if (stationError) throw stationError;

        const { data: exclusions, error: exclusionError } = exclusionResult;
        if (exclusionError) {
          console.error("Error loading dashboard exclusions:", exclusionError);
        }

        const excludedMap = new Map<string, Set<string>>();
        (exclusions || []).forEach((entry) => {
          if (!excludedMap.has(entry.system_id)) {
            excludedMap.set(entry.system_id, new Set());
          }

          excludedMap.get(entry.system_id)?.add(entry.item_id);
        });

        const systemIds = systems.map((system) => system.id);
        const progressRecords: Array<{
          system_id: string;
          station_id: string;
          item_id: string;
          started_at: string;
          completed_at: string;
        }> = [];

        const pageSize = 1000;
        let page = 0;

        while (true) {
          const { data: progressPage, error: progressError } = await supabase
            .from("test_progress")
            .select("system_id, station_id, item_id, started_at, completed_at")
            .eq("project_id", activeProjectId)
            .in("system_id", systemIds)
            .eq("status", "Done")
            .not("started_at", "is", null)
            .not("completed_at", "is", null)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (progressError) {
            throw progressError;
          }

          progressRecords.push(...(progressPage || []));

          if (!progressPage || progressPage.length < pageSize) {
            break;
          }

          page += 1;
        }

        const durationBySystemStation = new Map<string, number>();

        progressRecords.forEach((entry) => {
          if (excludedMap.get(entry.system_id)?.has(entry.item_id)) {
            return;
          }

          const startTime = new Date(entry.started_at).getTime();
          const endTime = new Date(entry.completed_at).getTime();
          const itemDuration = (endTime - startTime) / (1000 * 60 * 60);

          if (itemDuration <= 0) {
            return;
          }

          const key = `${entry.system_id}:${entry.station_id}`;
          durationBySystemStation.set(
            key,
            (durationBySystemStation.get(key) || 0) + itemDuration
          );
        });

        const nextSystemStationTimes: SystemStationTime[] = [];

        systems.forEach((system) => {
          (stations || []).forEach((station) => {
            const totalDuration =
              durationBySystemStation.get(`${system.id}:${station.id}`) || 0;

            if (totalDuration <= 0) {
              return;
            }

            nextSystemStationTimes.push({
              system_id: system.id,
              system_name: system.system_name,
              station_id: station.id,
              station_name: station.station_name,
              total_duration: totalDuration,
            });
          });
        });

        setStationTimeRecords([]);
        setSystemStationTimes(nextSystemStationTimes);
        setAverageTimes(calculateAverageTimesFromSystems(nextSystemStationTimes));
      } catch (error) {
        console.error("Error in loadStationTimeRecords:", error);
        toast({
          title: "Analytics load failed",
          description: "Unable to load average station time data.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [activeProjectId, toast]
  );

  useEffect(() => {
    loadStationTimeRecords();
  }, [loadStationTimeRecords]);

  return {
    stationTimeRecords,
    averageTimes,
    systemStationTimes,
    isLoading,
    loadStationTimeRecords,
  };
}
