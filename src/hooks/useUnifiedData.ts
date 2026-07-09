import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { useStationStatus } from "./useStationStatus";

interface UnifiedSystem {
  id: string;
  project_id: string;
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
  project_id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

interface UnifiedTestItem {
  id: string;
  project_id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
}

interface UnifiedProgress {
  id: string;
  project_id: string;
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
  project_id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
}

interface StationStatus {
  id: string;
  name: string;
  status: "idle" | "working" | "warning" | "error" | "complete";
  current_system?: string;
  current_systems: UnifiedSystem[];
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
  const { activeProjectId, isLoadingProjects } = useTestProject();
  const [systems, setSystems] = useState<UnifiedSystem[]>([]);
  const [stations, setStations] = useState<UnifiedStation[]>([]);
  const [testItems, setTestItems] = useState<UnifiedTestItem[]>([]);
  const [progress, setProgress] = useState<UnifiedProgress[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const stationStatuses = useStationStatus(systems, stations, progress);

  const loadAllData = useCallback(async () => {
    if (!activeProjectId) {
      setSystems([]);
      setStations([]);
      setTestItems([]);
      setProgress([]);
      setStationContents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [systemsRes, stationsRes, itemsRes, contentsRes] = await Promise.all([
        supabase
          .from("test_systems")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("system_name"),
        supabase
          .from("test_flow_stations")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("station_order"),
        supabase
          .from("test_flow_items")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("item_order"),
        supabase
          .from("station_contents")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("order_num"),
      ]);

      if (systemsRes.error) throw systemsRes.error;
      if (stationsRes.error) throw stationsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (contentsRes.error) throw contentsRes.error;

      const nextSystems = (systemsRes.data ?? []) as UnifiedSystem[];
      const nextStations = (stationsRes.data ?? []) as UnifiedStation[];
      const nextItems = (itemsRes.data ?? []) as UnifiedTestItem[];
      const nextContents = (contentsRes.data ?? []) as StationContent[];

      setSystems(nextSystems);
      setStations(nextStations);
      setTestItems(nextItems);
      setStationContents(nextContents);

      const systemIds = nextSystems.map((system) => system.id);
      if (systemIds.length === 0) {
        setProgress([]);
      } else {
        const { data: progressData, error: progressError } = await supabase
          .from("test_progress")
          .select("*")
          .eq("project_id", activeProjectId)
          .in("system_id", systemIds);

        if (progressError) {
          throw progressError;
        }

        setProgress((progressData ?? []) as UnifiedProgress[]);
      }
    } catch (error) {
      console.error("Failed to load project-scoped station data:", error);
      toast({
        title: "Load failed",
        description: "Unable to load the selected project data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, toast]);

  const handleProjectScopedRealtime = useCallback(
    (
      payload: any,
      setter: Dispatch<SetStateAction<any[]>>,
      sortFn?: (left: any, right: any) => number
    ) => {
      const recordProjectId = payload.new?.project_id ?? payload.old?.project_id;
      const isCurrentProject = recordProjectId === activeProjectId;

      setIsUpdating(true);

      try {
        setter((previous) => {
          if (payload.eventType === "DELETE") {
            return previous.filter((item) => item.id !== payload.old.id);
          }

          if (!isCurrentProject) {
            return previous;
          }

          if (payload.eventType === "INSERT") {
            const next = [...previous, payload.new];
            return sortFn ? next.sort(sortFn) : next;
          }

          if (payload.eventType === "UPDATE") {
            const next = previous.map((item) =>
              item.id === payload.new.id ? { ...item, ...payload.new } : item
            );
            return sortFn ? next.sort(sortFn) : next;
          }

          return previous;
        });
      } finally {
        setTimeout(() => setIsUpdating(false), 500);
      }
    },
    [activeProjectId]
  );

  const updateSystems = useCallback(
    (payload: any) => {
      handleProjectScopedRealtime(payload, setSystems);
    },
    [handleProjectScopedRealtime]
  );

  const updateStations = useCallback(
    (payload: any) => {
      handleProjectScopedRealtime(
        payload,
        setStations,
        (left, right) => left.station_order - right.station_order
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateTestItems = useCallback(
    (payload: any) => {
      handleProjectScopedRealtime(
        payload,
        setTestItems,
        (left, right) => left.item_order - right.item_order
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateStationContents = useCallback(
    (payload: any) => {
      handleProjectScopedRealtime(
        payload,
        setStationContents,
        (left, right) => left.order_num - right.order_num
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateProgressRecords = useCallback(
    (payload: any) => {
      handleProjectScopedRealtime(payload, setProgress);
    },
    [handleProjectScopedRealtime]
  );

  const updateProgress = useCallback(
    async (
      systemId: string,
      stationId: string,
      itemId: string,
      updates: Partial<UnifiedProgress>
    ) => {
      try {
        if (!activeProjectId) {
          return false;
        }

        const existingProgress = progress.find(
          (item) =>
            item.system_id === systemId &&
            item.station_id === stationId &&
            item.item_id === itemId
        );

        let result;

        if (existingProgress) {
          result = await supabase
            .from("test_progress")
            .update({
              ...updates,
              assigned_to: user?.username || updates.assigned_to || "system",
            })
            .eq("id", existingProgress.id);
        } else {
          result = await supabase.from("test_progress").insert({
            assigned_to: user?.username || "system",
            item_id: itemId,
            project_id: activeProjectId,
            station_id: stationId,
            system_id: systemId,
            ...updates,
          });
        }

        if (result.error) {
          throw result.error;
        }

        return true;
      } catch (error) {
        console.error("Failed to update project-scoped progress:", error);
        return false;
      }
    },
    [activeProjectId, progress, user]
  );

  useEffect(() => {
    if (isLoadingProjects) {
      return;
    }

    loadAllData();

    const channel = supabase
      .channel("unified_data_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_systems" },
        updateSystems
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_progress" },
        updateProgressRecords
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_flow_stations" },
        updateStations
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_flow_items" },
        updateTestItems
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_contents" },
        updateStationContents
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    isLoadingProjects,
    loadAllData,
    updateProgressRecords,
    updateStationContents,
    updateStations,
    updateSystems,
    updateTestItems,
  ]);

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
    updateProgress,
  };
}
