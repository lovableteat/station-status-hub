import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Gauge,
  Hourglass,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { MaintenanceLoading } from "@/components/maintenance/MaintenanceLoading";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { MaintenanceProjectSetup } from "@/components/maintenance/MaintenanceProjectSetup";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFlowVersions } from "@/hooks/useFlowVersions";
import { usePermissions } from "@/hooks/usePermissions";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { fetchAllPages } from "@/hooks/fetchAllPages";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { BulkResetDialog } from "./BulkResetDialog";
import { ExportManager } from "./ExportManager";
import { PDFExportDialog } from "./pdf/PDFExportDialog";
import { SystemCloneDialog } from "./SystemCloneDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemManager } from "./SystemManager";
import { SystemProgressSheet } from "./SystemProgressSheet";
import { TestProgressTable } from "./TestProgressTable";
import {
  createStationIncompleteSystemIds,
  filterAndSortTrackerSystems,
  normalizeTrackerSystemStatus,
  parseTrackerAutoFilters,
} from "./testTrackerFilters";
import type { TrackerSort } from "./testTrackerFilters";
import {
  DEFAULT_TRACKER_PAGE_SIZE,
  TRACKER_PAGE_SIZE_OPTIONS,
} from "./testTrackerPresentation";
import type { TrackerLinkedIssue } from "./testTrackerPresentation";

type StatusFilter = "all" | "未開始" | "進行中" | "已完成";
type TrackerView = "table" | "board";

const ProductionMonitor = lazy(() =>
  import("@/components/production/ProductionMonitor").then((module) => ({
    default: module.ProductionMonitor,
  }))
);

const KPI_TONES = {
  blue: {
    card: "border-blue-400/45 bg-[linear-gradient(135deg,rgba(14,48,91,0.96),rgba(7,24,46,0.98))] shadow-[0_0_22px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(147,197,253,0.12)]",
    detail: "text-blue-200/55",
    icon: "bg-blue-500/20 text-blue-300 shadow-[0_0_18px_rgba(59,130,246,0.42)]",
    label: "text-blue-100/80",
  },
  cyan: {
    card: "border-cyan-400/45 bg-[linear-gradient(135deg,rgba(7,54,70,0.96),rgba(6,27,43,0.98))] shadow-[0_0_22px_rgba(34,211,238,0.17),inset_0_1px_0_rgba(103,232,249,0.12)]",
    detail: "text-cyan-200/55",
    icon: "bg-cyan-400/20 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.4)]",
    label: "text-cyan-100/80",
  },
  emerald: {
    card: "border-emerald-400/45 bg-[linear-gradient(135deg,rgba(7,59,51,0.96),rgba(5,31,36,0.98))] shadow-[0_0_22px_rgba(52,211,153,0.17),inset_0_1px_0_rgba(110,231,183,0.12)]",
    detail: "text-emerald-200/55",
    icon: "bg-emerald-400/20 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.4)]",
    label: "text-emerald-100/80",
  },
  amber: {
    card: "border-amber-400/45 bg-[linear-gradient(135deg,rgba(65,45,12,0.96),rgba(31,28,20,0.98))] shadow-[0_0_22px_rgba(245,158,11,0.17),inset_0_1px_0_rgba(252,211,77,0.12)]",
    detail: "text-amber-200/55",
    icon: "bg-amber-400/20 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.4)]",
    label: "text-amber-100/80",
  },
  violet: {
    card: "border-violet-400/45 bg-[linear-gradient(135deg,rgba(48,38,91,0.96),rgba(20,24,50,0.98))] shadow-[0_0_22px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(196,181,253,0.12)]",
    detail: "text-violet-200/55",
    icon: "bg-violet-400/20 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,0.42)]",
    label: "text-violet-100/80",
  },
} as const;

function TrackerKpi({
  className,
  detail,
  icon: Icon,
  label,
  tone,
  unit,
  value,
  visual,
  testId,
}: {
  className?: string;
  detail: string;
  icon: typeof Boxes;
  label: string;
  tone: keyof typeof KPI_TONES;
  unit?: string;
  value: string | number;
  visual?: ReactNode;
  testId?: string;
}) {
  const toneClasses = KPI_TONES[tone];

  return (
    <div
      data-testid={testId}
      className={cn("flex h-[72px] min-w-0 items-center gap-3 rounded-xl border px-3 py-2", toneClasses.card, className)}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", toneClasses.icon)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className={cn("truncate text-[11px]", toneClasses.label)}>{label}</div>
        <div className="font-data mt-0.5 flex items-baseline gap-1 text-[23px] font-semibold leading-6 text-[#f3f8fc]">
          {value}
          {unit && <span className={cn("text-[10px] font-normal", toneClasses.label)}>{unit}</span>}
        </div>
        <div className={cn("truncate text-[10px]", toneClasses.detail)}>{detail}</div>
      </div>
      {visual && <div className="ml-auto shrink-0">{visual}</div>}
    </div>
  );
}

function ProgressSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 96;
      const y = 30 - (value / max) * 24;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 96 32" className="h-8 w-24" role="img" aria-label="機台進度分布">
      <polyline
        points={points}
        fill="none"
        stroke="#4c8dff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function updateTrackerViewQuery(view: TrackerView) {
  const url = new URL(window.location.href);
  url.searchParams.set("trackerView", view);
  window.history.replaceState({}, "", url);
}

export function TestTracker() {
  const {
    items,
    isLoading,
    loadData,
    progress,
    refreshProgress,
    stations,
    systems,
    updateProgress,
  } = useTestTrackerData();
  const { activeProject, activeProjectId } = useTestProject();
  const { canViewModule } = usePermissions();
  const canViewList = canViewModule("test-tracker");
  const canViewProductionBoard = canViewModule("monitor");
  const {
    activeVersion,
    selectedVersionId,
  } = useFlowVersions();
  const [searchTerm, setSearchTerm] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("trackerSearch") ?? ""
  );
  const [engineerFilter, setEngineerFilter] = useState(() =>
    typeof window === "undefined"
      ? "all"
      : new URLSearchParams(window.location.search).get("engineer") ?? "all"
  );
  const [stationFilter, setStationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (typeof window === "undefined") return "all";
    const requested = new URLSearchParams(window.location.search).get("status");
    return requested === "未開始" || requested === "進行中" || requested === "已完成"
      ? requested
      : "all";
  });
  const [sortOrder, setSortOrder] = useState<TrackerSort>(() => {
    if (typeof window === "undefined") return "machine-asc";
    const requested = new URLSearchParams(window.location.search).get("sort");
    return requested === "machine-desc" ||
      requested === "created-desc" ||
      requested === "created-asc"
      ? requested
      : "machine-asc";
  });
  const [systemFilter, setSystemFilter] = useState(() =>
    typeof window === "undefined"
      ? ""
      : parseTrackerAutoFilters(new URLSearchParams(window.location.search)).system
  );
  const [excludeCompleted, setExcludeCompleted] = useState(() =>
    typeof window !== "undefined" &&
    parseTrackerAutoFilters(new URLSearchParams(window.location.search)).excludeCompleted
  );
  const [urlFiltersHydrated, setUrlFiltersHydrated] = useState(false);
  const [view, setView] = useState<TrackerView>(() => {
    if (typeof window === "undefined") return "table";
    const params = new URLSearchParams(window.location.search);
    return params.get("trackerView") === "board" || params.get("module") === "monitor"
      ? "board"
      : "table";
  });
  const [attentionFilter, setAttentionFilter] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("attention") === "1"
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TRACKER_PAGE_SIZE);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [lockedStationId, setLockedStationId] = useState<string | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [cloneSourceSystem, setCloneSourceSystem] = useState<{
    id: string;
    system_name: string;
  } | null>(null);
  const [pdfExporterOpen, setPdfExporterOpen] = useState(false);
  const [displayStations, setDisplayStations] = useState(stations);
  const [displayItems, setDisplayItems] = useState(items);
  const [linkedIssues, setLinkedIssues] = useState<TrackerLinkedIssue[]>([]);

  const loadLinkedIssues = useCallback(async () => {
    if (!activeProjectId) {
      setLinkedIssues([]);
      return;
    }

    const { data, error } = await fetchAllPages<TrackerLinkedIssue>((from, to) =>
      supabase
        .from("issues")
        .select("id, status, system_id, station_id, test_item_id")
        .eq("project_id", activeProjectId)
        .in("status", ["open", "in_progress"])
        .not("system_id", "is", null)
        .not("station_id", "is", null)
        .not("test_item_id", "is", null)
        .order("created_at", { ascending: false })
        .range(from, to)
    );

    if (error) {
      console.error("Failed to load linked tracker issues:", error);
      return;
    }
    setLinkedIssues((data ?? []) as TrackerLinkedIssue[]);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      setLinkedIssues([]);
      return;
    }

    void loadLinkedIssues();
    const channel = supabase
      .channel(`tracker-linked-issues:${activeProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `project_id=eq.${activeProjectId}`,
          schema: "workspace",
          table: "issues",
        },
        () => void loadLinkedIssues(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeProjectId, loadLinkedIssues]);

  useEffect(() => {
    if (typeof window === "undefined" || urlFiltersHydrated) return;
    const parsed = parseTrackerAutoFilters(new URLSearchParams(window.location.search));
    if (parsed.station && !displayStations.length) return;

    const matchedStation = parsed.station
      ? displayStations.find(
          (station) =>
            station.id === parsed.station || station.station_name === parsed.station
        )
      : null;
    setStationFilter(matchedStation?.station_name ?? "all");
    setSystemFilter(parsed.system);
    setExcludeCompleted(parsed.excludeCompleted);
    setUrlFiltersHydrated(true);
  }, [displayStations, urlFiltersHydrated]);

  useEffect(() => {
    if (typeof window === "undefined" || !urlFiltersHydrated) return;
    const url = new URL(window.location.href);
    const setQuery = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };

    setQuery("trackerSearch", searchTerm.trim());
    setQuery("engineer", engineerFilter === "all" ? "" : engineerFilter);
    setQuery("station", stationFilter === "all" ? "" : stationFilter);
    setQuery("status", statusFilter === "all" ? "" : statusFilter);
    setQuery("sort", sortOrder === "machine-asc" ? "" : sortOrder);
    setQuery("system", systemFilter);
    setQuery("excludeStatus", excludeCompleted ? "completed" : "");
    setQuery("attention", attentionFilter ? "1" : "");
    window.history.replaceState({}, "", url);
  }, [
    attentionFilter,
    engineerFilter,
    excludeCompleted,
    searchTerm,
    sortOrder,
    stationFilter,
    statusFilter,
    systemFilter,
    urlFiltersHydrated,
  ]);

  useEffect(() => {
    if (view === "table" && !canViewList && canViewProductionBoard) {
      setView("board");
    } else if (view === "board" && !canViewProductionBoard && canViewList) {
      setView("table");
    }
  }, [canViewList, canViewProductionBoard, view]);

  useEffect(() => {
    updateTrackerViewQuery(view);
  }, [view]);

  useEffect(() => {
    if (!selectedVersionId || selectedVersionId === activeVersion?.id) {
      setDisplayStations(stations);
      setDisplayItems(items);
      return;
    }

    let cancelled = false;
    Promise.all([
      supabase
        .from("test_flow_stations")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("flow_version_id", selectedVersionId)
        .order("station_order"),
      supabase
        .from("test_flow_items")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("flow_version_id", selectedVersionId)
        .order("item_order"),
    ]).then(([stationResult, itemResult]) => {
      if (cancelled || stationResult.error || itemResult.error) return;
      setDisplayStations(stationResult.data ?? []);
      setDisplayItems(itemResult.data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    activeVersion?.id,
    items,
    selectedVersionId,
    stations,
  ]);

  useEffect(() => {
    setPage(1);
  }, [engineerFilter, excludeCompleted, searchTerm, selectedVersionId, sortOrder, stationFilter, statusFilter, systemFilter, view]);

  const engineers = useMemo(
    () =>
      [...new Set(
        systems
          .map((system) => system.assigned_engineer)
          .filter((engineer): engineer is string => Boolean(engineer?.trim()))
      )].sort((left, right) => left.localeCompare(right, "zh-Hant")),
    [systems]
  );

  const selectedStation = useMemo(
    () => stationFilter === "all"
      ? null
      : displayStations.find(
          (station) => station.id === stationFilter || station.station_name === stationFilter,
        ) ?? null,
    [displayStations, stationFilter],
  );
  const stationIncompleteSystemIds = useMemo(
    () => selectedStation && excludeCompleted
      ? createStationIncompleteSystemIds(
          systems,
          selectedStation.id,
          displayItems,
          progress,
        )
      : null,
    [displayItems, excludeCompleted, progress, selectedStation, systems],
  );
  const stationScopedSystems = useMemo(
    () => stationIncompleteSystemIds
      ? systems.filter((system) => stationIncompleteSystemIds.has(system.id))
      : systems,
    [stationIncompleteSystemIds, systems],
  );

  const baseFilteredSystems = useMemo(
    () => filterAndSortTrackerSystems(stationScopedSystems, {
      engineer: engineerFilter,
      excludeCompleted: !selectedStation && excludeCompleted,
      flowVersionId: selectedVersionId,
      search: searchTerm,
      sort: sortOrder,
      status: "all",
      system: systemFilter,
    }),
    [engineerFilter, excludeCompleted, searchTerm, selectedStation, selectedVersionId, sortOrder, stationScopedSystems, systemFilter]
  );

  const statusCounts = useMemo(
    () =>
      baseFilteredSystems.reduce(
        (counts, system) => {
          counts[normalizeTrackerSystemStatus(system)] += 1;
          return counts;
        },
        { 已完成: 0, 未開始: 0, 進行中: 0 }
      ),
    [baseFilteredSystems]
  );

  const attentionSystemIds = useMemo(
    () =>
      new Set(
        [...systems]
          .filter(
            (system) =>
              normalizeTrackerSystemStatus(system) !== "已完成" &&
              system.exclude_from_dashboard !== true
          )
          .sort(
            (left, right) =>
              (left.overall_progress ?? 0) - (right.overall_progress ?? 0) ||
              left.system_name.localeCompare(right.system_name, "zh-Hant")
          )
          .slice(0, 5)
          .map((system) => system.id)
      ),
    [systems]
  );

  const filteredSystems = useMemo(
    () => {
      const nextSystems = filterAndSortTrackerSystems(baseFilteredSystems, {
        sort: sortOrder,
        status: statusFilter,
      });
      return attentionFilter
        ? nextSystems.filter((system) => attentionSystemIds.has(system.id))
        : nextSystems;
    },
    [attentionFilter, attentionSystemIds, baseFilteredSystems, sortOrder, statusFilter]
  );
  const pageCount = Math.max(1, Math.ceil(filteredSystems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedSystems = filteredSystems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const firstVisibleRecord = filteredSystems.length
    ? (currentPage - 1) * pageSize + 1
    : 0;
  const lastVisibleRecord = Math.min(currentPage * pageSize, filteredSystems.length);
  useEffect(() => {
    setPage((value) => Math.min(value, pageCount));
  }, [pageCount]);
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? null;
  const editingSystem = systems.find((system) => system.id === editingSystemId) ?? null;
  const openSystemProgress = (systemId: string) => {
    setLockedStationId(null);
    setSelectedSystemId(systemId);
  };
  const openStationProgress = (systemId: string, stationId: string) => {
    setLockedStationId(stationId);
    setSelectedSystemId(systemId);
  };
  const handleProgressOpenChange = (open: boolean) => {
    if (open) return;
    setSelectedSystemId(null);
    setLockedStationId(null);
  };
  const projectStatusCounts = useMemo(
    () =>
      systems.reduce(
        (counts, system) => {
          counts[normalizeTrackerSystemStatus(system)] += 1;
          return counts;
        },
        { 已完成: 0, 未開始: 0, 進行中: 0 }
      ),
    [systems]
  );
  const overallCompletion = systems.length
    ? Math.round(
        (systems.reduce((sum, system) => sum + (system.overall_progress ?? 0), 0) /
          systems.length) *
          10
      ) / 10
    : 0;
  const progressDistribution = useMemo(
    () =>
      Array.from({ length: 10 }, (_, bucket) =>
        systems.filter((system) => {
          const progressValue = Math.min(99.99, Math.max(0, system.overall_progress ?? 0));
          return Math.floor(progressValue / 10) === bucket;
        }).length
      ),
    [systems]
  );

  const changeView = (nextView: TrackerView) => {
    if (nextView === "table" && !canViewList) return;
    if (nextView === "board" && !canViewProductionBoard) return;
    setView(nextView);
  };

  const openFlowSettings = () => {
    window.dispatchEvent(new CustomEvent("navigate", { detail: { module: "flow-info" } }));
  };

  const activeFilterCount = [
    Boolean(searchTerm.trim()),
    engineerFilter !== "all",
    stationFilter !== "all",
    statusFilter !== "all",
    Boolean(systemFilter),
    excludeCompleted,
    attentionFilter,
  ].filter(Boolean).length;

  const clearTrackerFilters = () => {
    setSearchTerm("");
    setEngineerFilter("all");
    setStationFilter("all");
    setStatusFilter("all");
    setSystemFilter("");
    setExcludeCompleted(false);
    setAttentionFilter(false);
  };

  const trackerFilterToolbar = (
    <section
      data-testid="test-tracker-filter-toolbar"
      className="maintenance-toolbar space-y-2 p-2"
      aria-label="L10 測試追蹤篩選"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[230px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91adc2]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))}
            className="h-9 border-[#315574] bg-[#06111f] pl-9"
            placeholder="搜尋機台、序號或工程師"
          />
        </div>
        <Select value={stationFilter} onValueChange={setStationFilter}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="站點" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部站點</SelectItem>
            {displayStations.map((station) => <SelectItem key={station.id} value={station.station_name}>{station.station_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            const nextStatus = value as StatusFilter;
            setStatusFilter(nextStatus);
            if (nextStatus === "已完成") setExcludeCompleted(false);
          }}
        >
          <SelectTrigger className="h-9 w-[135px]"><SelectValue placeholder="狀態" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="未開始">未開始 {statusCounts.未開始}</SelectItem>
            <SelectItem value="進行中">進行中 {statusCounts.進行中}</SelectItem>
            <SelectItem value="已完成">已完成 {statusCounts.已完成}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={engineerFilter} onValueChange={setEngineerFilter}>
          <SelectTrigger className="h-9 w-[145px]"><SelectValue placeholder="工程師" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工程師</SelectItem>
            {engineers.map((engineer) => <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as TrackerSort)}>
          <SelectTrigger className="h-9 w-[175px]"><SelectValue placeholder="排序" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="machine-asc">機台 ID：小到大</SelectItem>
            <SelectItem value="machine-desc">機台 ID：大到小</SelectItem>
            <SelectItem value="created-desc">建立時間：新到舊</SelectItem>
            <SelectItem value="created-asc">建立時間：舊到新</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex h-9 items-center gap-1 rounded-lg border border-[#315574] bg-[#06111f] p-1" aria-label="L10 顯示方式">
          {canViewList && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view === "table"}
              className={cn("h-7 rounded-md px-2.5 text-xs", view === "table" && "bg-[#4c8dff] text-[#06111f] hover:bg-[#6ba2ff] hover:text-[#06111f]")}
              onClick={() => changeView("table")}
            >
              <List className="mr-1.5 h-4 w-4" />列表
            </Button>
          )}
          {canViewProductionBoard && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view === "board"}
              className={cn("h-7 rounded-md px-2.5 text-xs", view === "board" && "bg-[#4c8dff] text-[#06111f] hover:bg-[#6ba2ff] hover:text-[#06111f]")}
              onClick={() => changeView("board")}
            >
              <Activity className="mr-1.5 h-4 w-4" />生產看板
            </Button>
          )}
        </div>
        <Badge variant="outline" className="font-data ml-auto h-8 rounded-lg border-blue-300/35 bg-blue-300/10 px-3 text-blue-100">
          {filteredSystems.length} 台
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#254866] pt-2">
        <div data-testid="test-tracker-active-filters" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#8fabbe]">
            <SlidersHorizontal className="h-3.5 w-3.5" />目前條件
          </span>
          {searchTerm.trim() && <button type="button" onClick={() => setSearchTerm("")} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-100">搜尋：{searchTerm.trim()} <X className="ml-1 inline h-3 w-3" /></button>}
          {stationFilter !== "all" && <button type="button" onClick={() => setStationFilter("all")} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-100">站點：{stationFilter} <X className="ml-1 inline h-3 w-3" /></button>}
          {statusFilter !== "all" && <button type="button" onClick={() => setStatusFilter("all")} className="rounded-full border border-blue-300/30 bg-blue-300/10 px-2 py-1 text-[11px] text-blue-100">狀態：{statusFilter} <X className="ml-1 inline h-3 w-3" /></button>}
          {engineerFilter !== "all" && <button type="button" onClick={() => setEngineerFilter("all")} className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-1 text-[11px] text-violet-100">工程師：{engineerFilter} <X className="ml-1 inline h-3 w-3" /></button>}
          {systemFilter && <button type="button" onClick={() => setSystemFilter("")} className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[11px] text-emerald-100">機台：{systemFilter} <X className="ml-1 inline h-3 w-3" /></button>}
          {excludeCompleted && <button type="button" onClick={() => setExcludeCompleted(false)} className="rounded-full border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">排除：已完成 <X className="ml-1 inline h-3 w-3" /></button>}
          {attentionFilter && <button type="button" onClick={() => setAttentionFilter(false)} className="rounded-full border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">範圍：需關注機台 <X className="ml-1 inline h-3 w-3" /></button>}
          {activeFilterCount === 0 && <span className="text-[11px] text-[#7895aa]">顯示全部機台</span>}
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={activeFilterCount === 0} onClick={clearTrackerFilters}>
            清除全部
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-l border-[#254866] pl-2">
          <SystemManager onSystemUpdate={loadData} showDeleteAll={false} />
          <BulkResetDialog onReset={loadData} />
          <ExportManager systems={filteredSystems} stations={displayStations} progress={progress} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <Download className="mr-2 h-4 w-4" />PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setPdfExporterOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />完整測試追蹤 PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </section>
  );

  if (isLoading) {
    return <MaintenanceLoading label="正在載入 L10 測試追蹤" />;
  }

  if (!systems.length) {
    return (
      <div className="maintenance-page space-y-3">
        <MaintenancePageHeader
          icon={ClipboardList}
          title="L10 測試追蹤"
          description={`${activeProject?.name || "目前專案"} · 尚未加入機台`}
        />
        <MaintenanceProjectSetup
          projectName={activeProject?.name || "目前專案"}
          hasPublishedFlow={displayStations.length > 0}
          onOpenFlow={openFlowSettings}
          actions={
            displayStations.length > 0 ? (
              <SystemManager onSystemUpdate={loadData} showDeleteAll={false} />
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="maintenance-page !p-2 space-y-2">
      <div className="lg:hidden">
        <MaintenancePageHeader
          icon={ClipboardList}
          title="L10 測試追蹤"
          description={`${activeProject?.name || "目前專案"} · ${filteredSystems.length} 台符合條件`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <TrackerKpi
          icon={Boxes}
          label="機台總數"
          value={systems.length}
          unit="台"
          detail="目前專案全部機台"
          tone="cyan"
        />
        <TrackerKpi
          icon={Hourglass}
          label="未開始"
          value={projectStatusCounts.未開始}
          unit="台"
          detail={`${systems.length ? Math.round((projectStatusCounts.未開始 / systems.length) * 100) : 0}%`}
          tone="amber"
        />
        <TrackerKpi
          icon={Activity}
          label="進行中"
          value={projectStatusCounts.進行中}
          unit="台"
          detail={`${systems.length ? Math.round((projectStatusCounts.進行中 / systems.length) * 100) : 0}%`}
          tone="blue"
        />
        <TrackerKpi
          icon={CheckCircle2}
          label="已完成"
          value={projectStatusCounts.已完成}
          unit="台"
          detail={`${systems.length ? Math.round((projectStatusCounts.已完成 / systems.length) * 100) : 0}%`}
          tone="emerald"
        />
        <TrackerKpi
          className="col-span-2 lg:col-span-1"
          icon={Gauge}
          label="整體完成率"
          value={`${overallCompletion}%`}
          detail="依所有機台平均進度"
          tone="violet"
          testId="tracker-kpi-overall"
          visual={<ProgressSparkline values={progressDistribution} />}
        />
      </div>

      {trackerFilterToolbar}

      {view === "table" ? (
        <>
          <TestProgressTable
            columnStorageKey={`maintenance:test-tracker:columns:${activeProjectId}`}
            systems={pagedSystems}
            stations={displayStations}
            items={displayItems}
            linkedIssues={linkedIssues}
            progress={progress}
            onCloneSystem={setCloneSourceSystem}
            onEditSystemData={setEditingSystemId}
            onSelectStation={openStationProgress}
            onSelectSystem={openSystemProgress}
            onSystemUpdate={loadData}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1a3858] bg-[#0a1a2e] px-3 py-2 text-xs text-[#a9c0d1]">
            <div className="flex items-center gap-2">
              <span>每頁</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRACKER_PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size} 筆</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-data">
                顯示 {firstVisibleRecord}-{lastVisibleRecord}，共 {filteredSystems.length} 台
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="h-4 w-4" /><span className="sr-only">上一頁</span>
              </Button>
              <span className="font-data min-w-14 text-center">{currentPage}/{pageCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= pageCount} onClick={() => setPage((value) => value + 1)}>
                <ChevronRight className="h-4 w-4" /><span className="sr-only">下一頁</span>
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Suspense fallback={<MaintenanceLoading label="正在載入生產看板" />}>
          <ProductionMonitor
            embedded
            systemsOverride={filteredSystems}
            stationsOverride={displayStations}
            testItemsOverride={displayItems}
            progressOverride={progress}
            stationFilterOverride={selectedStation?.id ?? "all"}
            attentionFilterOverride={attentionFilter}
            attentionSystemIdsOverride={attentionSystemIds}
            onAttentionFilterChange={setAttentionFilter}
          />
        </Suspense>
      )}

      <SystemProgressSheet
        open={Boolean(selectedSystem)}
        onOpenChange={handleProgressOpenChange}
        system={selectedSystem}
        stations={displayStations}
        items={displayItems}
        progress={progress}
        lockedStationId={lockedStationId}
        updateProgress={updateProgress}
        onUpdated={() => {
          if (selectedSystemId) void refreshProgress(selectedSystemId);
        }}
      />

      {editingSystem && (
        <SystemEditDialog
          systemId={editingSystem.id}
          systemName={editingSystem.system_name}
          assignedEngineer={editingSystem.assigned_engineer || ""}
          model={editingSystem.model || undefined}
          serialNumber={editingSystem.serial_number || undefined}
          onUpdate={loadData}
          showTrigger={false}
          open={Boolean(editingSystem)}
          onOpenChange={(open) => !open && setEditingSystemId(null)}
        />
      )}

      <SystemCloneDialog
        open={Boolean(cloneSourceSystem)}
        sourceSystem={cloneSourceSystem}
        onOpenChange={(open) => !open && setCloneSourceSystem(null)}
        onCloned={loadData}
      />

      <PDFExportDialog
        systems={filteredSystems}
        stations={displayStations}
        items={displayItems}
        progress={progress}
        isOpen={pdfExporterOpen}
        onClose={() => setPdfExporterOpen(false)}
      />
    </div>
  );
}
