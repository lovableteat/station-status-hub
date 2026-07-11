import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Expand,
  Factory,
  Filter,
  Hourglass,
  Minimize2,
  Search,
  Server,
  TimerReset,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { MaintenanceLoading } from "@/components/maintenance/MaintenanceLoading";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { MaintenanceProjectSetup } from "@/components/maintenance/MaintenanceProjectSetup";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { cn } from "@/lib/utils";

type MonitorState = "active" | "completed" | "error" | "waiting";
type MonitorFilter = "all" | MonitorState;

const STATE_COPY: Record<MonitorState, string> = {
  active: "進行中",
  completed: "已完成",
  error: "異常",
  waiting: "待開始",
};

const KPI_TONES = {
  blue: "border-blue-300/35 bg-[#0c213b] text-blue-200",
  emerald: "border-emerald-300/35 bg-[#0b2828] text-emerald-200",
  neutral: "border-slate-300/25 bg-[#102136] text-slate-200",
  rose: "border-rose-300/40 bg-[#2b1822] text-rose-200",
  amber: "border-amber-300/40 bg-[#2b2415] text-amber-200",
} as const;

const CARD_TONES: Record<MonitorState, string> = {
  active:
    "border-blue-300/35 bg-[linear-gradient(145deg,rgba(27,65,112,0.62),rgba(8,26,45,0.96))] shadow-[inset_3px_0_0_#4c8dff]",
  completed:
    "border-emerald-300/35 bg-[linear-gradient(145deg,rgba(16,73,64,0.55),rgba(7,31,35,0.96))] shadow-[inset_3px_0_0_#38d39f]",
  error:
    "border-rose-300/45 bg-[linear-gradient(145deg,rgba(93,31,49,0.7),rgba(38,14,26,0.96))] shadow-[inset_3px_0_0_#fb5d75]",
  waiting:
    "border-[#365d78] bg-[linear-gradient(145deg,rgba(23,48,72,0.7),rgba(8,24,40,0.96))] shadow-[inset_3px_0_0_#6f91a8]",
};

function MonitorKpi({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: keyof typeof KPI_TONES;
  value: number;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3", KPI_TONES[tone])}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/20">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-[#aac2d2]">{label}</div>
        <div className="font-data mt-0.5 text-2xl font-semibold text-[#f3f8fc]">
          {value}<small className="ml-1 text-xs font-normal text-[#9eb8ca]">台</small>
        </div>
        <div className="truncate text-[11px] text-[#8fb0c5]">{detail}</div>
      </div>
    </div>
  );
}

function isDoneStatus(status?: string | null) {
  return status === "Done" || status === "Completed" || status === "已完成";
}

function isErrorStatus(status?: string | null) {
  return status === "Error" || status === "Blocked" || status === "異常";
}

function formatDuration(milliseconds: number) {
  if (!milliseconds || milliseconds < 0) return "--";
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${remainingMinutes}m`;
}

function formatClock(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (!isToday) {
    return new Intl.DateTimeFormat("zh-TW", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);
}

export function ProductionMonitor() {
  const { activeProject } = useTestProject();
  const { isLoading, progress, stations, systems, testItems } = useUnifiedData();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonitorFilter>("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [engineerFilter, setEngineerFilter] = useState("all");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const sortedStations = useMemo(
    () => [...stations].sort((left, right) => left.station_order - right.station_order),
    [stations]
  );

  const itemsByStation = useMemo(() => {
    const grouped = new Map<string, (typeof testItems)[number][]>();
    testItems.forEach((item) => {
      const stationItems = grouped.get(item.station_id) ?? [];
      stationItems.push(item);
      grouped.set(item.station_id, stationItems);
    });
    return grouped;
  }, [testItems]);

  const progressBySystem = useMemo(() => {
    const grouped = new Map<string, (typeof progress)[number][]>();
    progress.forEach((entry) => {
      const systemProgress = grouped.get(entry.system_id) ?? [];
      systemProgress.push(entry);
      grouped.set(entry.system_id, systemProgress);
    });
    return grouped;
  }, [progress]);

  const systemViews = useMemo(() => {
    const getStationProgress = (systemId: string, stationId: string) => {
      const stationItems = itemsByStation.get(stationId) ?? [];
      if (!stationItems.length) return 0;
      const completedItemIds = new Set(
        (progressBySystem.get(systemId) ?? [])
          .filter((entry) => entry.station_id === stationId && isDoneStatus(entry.status))
          .map((entry) => entry.item_id)
      );
      return Math.round(
        (stationItems.filter((item) => completedItemIds.has(item.id)).length / stationItems.length) *
          100
      );
    };

    return systems.map((system) => {
      const systemProgress = progressBySystem.get(system.id) ?? [];
      const hasError = systemProgress.some((entry) => isErrorStatus(entry.status));
      let state: MonitorState = "waiting";
      if (hasError) {
        state = "error";
      } else if (isDoneStatus(system.status) || system.overall_progress === 100) {
        state = "completed";
      } else if (
        system.status === "On-going" ||
        system.status === "進行中" ||
        (system.overall_progress ?? 0) > 0
      ) {
        state = "active";
      }

      const exactStation = sortedStations.find(
        (station) => station.station_name === system.current_station
      );
      const firstIncomplete = sortedStations.find(
        (station) => getStationProgress(system.id, station.id) < 100
      );
      const laneStation = exactStation ?? firstIncomplete ?? sortedStations[0];
      const laneId = state === "completed" ? "completed" : laneStation?.id ?? "unassigned";
      const laneIndex = laneStation
        ? sortedStations.findIndex((station) => station.id === laneStation.id)
        : -1;
      const nextStation = laneIndex >= 0 ? sortedStations[laneIndex + 1]?.station_name : undefined;
      const stationProgress = laneStation
        ? getStationProgress(system.id, laneStation.id)
        : system.overall_progress ?? 0;
      const stationEntries = laneStation
        ? systemProgress.filter((entry) => entry.station_id === laneStation.id)
        : systemProgress;
      const activeStationEntries = stationEntries.filter(
        (entry) => !isDoneStatus(entry.status) && entry.started_at
      );
      const startCandidates = activeStationEntries
        .map((entry) => entry.started_at)
        .filter((value): value is string => Boolean(value));
      const startAt = startCandidates.length
        ? startCandidates.reduce((earliest, value) =>
            Date.parse(value) < Date.parse(earliest) ? value : earliest
          )
        : undefined;
      const updateCandidates = stationEntries
        .flatMap((entry) => [entry.updated_at, entry.completed_at, entry.started_at])
        .filter((value): value is string => Boolean(value));
      const lastUpdate = updateCandidates.length
        ? updateCandidates.reduce((latest, value) =>
            Date.parse(value) > Date.parse(latest) ? value : latest
          )
        : startAt;
      const startTime = startAt ? Date.parse(startAt) : Number.NaN;
      const elapsedMs = Number.isNaN(startTime) ? 0 : Math.max(0, now - startTime);
      const stationItems = laneStation ? itemsByStation.get(laneStation.id) ?? [] : [];
      const estimatedMinutes = laneStation?.estimated_hours
        ? laneStation.estimated_hours * 60
        : stationItems.reduce((sum, item) => sum + (item.estimated_minutes ?? 30), 0);
      const estimatedMs = Math.max(estimatedMinutes || 60, 1) * 60_000;
      const overdue =
        (state === "active" || state === "error") &&
        elapsedMs > 0 &&
        elapsedMs > estimatedMs;

      return {
        elapsedMs,
        estimatedMs,
        laneId,
        laneStationId: laneStation?.id ?? null,
        lastUpdate,
        nextStation,
        overdue,
        state,
        stationProgress,
        system,
      };
    });
  }, [itemsByStation, now, progressBySystem, sortedStations, systems]);

  const engineers = useMemo(
    () =>
      Array.from(
        new Set(systems.map((system) => system.assigned_engineer).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right, "zh-TW")),
    [systems]
  );

  const filteredViews = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return systemViews.filter((view) => {
      const { system } = view;
      const matchesKeyword =
        !keyword ||
        system.system_name.toLowerCase().includes(keyword) ||
        system.serial_number?.toLowerCase().includes(keyword) ||
        system.assigned_engineer?.toLowerCase().includes(keyword);
      const matchesState = statusFilter === "all" || statusFilter === view.state;
      const matchesStation = stationFilter === "all" || stationFilter === view.laneId;
      const matchesEngineer =
        engineerFilter === "all" || system.assigned_engineer === engineerFilter;
      return (
        matchesKeyword &&
        matchesState &&
        matchesStation &&
        matchesEngineer &&
        (!onlyErrors || view.state === "error") &&
        (!onlyOverdue || view.overdue)
      );
    });
  }, [engineerFilter, onlyErrors, onlyOverdue, searchTerm, stationFilter, statusFilter, systemViews]);

  const stateCounts = useMemo(
    () =>
      systemViews.reduce(
        (counts, view) => {
          counts[view.state] += 1;
          if (view.overdue) counts.overdue += 1;
          return counts;
        },
        { active: 0, completed: 0, error: 0, overdue: 0, waiting: 0 }
      ),
    [systemViews]
  );

  const lanes = useMemo(() => {
    const nextLanes = sortedStations.map((station) => ({
      id: station.id,
      label: station.station_name,
      stationId: station.id as string | null,
    }));
    if (systems.length) {
      nextLanes.push({ id: "completed", label: "最近完成", stationId: null });
    }
    if (!sortedStations.length && systems.length) {
      nextLanes.unshift({ id: "unassigned", label: "未分配站點", stationId: null });
    }
    return nextLanes;
  }, [sortedStations, systems.length]);

  const selectedView = systemViews.find((view) => view.system.id === selectedSystemId) ?? null;

  const toggleFullscreen = async () => {
    if (!rootRef.current) return;
    if (!document.fullscreenElement) {
      await rootRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const navigate = (module: string, params?: Record<string, string>) => {
    window.dispatchEvent(new CustomEvent("navigate", { detail: { module, params } }));
  };

  if (isLoading) {
    return <MaintenanceLoading label="載入生產監控資料" />;
  }

  if (!systems.length) {
    return (
      <div className="maintenance-page space-y-3">
        <MaintenancePageHeader
          icon={Factory}
          title="生產監控牆"
          description={`${activeProject?.name || "目前專案"} · 尚未加入機台`}
        />
        <MaintenanceProjectSetup
          projectName={activeProject?.name || "目前專案"}
          hasPublishedFlow={sortedStations.length > 0}
          onOpenFlow={() => navigate("flow-info")}
          actions={
            <Button className="bg-[#4c8dff] text-white hover:bg-[#3c79e8]" onClick={() => navigate("test-tracker")}>
              <Server className="mr-2 h-4 w-4" />
              前往新增機台
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "maintenance-page space-y-3",
        isFullscreen && "min-h-screen overflow-auto bg-[#06111f] p-4"
      )}
    >
      <MaintenancePageHeader
        icon={Factory}
        title="生產監控牆"
        description={`${activeProject?.name || "目前專案"} · ${systems.length} 台機台即時狀態`}
        actions={
          <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="mr-2 h-4 w-4" />
            ) : (
              <Expand className="mr-2 h-4 w-4" />
            )}
            {isFullscreen ? "離開全螢幕" : "全螢幕"}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <MonitorKpi
          icon={Server}
          label="總機台"
          value={systems.length}
          detail="全部專案機台"
          tone="neutral"
        />
        <MonitorKpi
          icon={Clock3}
          label="進行中"
          value={stateCounts.active}
          detail={`占比 ${Math.round((stateCounts.active / systems.length) * 100)}%`}
          tone="blue"
        />
        <MonitorKpi
          icon={CheckCircle2}
          label="已完成"
          value={stateCounts.completed}
          detail={`占比 ${Math.round((stateCounts.completed / systems.length) * 100)}%`}
          tone="emerald"
        />
        <MonitorKpi
          icon={AlertTriangle}
          label="異常"
          value={stateCounts.error}
          detail={stateCounts.error ? "需要立即處理" : "目前無阻塞"}
          tone="rose"
        />
        <MonitorKpi
          icon={TimerReset}
          label="測站超時"
          value={stateCounts.overdue}
          detail={stateCounts.overdue ? "已超過站點預估工時" : "皆在預估時間內"}
          tone="amber"
        />
      </section>

      <div className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))}
            className="h-9 border-[#2a526f] bg-[#071522] pl-9 text-[#f3f8fc]"
            placeholder="搜尋機台、序號或工程師"
          />
        </div>
        <Select value={stationFilter} onValueChange={setStationFilter}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部站點</SelectItem>
            {sortedStations.map((station) => (
              <SelectItem key={station.id} value={station.id}>{station.station_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MonitorFilter)}>
          <SelectTrigger className="h-9 w-[135px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="active">進行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="error">異常</SelectItem>
            <SelectItem value="waiting">待開始</SelectItem>
          </SelectContent>
        </Select>
        <Select value={engineerFilter} onValueChange={setEngineerFilter}>
          <SelectTrigger className="h-9 w-[145px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工程師</SelectItem>
            {engineers.map((engineer) => <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          type="button"
          aria-pressed={onlyErrors}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
            onlyErrors
              ? "border-rose-300/55 bg-rose-300/15 text-rose-100"
              : "border-[#2a526f] bg-[#0b1b2d] text-[#b8cfdd] hover:bg-[#10263a]"
          )}
          onClick={() => setOnlyErrors((current) => !current)}
        >
          <AlertTriangle className="h-3.5 w-3.5" />只看異常
        </button>
        <button
          type="button"
          aria-pressed={onlyOverdue}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
            onlyOverdue
              ? "border-amber-300/55 bg-amber-300/15 text-amber-100"
              : "border-[#2a526f] bg-[#0b1b2d] text-[#b8cfdd] hover:bg-[#10263a]"
          )}
          onClick={() => setOnlyOverdue((current) => !current)}
        >
          <Hourglass className="h-3.5 w-3.5" />只看超時
        </button>
        <Badge variant="outline" className="font-data ml-auto h-8 rounded-lg border-blue-300/35 bg-blue-300/10 px-3 text-blue-100">
          {filteredViews.length} 台
        </Badge>
      </div>

      <div className="flex min-h-[455px] gap-2.5 overflow-x-auto pb-2">
        {lanes.map((lane) => {
          const laneViews = filteredViews.filter((view) => view.laneId === lane.id);
          const averageElapsed = laneViews.length
            ? laneViews.reduce((sum, view) => sum + view.elapsedMs, 0) / laneViews.length
            : 0;
          const overdueCount = laneViews.filter((view) => view.overdue).length;
          const isCompletedLane = lane.id === "completed";

          return (
            <section
              key={lane.id}
              className={cn(
                "maintenance-panel min-w-[280px] flex-1 basis-[320px] overflow-hidden",
                isCompletedLane && "border-emerald-300/30"
              )}
            >
              <div className={cn(
                "border-b border-[#2a526f]/70 px-3 py-3",
                isCompletedLane ? "bg-[#0c2929]" : "bg-[#10263a]"
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">{lane.label}</h2>
                      <Badge variant="outline" className="font-data h-5 rounded-md border-blue-300/30 bg-blue-300/10 px-1.5 text-[10px] text-blue-100">
                        {laneViews.length}
                      </Badge>
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-[#8fb0c5]">
                      <span>
                        {isCompletedLane
                          ? `已完成 ${laneViews.length} 台`
                          : `平均停留 ${formatDuration(averageElapsed)}`}
                      </span>
                      <span className={overdueCount ? "text-amber-200" : "text-emerald-200"}>
                        超時 {overdueCount} 台
                      </span>
                    </div>
                  </div>
                  <Filter className="h-4 w-4 shrink-0 text-[#7698ae]" />
                </div>
              </div>

              <div className="max-h-[calc(100vh-365px)] min-h-[350px] space-y-2 overflow-y-auto p-2">
                {laneViews.map((view) => {
                  const { system } = view;
                  const displayProgress = isCompletedLane
                    ? system.overall_progress ?? 100
                    : view.stationProgress;
                  const tone = view.overdue ? CARD_TONES.error : CARD_TONES[view.state];
                  return (
                    <button
                      key={system.id}
                      type="button"
                      onClick={() => setSelectedSystemId(system.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left transition-[border-color,transform,background-color] hover:-translate-y-px hover:border-cyan-200/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                        tone
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</div>
                          <div className="font-data mt-0.5 truncate text-[10px] text-[#94afc0]">
                            SN: {system.serial_number || "未設定"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={cn(
                            "font-data text-xl font-semibold",
                            view.overdue || view.state === "error"
                              ? "text-rose-200"
                              : view.state === "completed"
                                ? "text-emerald-200"
                                : "text-blue-200"
                          )}>
                            {displayProgress}%
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 rounded-md px-1.5 text-[9px]",
                              view.overdue
                                ? "border-rose-300/45 bg-rose-300/15 text-rose-100"
                                : "border-white/15 bg-black/15 text-[#d8e6f0]"
                            )}
                          >
                            {view.overdue ? "已超時" : STATE_COPY[view.state]}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#b5cad8]">
                        <UserRound className="h-3.5 w-3.5" />
                        <span className="truncate">工程師：{system.assigned_engineer || "未指定"}</span>
                      </div>
                      <Progress
                        value={displayProgress}
                        className={cn(
                          "mt-2 h-1.5 bg-[#173149]",
                          view.overdue
                            ? "[&>div]:bg-[#fb5d75]"
                            : view.state === "completed"
                              ? "[&>div]:bg-[#38d39f]"
                              : "[&>div]:bg-[#4c8dff]"
                        )}
                      />
                      <div className="font-data mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-white/10 pt-2 text-[9px] text-[#8faabb]">
                        <span>
                          {isCompletedLane
                            ? `完成 ${formatClock(view.lastUpdate)}`
                            : `已停留 ${formatDuration(view.elapsedMs)}`}
                        </span>
                        <span className="truncate">下一站 {isCompletedLane ? "--" : view.nextStation || "--"}</span>
                        <span>更新 {formatClock(view.lastUpdate)}</span>
                      </div>
                    </button>
                  );
                })}

                {!laneViews.length && (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[#2a526f] bg-[#071522]/70 px-4 text-center">
                    <Server className="h-8 w-8 text-[#476b83]" />
                    <p className="mt-3 text-sm font-medium text-[#9eb8ca]">目前無機台</p>
                    <p className="mt-1 text-[11px] text-[#6f91a8]">調整篩選條件或等待機台進站</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={Boolean(selectedView)} onOpenChange={(open) => !open && setSelectedSystemId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#2a526f] bg-[#071522] sm:max-w-[560px]">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3 pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <Server className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-xl text-[#f3f8fc]">{selectedView?.system.system_name}</SheetTitle>
                <SheetDescription className="mt-1 text-[#a9c0d1]">
                  {selectedView?.system.serial_number || "無序號"} · {selectedView?.system.assigned_engineer || "未指定工程師"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {selectedView && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="maintenance-panel-raised p-3">
                  <div className="text-[10px] text-[#8fb0c5]">狀態</div>
                  <div className="mt-1 text-sm font-semibold text-[#f3f8fc]">
                    {selectedView.overdue ? "站點超時" : STATE_COPY[selectedView.state]}
                  </div>
                </div>
                <div className="maintenance-panel-raised p-3">
                  <div className="text-[10px] text-[#8fb0c5]">站點停留</div>
                  <div className="font-data mt-1 text-sm font-semibold text-[#f3f8fc]">{formatDuration(selectedView.elapsedMs)}</div>
                </div>
                <div className="maintenance-panel-raised p-3">
                  <div className="text-[10px] text-[#8fb0c5]">預估工時</div>
                  <div className="font-data mt-1 text-sm font-semibold text-[#f3f8fc]">{formatDuration(selectedView.estimatedMs)}</div>
                </div>
              </div>

              <div className="maintenance-panel-raised p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#a9c0d1]">整體進度</span>
                  <span className="font-data text-lg text-[#f3f8fc]">{selectedView.system.overall_progress ?? 0}%</span>
                </div>
                <Progress value={selectedView.system.overall_progress ?? 0} className="mt-2 h-2 [&>div]:bg-[#4c8dff]" />
              </div>

              <div className="space-y-2">
                {sortedStations.map((station, index) => {
                  const stationItems = itemsByStation.get(station.id) ?? [];
                  const completedItemIds = new Set(
                    (progressBySystem.get(selectedView.system.id) ?? [])
                      .filter((entry) => entry.station_id === station.id && isDoneStatus(entry.status))
                      .map((entry) => entry.item_id)
                  );
                  const percent = stationItems.length
                    ? Math.round((stationItems.filter((item) => completedItemIds.has(item.id)).length / stationItems.length) * 100)
                    : 0;
                  return (
                    <div key={station.id} className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-data flex h-6 w-6 items-center justify-center rounded-md bg-[#10263a] text-xs text-cyan-100">{index + 1}</span>
                          <span className="truncate text-sm font-medium text-[#f3f8fc]">{station.station_name}</span>
                        </div>
                        <span className="font-data text-xs text-[#d8e6f0]">{percent}%</span>
                      </div>
                      <Progress value={percent} className="mt-2 h-1.5 [&>div]:bg-[#4c8dff]" />
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                className="w-full border-rose-300/35 bg-rose-300/[0.07] text-rose-100 hover:bg-rose-300/15 hover:text-rose-50"
                onClick={() => navigate("issues", { system: selectedView.system.system_name })}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />查看或回報此機台問題
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
