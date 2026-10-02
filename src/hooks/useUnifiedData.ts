import {
  createContext,
  createElement,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";

import { fetchAllPages } from "./fetchAllPages";
import { useStationStatus } from "./useStationStatus";
import { acceptRowChange, applyRowChange, reconcileSnapshot, type RowChange, type RealtimeRow } from "@/lib/realtimeRows";
import { withReadDeadline } from "@/lib/readDeadline";

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
  flow_version_id?: string;
}

interface UnifiedStation {
  id: string;
  project_id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
  flow_version_id?: string;
}

interface UnifiedTestItem {
  id: string;
  project_id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
  flow_version_id?: string;
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
  updated_at?: string;
}

interface StationContent {
  id: string;
  project_id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
  flow_version_id?: string;
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

interface ProjectRealtimeRecord {
  id: string;
  project_id: string;
}

interface ProjectRealtimePayload<T extends ProjectRealtimeRecord> {
  eventType: "DELETE" | "INSERT" | "UPDATE";
  new: Partial<T>;
  old: Partial<T>;
  commit_timestamp?: string;
}

function useUnifiedDataSource() {
  const { user } = useUser();
  const { activeProject, activeProjectId } = useTestProject();
  const [systems, setSystems] = useState<UnifiedSystem[]>([]);
  const [stations, setStations] = useState<UnifiedStation[]>([]);
  const [testItems, setTestItems] = useState<UnifiedTestItem[]>([]);
  const [progress, setProgress] = useState<UnifiedProgress[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const loadSequenceRef = useRef(0);
  const loadedProjectRef = useRef<string | null>(null);
  const userId = user?.userId ?? null;
  const flowVersionId = activeProject?.active_flow_version_id ?? null;
  const scope = `${userId}:${activeProjectId}:${flowVersionId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const pendingChangesRef = useRef<Map<string, RowChange<RealtimeRow>[]>>(new Map());
  const loadingSnapshotRef = useRef(false);
  const eventClocksRef = useRef<Map<string, Map<string, string>>>(new Map());
  const eventScopeRef = useRef(scope);
  if (eventScopeRef.current !== scope) {
    eventScopeRef.current = scope;
    eventClocksRef.current.clear();
  }

  const stationStatuses = useStationStatus(systems, stations, progress);

  const loadAllData = useCallback(async () => {
    const loadSequence = ++loadSequenceRef.current;
    const isCurrent = () => loadSequence === loadSequenceRef.current && scope === scopeRef.current;
    pendingChangesRef.current.clear();
    loadingSnapshotRef.current = true;
    if (!userId || !activeProjectId) {
      loadedProjectRef.current = null;
      setSystems([]);
      setStations([]);
      setTestItems([]);
      setProgress([]);
      setStationContents([]);
      setIsLoading(false);
      setIsUpdating(false);
      loadingSnapshotRef.current = false;
      return;
    }

    const isInitialProjectLoad = loadedProjectRef.current !== scope;
    if (isInitialProjectLoad) {
      setIsLoading(true);
      setSystems([]);
      setStations([]);
      setTestItems([]);
      setProgress([]);
      setStationContents([]);
    } else {
      setIsUpdating(true);
    }

    try {
      const activeFlowVersionId = flowVersionId;
      const fetchStations = (includeFlowVersion: boolean) => withReadDeadline((signal) => fetchAllPages((from, to) => {
        let query = supabase
          .from("test_flow_stations")
          .select("*")
          .eq("project_id", activeProjectId);
        if (includeFlowVersion && activeFlowVersionId) {
          query = query.eq("flow_version_id", activeFlowVersionId);
        }
        return query.order("station_order").order("id").range(from, to).abortSignal(signal);
      }));
      const fetchItems = (includeFlowVersion: boolean) => withReadDeadline((signal) => fetchAllPages((from, to) => {
        let query = supabase
          .from("test_flow_items")
          .select("*")
          .eq("project_id", activeProjectId);
        if (includeFlowVersion && activeFlowVersionId) {
          query = query.eq("flow_version_id", activeFlowVersionId);
        }
        return query.order("item_order").order("id").range(from, to).abortSignal(signal);
      }));
      const fetchContents = (includeFlowVersion: boolean) => withReadDeadline((signal) => fetchAllPages((from, to) => {
        let query = supabase
          .from("station_contents")
          .select("*")
          .eq("project_id", activeProjectId);
        if (includeFlowVersion && activeFlowVersionId) {
          query = query.eq("flow_version_id", activeFlowVersionId);
        }
        return query.order("order_num").order("id").range(from, to).abortSignal(signal);
      }));

      const [systemsRes, initialStationsRes, initialItemsRes, initialContentsRes, progressRes] = await Promise.all([
        withReadDeadline((signal) => fetchAllPages((from, to) => supabase
          .from("test_systems")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("system_name")
          .order("id")
          .range(from, to).abortSignal(signal))),
        fetchStations(Boolean(activeFlowVersionId)),
        fetchItems(Boolean(activeFlowVersionId)),
        fetchContents(Boolean(activeFlowVersionId)),
        withReadDeadline((signal) => fetchAllPages((from, to) => supabase
          .from("test_progress")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("id")
          .range(from, to).abortSignal(signal))),
      ]);
      let stationsRes = initialStationsRes;
      let itemsRes = initialItemsRes;
      let contentsRes = initialContentsRes;

      // Older deployed schemas do not have flow_version_id yet. Keep them
      // readable while the additive migration rolls out.
      if (
        activeFlowVersionId &&
        (stationsRes.error || itemsRes.error || contentsRes.error)
      ) {
        [stationsRes, itemsRes, contentsRes] = await Promise.all([
          fetchStations(false),
          fetchItems(false),
          fetchContents(false),
        ]);
      }

      if (systemsRes.error) throw systemsRes.error;
      if (stationsRes.error) throw stationsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (contentsRes.error) throw contentsRes.error;
      if (progressRes.error) throw progressRes.error;

      if (!isCurrent()) return;

      const nextSystems = (systemsRes.data ?? []) as UnifiedSystem[];
      const nextStations = (stationsRes.data ?? []) as UnifiedStation[];
      const nextItems = (itemsRes.data ?? []) as UnifiedTestItem[];
      const nextContents = (contentsRes.data ?? []) as StationContent[];
      const nextProgress = (progressRes.data ?? []) as UnifiedProgress[];

      const merge = <T extends RealtimeRow>(key: string, rows: T[], flow?: string | null) =>
        reconcileSnapshot(rows, (pendingChangesRef.current.get(key) ?? []) as RowChange<T>[], activeProjectId, flow);
      setSystems(merge("systems", nextSystems));
      setStations(merge("stations", nextStations, flowVersionId));
      setTestItems(merge("items", nextItems, flowVersionId));
      setStationContents(merge("contents", nextContents, flowVersionId));
      setProgress(merge("progress", nextProgress));
      loadedProjectRef.current = scope;
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Failed to load project-scoped station data:", error);
      const serviceRestricted = isSupabaseServiceRestrictedError(error);
      toast({
        title: serviceRestricted ? "資料服務暫時中斷" : "資料載入失敗",
        description: serviceRestricted
          ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
          : "無法載入目前專案資料，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) {
        loadingSnapshotRef.current = false;
        pendingChangesRef.current.clear();
        setIsLoading(false);
        setIsUpdating(false);
      }
    }
  }, [activeProjectId, flowVersionId, scope, toast, userId]);

  const refreshProgress = useCallback(
    async (systemId?: string) => {
      if (!activeProjectId) return false;
      const requestScope = scope;
      const snapshotSequence = loadSequenceRef.current;
      const changes: RowChange<UnifiedProgress>[] = [];
      const key = `progress-refresh:${systemId ?? "all"}`;
      pendingChangesRef.current.set(key, changes);

      let result: { data: UnifiedProgress[]; error: unknown };
      try {
        result = await withReadDeadline((signal) => fetchAllPages((from, to) => {
        let query = supabase
          .from("test_progress")
          .select("*")
          .eq("project_id", activeProjectId);
        if (systemId) query = query.eq("system_id", systemId);
          return query.order("id").range(from, to).abortSignal(signal);
        }));
      } catch (error) {
        if (pendingChangesRef.current.get(key) === changes) pendingChangesRef.current.delete(key);
        console.warn("Progress refresh failed:", error);
        return false;
      }
      const { data, error } = result;
      if (scopeRef.current !== requestScope || snapshotSequence !== loadSequenceRef.current ||
          pendingChangesRef.current.get(key) !== changes) return false;
      pendingChangesRef.current.delete(key);
      if (error) {
        console.error("Failed to refresh project-scoped progress:", error);
        return false;
      }

      const nextProgress = reconcileSnapshot(data as UnifiedProgress[], changes, activeProjectId)
        .filter((entry) => !systemId || entry.system_id === systemId);
      setProgress((current) =>
        systemId
          ? [
              ...current.filter((entry) => entry.system_id !== systemId),
              ...nextProgress,
            ]
          : nextProgress
      );
      return true;
    },
    [activeProjectId, scope]
  );

  const handleProjectScopedRealtime = useCallback(
    <T extends ProjectRealtimeRecord>(
      payload: ProjectRealtimePayload<T>,
      setter: Dispatch<SetStateAction<T[]>>,
      key: string,
      sortFn?: (left: T, right: T) => number
    ) => {
      if (scopeRef.current !== scope || !activeProjectId) return;
      const recordProjectId = payload.new?.project_id ?? payload.old?.project_id;
      const isCurrentProject = recordProjectId === activeProjectId;

      if (!isCurrentProject && payload.eventType !== "DELETE") return;
      const clocks = eventClocksRef.current.get(key) ?? new Map<string, string>();
      eventClocksRef.current.set(key, clocks);
      if (!acceptRowChange(clocks, payload)) return;

      if (loadingSnapshotRef.current) {
        const changes = pendingChangesRef.current.get(key) ?? [];
        changes.push(payload);
        pendingChangesRef.current.set(key, changes);
      }
      if (key === "progress") {
        pendingChangesRef.current.forEach((changes, name) => {
          if (name.startsWith("progress-refresh:")) changes.push(payload);
        });
      }
      setter((previous) => {
        const next = applyRowChange(previous, payload, activeProjectId,
          ["stations", "items", "contents"].includes(key) ? flowVersionId : null);
        return sortFn && next !== previous ? next.sort(sortFn) : next;
      });
    },
    [activeProjectId, flowVersionId, scope]
  );

  const updateSystems = useCallback(
    (payload: unknown) => {
      handleProjectScopedRealtime(
        payload as ProjectRealtimePayload<UnifiedSystem>,
        setSystems, "systems"
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateStations = useCallback(
    (payload: unknown) => {
      handleProjectScopedRealtime(
        payload as ProjectRealtimePayload<UnifiedStation>,
        setStations, "stations",
        (left, right) => left.station_order - right.station_order
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateTestItems = useCallback(
    (payload: unknown) => {
      handleProjectScopedRealtime(
        payload as ProjectRealtimePayload<UnifiedTestItem>,
        setTestItems, "items",
        (left, right) => left.item_order - right.item_order
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateStationContents = useCallback(
    (payload: unknown) => {
      handleProjectScopedRealtime(
        payload as ProjectRealtimePayload<StationContent>,
        setStationContents, "contents",
        (left, right) => left.order_num - right.order_num
      );
    },
    [handleProjectScopedRealtime]
  );

  const updateProgressRecords = useCallback(
    (payload: unknown) => {
      handleProjectScopedRealtime(
        payload as ProjectRealtimePayload<UnifiedProgress>,
        setProgress, "progress"
      );
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
    loadAllData();

    if (!userId || !activeProjectId) return;

    let active = true;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    const recover = () => {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => { if (active) void loadAllData(); }, 150);
    };
    const projectFilter = `project_id=eq.${activeProjectId}`;
    const channel = supabase
      .channel(`unified_data_changes:${activeProjectId}`)
      .on(
        "postgres_changes",
        { event: "*", filter: projectFilter, schema: "workspace", table: "test_systems" },
        (payload) => { if (active) updateSystems(payload); }
      )
      .on(
        "postgres_changes",
        { event: "*", filter: projectFilter, schema: "workspace", table: "test_progress" },
        (payload) => { if (active) updateProgressRecords(payload); }
      )
      .on(
        "postgres_changes",
        { event: "*", filter: projectFilter, schema: "workspace", table: "test_flow_stations" },
        (payload) => { if (active) updateStations(payload); }
      )
      .on(
        "postgres_changes",
        { event: "*", filter: projectFilter, schema: "workspace", table: "test_flow_items" },
        (payload) => { if (active) updateTestItems(payload); }
      )
      .on(
        "postgres_changes",
        { event: "*", filter: projectFilter, schema: "workspace", table: "station_contents" },
        (payload) => { if (active) updateStationContents(payload); }
      )
      .subscribe((status) => {
        // Reconcile the subscribe gap and missed events after SDK reconnection.
        if (status === "SUBSCRIBED") recover();
      });
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);

    return () => {
      active = false;
      loadSequenceRef.current += 1;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      supabase.removeChannel(channel);
    };
  }, [
    activeProjectId,
    loadAllData,
    userId,
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
    refreshProgress,
    updateProgress,
  };
}

type UnifiedDataContextValue = ReturnType<typeof useUnifiedDataSource>;

const UnifiedDataContext = createContext<UnifiedDataContextValue | null>(null);

export function UnifiedDataProvider({ children }: { children: ReactNode }) {
  const value = useUnifiedDataSource();

  return createElement(UnifiedDataContext.Provider, { value }, children);
}

export function useUnifiedData() {
  const context = useContext(UnifiedDataContext);

  if (!context) {
    throw new Error("useUnifiedData must be used within a UnifiedDataProvider");
  }

  return context;
}
