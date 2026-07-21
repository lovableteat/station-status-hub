import { useEffect, useMemo, useState } from "react";
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
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFlowVersions } from "@/hooks/useFlowVersions";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { BulkResetDialog } from "./BulkResetDialog";
import { ExportManager } from "./ExportManager";
import { PDFExportDialog } from "./pdf/PDFExportDialog";
import { SegmentedProgress } from "./SegmentedProgress";
import { SystemCloneDialog } from "./SystemCloneDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemManager } from "./SystemManager";
import { SystemProgressSheet } from "./SystemProgressSheet";
import { TestProgressTable } from "./TestProgressTable";
import {
  DEFAULT_TRACKER_PAGE_SIZE,
  TRACKER_PAGE_SIZE_OPTIONS,
} from "./testTrackerPresentation";

type StatusFilter = "all" | "未開始" | "進行中" | "已完成";
type TrackerView = "table" | "board";

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

function normalizeSystemStatus(system: {
  current_station?: string | null;
  overall_progress?: number | null;
  status?: string | null;
}) {
  if (
    system.status === "Done" ||
    system.status === "已完成" ||
    system.current_station === "已完成" ||
    system.overall_progress === 100
  ) {
    return "已完成";
  }
  if (
    system.status === "On-going" ||
    system.status === "進行中" ||
    (system.overall_progress ?? 0) > 0
  ) {
    return "進行中";
  }
  return "未開始";
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
  const {
    activeVersion,
    selectedVersionId,
  } = useFlowVersions();
  const [searchTerm, setSearchTerm] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<TrackerView>(() => {
    if (typeof window === "undefined") return "table";
    return new URLSearchParams(window.location.search).get("trackerView") === "board"
      ? "board"
      : "table";
  });
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
  }, [engineerFilter, searchTerm, selectedVersionId, stationFilter, statusFilter, view]);

  const engineers = useMemo(
    () =>
      [...new Set(
        systems
          .map((system) => system.assigned_engineer)
          .filter((engineer): engineer is string => Boolean(engineer?.trim()))
      )].sort((left, right) => left.localeCompare(right, "zh-Hant")),
    [systems]
  );

  const baseFilteredSystems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return systems.filter((system) => {
      const status = normalizeSystemStatus(system);
      const matchesKeyword =
        !keyword ||
        system.system_name?.toLowerCase().includes(keyword) ||
        system.serial_number?.toLowerCase().includes(keyword) ||
        system.assigned_engineer?.toLowerCase().includes(keyword) ||
        system.current_station?.toLowerCase().includes(keyword);
      const matchesEngineer =
        engineerFilter === "all" || system.assigned_engineer === engineerFilter;
      const matchesStation =
        stationFilter === "all" || system.current_station === stationFilter;
      const matchesVersion =
        !selectedVersionId ||
        !system.flow_version_id ||
        system.flow_version_id === selectedVersionId;

      return matchesKeyword && matchesEngineer && matchesStation && matchesVersion;
    });
  }, [engineerFilter, searchTerm, selectedVersionId, stationFilter, systems]);

  const statusCounts = useMemo(
    () =>
      baseFilteredSystems.reduce(
        (counts, system) => {
          counts[normalizeSystemStatus(system)] += 1;
          return counts;
        },
        { 已完成: 0, 未開始: 0, 進行中: 0 }
      ),
    [baseFilteredSystems]
  );

  const filteredSystems = useMemo(
    () =>
      statusFilter === "all"
        ? baseFilteredSystems
        : baseFilteredSystems.filter(
            (system) => normalizeSystemStatus(system) === statusFilter
          ),
    [baseFilteredSystems, statusFilter]
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
          counts[normalizeSystemStatus(system)] += 1;
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
    setView(nextView);
    updateTrackerViewQuery(nextView);
  };

  const openFlowSettings = () => {
    window.dispatchEvent(new CustomEvent("navigate", { detail: { module: "flow-info" } }));
  };

  const activeFilterCount = [
    Boolean(searchTerm.trim()),
    engineerFilter !== "all",
    stationFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length;

  const clearTrackerFilters = () => {
    setSearchTerm("");
    setEngineerFilter("all");
    setStationFilter("all");
    setStatusFilter("all");
  };

  const renderTrackerControls = (compact = false) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={cn(
            "relative rounded-md border-[#315574] text-[#cfe0eb] hover:bg-[#15314b] hover:text-white",
            compact ? "h-7 w-7 border border-[#315574]" : "h-8"
          )}
          aria-label="搜尋、篩選與專案操作"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {!compact && <span className="ml-2">篩選與操作</span>}
          {activeFilterCount > 0 && (
            <span className="font-data absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#438dff] px-1 text-[9px] text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(620px,calc(100vw-24px))] space-y-3 border-[#315574] bg-[#0b1b2d] p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#f3f8fc]">篩選與專案操作</div>
            <div className="mt-0.5 text-xs text-[#8fabbe]">控制項收在這裡，資料矩陣保留最大空間。</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={activeFilterCount === 0}
            onClick={clearTrackerFilters}
          >
            清除篩選
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91adc2]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))}
            className="h-9 border-[#315574] bg-[#06111f] pl-9"
            placeholder="搜尋機台、序號或工程師"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={engineerFilter} onValueChange={setEngineerFilter}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="工程師" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部工程師</SelectItem>
              {engineers.map((engineer) => <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={stationFilter} onValueChange={setStationFilter}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="站點" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部站點</SelectItem>
              {displayStations.map((station) => <SelectItem key={station.id} value={station.station_name}>{station.station_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#254866] bg-[#071522] p-1">
          {(["未開始", "進行中", "已完成"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter((current) => current === status ? "all" : status)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                statusFilter === status
                  ? "bg-[#438dff] text-white"
                  : "text-[#a9c0d1] hover:bg-[#10263a] hover:text-[#f3f8fc]"
              )}
            >
              {status} <span className="font-data ml-1">{statusCounts[status]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium",
              statusFilter === "all" ? "bg-[#10263a] text-[#f3f8fc]" : "text-[#a9c0d1]"
            )}
          >
            全部 <span className="font-data ml-1">{baseFilteredSystems.length}</span>
          </button>

          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-8 rounded-md", view === "table" && "bg-[#183654] text-cyan-100")}
              onClick={() => changeView("table")}
            >
              <List className="h-4 w-4" /><span className="sr-only">表格檢視</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-8 rounded-md", view === "board" && "bg-[#183654] text-cyan-100")}
              onClick={() => changeView("board")}
            >
              <LayoutGrid className="h-4 w-4" /><span className="sr-only">站點看板</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#254866] pt-3">
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
      </PopoverContent>
    </Popover>
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
          actions={renderTrackerControls(false)}
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

      {view === "table" ? (
        <>
          <TestProgressTable
            columnStorageKey={`maintenance:test-tracker:columns:${activeProjectId}`}
            headerControls={renderTrackerControls(true)}
            systems={pagedSystems}
            stations={displayStations}
            items={displayItems}
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
        <div className="space-y-2">
          <div className="flex justify-end">{renderTrackerControls(false)}</div>
          <div className="flex min-h-[430px] gap-3 overflow-x-auto pb-2">
          {displayStations.map((station) => {
            const stationSystems = filteredSystems.filter(
              (system) => system.current_station === station.station_name
            );
            return (
              <section key={station.id} className="maintenance-panel min-w-[250px] flex-1 overflow-hidden">
                <div className="flex h-11 items-center justify-between border-b border-[#2a526f]/70 px-3">
                  <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">{station.station_name}</h2>
                  <Badge variant="outline" className="font-data rounded-md">{stationSystems.length}</Badge>
                </div>
                <div className="max-h-[calc(100vh-348px)] space-y-2 overflow-y-auto p-2">
                  {stationSystems.map((system) => (
                    <button
                      key={system.id}
                      type="button"
                      className="w-full rounded-lg border border-[#2a526f] bg-[#10263a] p-2.5 text-left hover:border-cyan-300/55"
                      onClick={() => openStationProgress(system.id, station.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</span>
                        <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[#a9c0d1]">{system.assigned_engineer || "未指定工程師"}</div>
                      <SegmentedProgress
                        value={system.overall_progress ?? 0}
                        className="mt-2"
                        label={`${system.system_name} 整體進度`}
                      />
                    </button>
                  ))}
                  {!stationSystems.length && <div className="py-8 text-center text-xs text-[#a9c0d1]">目前沒有機台</div>}
                </div>
              </section>
            );
          })}
          </div>
        </div>
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
