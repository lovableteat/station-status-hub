import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Download,
  FileCode2,
  Gauge,
  LayoutDashboard,
  Server,
  TrendingUp,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { MaintenanceLoading } from "@/components/maintenance/MaintenanceLoading";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { MaintenanceProjectSetup } from "@/components/maintenance/MaintenanceProjectSetup";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { ExportDialog } from "@/components/production/ExportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { exportSiteArchiveHtml } from "@/utils/siteArchiveExport";

interface DashboardProps {
  onNavigate?: (module: string, params?: Record<string, string>) => void;
}

const KPI_TONES = {
  blue: "border-blue-300/30 bg-[#0d2139] text-blue-200",
  cyan: "border-cyan-300/30 bg-[#0b2434] text-cyan-200",
  emerald: "border-emerald-300/30 bg-[#0c2828] text-emerald-200",
  rose: "border-rose-300/30 bg-[#2b1822] text-rose-200",
} as const;

function normalizeStatus(system: {
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
    return "completed";
  }
  if (
    system.status === "On-going" ||
    system.status === "進行中" ||
    (system.overall_progress ?? 0) > 0
  ) {
    return "active";
  }
  return "waiting";
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildTrendPoints(values: number[], maxValue: number) {
  return values.map((value, index) => ({
    x: values.length <= 1 ? 50 : (index / (values.length - 1)) * 100,
    y: 100 - (value / maxValue) * 100,
  }));
}

function ExecutiveKpi({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof Server;
  label: string;
  tone: keyof typeof KPI_TONES;
  value: string | number;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3", KPI_TONES[tone])}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/20">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-[#a9c0d1]">{label}</div>
        <div className="font-data mt-0.5 text-2xl font-semibold text-[#f3f8fc]">{value}</div>
        <div className="truncate text-[11px] text-[#8fb0c5]">{detail}</div>
      </div>
    </div>
  );
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const {
    isLoading,
    progress,
    stationContents,
    stations,
    systems,
    testItems,
  } = useUnifiedData();
  const { activeProject, activeProjectId } = useTestProject();
  const { user } = useUser();
  const { toast } = useToast();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isArchiveExporting, setIsArchiveExporting] = useState(false);
  const [issueCounts, setIssueCounts] = useState({ critical: 0, open: 0 });

  useEffect(() => {
    if (!activeProjectId) {
      setIssueCounts({ critical: 0, open: 0 });
      return;
    }

    supabase
      .from("issues")
      .select("priority, status")
      .eq("project_id", activeProjectId)
      .then(({ data }) => {
        const openIssues = (data ?? []).filter(
          (issue) => !["resolved", "closed"].includes(issue.status ?? "open")
        );
        setIssueCounts({
          critical: openIssues.filter((issue) => issue.priority === "critical").length,
          open: openIssues.length,
        });
      });
  }, [activeProjectId]);

  const includedSystems = useMemo(
    () => systems.filter((system) => !system.exclude_from_dashboard),
    [systems]
  );
  const statusCounts = useMemo(
    () =>
      includedSystems.reduce(
        (counts, system) => {
          counts[normalizeStatus(system)] += 1;
          return counts;
        },
        { active: 0, completed: 0, waiting: 0 }
      ),
    [includedSystems]
  );
  const completionRate = includedSystems.length
    ? Math.round((statusCounts.completed / includedSystems.length) * 100)
    : 0;
  const portfolioProgress = includedSystems.length
    ? Math.round(
        (includedSystems.reduce((sum, system) => sum + (system.overall_progress ?? 0), 0) /
          includedSystems.length) *
          10
      ) / 10
    : 0;

  const dailyCompletion = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        count: 0,
        date,
        key: date.toISOString().slice(0, 10),
        label: formatShortDate(date),
      };
    });
    const completedSystemsByDate = new Map<string, Set<string>>();
    progress.forEach((entry) => {
      if (entry.status !== "Done" || !entry.completed_at) return;
      const key = entry.completed_at.slice(0, 10);
      if (!completedSystemsByDate.has(key)) completedSystemsByDate.set(key, new Set());
      completedSystemsByDate.get(key)?.add(entry.system_id);
    });
    days.forEach((day) => {
      day.count = completedSystemsByDate.get(day.key)?.size ?? 0;
    });
    return days;
  }, [progress]);
  const sevenDayOutput = dailyCompletion.reduce((sum, day) => sum + day.count, 0);
  const dailyAverage = sevenDayOutput / dailyCompletion.length;
  const peakDay = dailyCompletion.reduce(
    (peak, day) => (day.count > peak.count ? day : peak),
    dailyCompletion[0]
  );
  const dailyPeak = Math.max(...dailyCompletion.map((day) => day.count), 0);
  const chartTickStep = Math.max(1, Math.ceil(dailyPeak / 4));
  const chartYAxisMax = chartTickStep * 4;
  const chartAxisTicks = Array.from(
    { length: 5 },
    (_, index) => chartYAxisMax - chartTickStep * index
  );
  const trendPoints = buildTrendPoints(
    dailyCompletion.map((day) => day.count),
    chartYAxisMax
  );
  const trendPointString = trendPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const trendAreaPath = trendPoints.length
    ? `M 0 100 L ${trendPoints.map((point) => `${point.x} ${point.y}`).join(" L ")} L 100 100 Z`
    : "";
  const dailyAverageY = 100 - (dailyAverage / chartYAxisMax) * 100;

  const stationRows = useMemo(() => {
    const sortedStations = [...stations].sort(
      (left, right) => left.station_order - right.station_order
    );
    const includedSystemIds = new Set(includedSystems.map((system) => system.id));
    const itemsByStation = new Map(
      sortedStations.map((station) => [
        station.id,
        testItems.filter((item) => item.station_id === station.id),
      ])
    );
    const completedItemKeys = new Set(
      progress
        .filter(
          (entry) =>
            includedSystemIds.has(entry.system_id) &&
            entry.status === "Done" &&
            Boolean(entry.item_id)
        )
        .map((entry) => `${entry.system_id}:${entry.item_id}`)
    );
    const stationCompletion = (systemId: string, stationId: string) => {
      const stationItems = itemsByStation.get(stationId) ?? [];
      if (!stationItems.length) return 100;
      const completedCount = stationItems.filter((item) =>
        completedItemKeys.has(`${systemId}:${item.id}`)
      ).length;
      return Math.round((completedCount / stationItems.length) * 100);
    };
    const queueByStation = new Map(sortedStations.map((station) => [station.id, 0]));

    includedSystems.forEach((system) => {
      if (normalizeStatus(system) === "completed") return;
      const declaredStation = sortedStations.find(
        (station) => station.station_name === system.current_station
      );
      const currentStation =
        declaredStation ??
        sortedStations.find((station) => stationCompletion(system.id, station.id) < 100);
      if (currentStation) {
        queueByStation.set(currentStation.id, (queueByStation.get(currentStation.id) ?? 0) + 1);
      }
    });

    return sortedStations.map((station) => {
      const stationItems = itemsByStation.get(station.id) ?? [];
      const possibleRecords = includedSystems.length * stationItems.length;
      const completedRecords = progress.filter(
        (entry) =>
          includedSystemIds.has(entry.system_id) &&
          entry.station_id === station.id &&
          entry.status === "Done"
      ).length;
      const averageProgress = possibleRecords
        ? Math.min(100, Math.round((completedRecords / possibleRecords) * 100))
        : 0;
      const hours =
        stationItems.reduce((sum, item) => sum + (item.estimated_minutes ?? 30), 0) / 60;
      const queue = queueByStation.get(station.id) ?? 0;
      return {
        averageProgress,
        completedRecords,
        hours,
        id: station.id,
        itemCount: stationItems.length,
        name: station.station_name,
        possibleRecords,
        queue,
        workloadHours: queue * hours,
      };
    });
  }, [includedSystems, progress, stations, testItems]);
  const bottleneckStation = stationRows.some((station) => station.queue > 0)
    ? [...stationRows].sort(
        (left, right) =>
          right.workloadHours - left.workloadHours ||
          right.queue - left.queue ||
          right.hours - left.hours
      )[0]
    : null;
  const stationQueueTotal = stationRows.reduce((sum, station) => sum + station.queue, 0);
  const stationWorkloadTotal = stationRows.reduce(
    (sum, station) => sum + station.workloadHours,
    0
  );
  const stationWorkloadMax = Math.max(
    ...stationRows.map((station) => station.workloadHours),
    0
  );
  const attentionSystems = useMemo(
    () =>
      includedSystems
        .filter((system) => normalizeStatus(system) !== "completed")
        .sort(
          (left, right) =>
            (left.overall_progress ?? 0) - (right.overall_progress ?? 0) ||
            left.system_name.localeCompare(right.system_name, "zh-Hant")
        )
        .slice(0, 6),
    [includedSystems]
  );

  const handleArchiveExport = async () => {
    if (isArchiveExporting) return;
    setIsArchiveExporting(true);
    try {
      const { warnings } = await exportSiteArchiveHtml({
        exportedBy: user?.username,
        progress,
        stationContents,
        stations,
        systems,
        testItems,
      });
      toast({
        title: "HTML 封存已匯出",
        description: warnings.length
          ? `封存完成，另有 ${warnings.length} 個區塊需要人工確認。`
          : "目前專案已產生離線封存檔。",
      });
    } catch (error) {
      toast({
        title: "封存匯出失敗",
        description: error instanceof Error ? error.message : "請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsArchiveExporting(false);
    }
  };

  if (isLoading) {
    return <MaintenanceLoading label="正在載入管理儀表板" />;
  }

  if (!includedSystems.length) {
    return (
      <div className="maintenance-page space-y-3" data-dashboard-content>
        <MaintenancePageHeader
          icon={LayoutDashboard}
          title="系統儀表板"
          description={`${activeProject?.name || "目前專案"} · 尚未加入機台`}
        />
        <MaintenanceProjectSetup
          projectName={activeProject?.name || "目前專案"}
          hasPublishedFlow={stations.length > 0}
          onOpenFlow={() => onNavigate?.("flow-info")}
          actions={
            <Button onClick={() => onNavigate?.("test-tracker")}>
              前往 L10 測試追蹤
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="maintenance-page space-y-3" data-dashboard-content>
      <MaintenancePageHeader
        icon={LayoutDashboard}
        title="系統儀表板"
        description={`${activeProject?.name || "目前專案"} · 管理層專案總覽`}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <Download className="mr-2 h-4 w-4" />匯出管理報表
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                <Download className="mr-2 h-4 w-4" />專案資料報表
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchiveExport} disabled={isArchiveExporting}>
                <FileCode2 className="mr-2 h-4 w-4" />HTML 離線封存
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ExecutiveKpi icon={Server} label="專案機台" value={includedSystems.length} detail="納入管理報表" tone="blue" />
        <ExecutiveKpi icon={Gauge} label="平均測試進度" value={`${portfolioProgress}%`} detail={`${statusCounts.active} 台進行中`} tone="cyan" />
        <ExecutiveKpi icon={CheckCircle2} label="已完成" value={statusCounts.completed} detail={`交付完成率 ${completionRate}%`} tone="emerald" />
        <ExecutiveKpi icon={AlertTriangle} label="待處理問題" value={issueCounts.open} detail={`${issueCounts.critical} 件高優先`} tone="rose" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="maintenance-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">整體交付進度</h2>
              <p className="mt-1 text-xs text-[#9eb8ca]">已完成機台占全部專案機台比例</p>
            </div>
            <Badge variant="outline" className="border-cyan-300/35 bg-cyan-300/10 text-cyan-100">即時</Badge>
          </div>
          <div className="mt-5 flex items-center gap-5">
            <div
              className="grid h-36 w-36 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#39c6e8 ${completionRate * 3.6}deg, #17334a 0deg)`,
              }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-[#0b1b2d] text-center">
                <div>
                  <div className="font-data text-3xl font-semibold text-[#f3f8fc]">{completionRate}%</div>
                  <div className="mt-1 text-xs text-[#9eb8ca]">{statusCounts.completed}/{includedSystems.length} 台</div>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2"><span className="text-emerald-100">已完成</span><strong className="font-data text-emerald-100">{statusCounts.completed}</strong></div>
              <div className="flex items-center justify-between rounded-lg border border-blue-300/20 bg-blue-300/[0.07] px-3 py-2"><span className="text-blue-100">進行中</span><strong className="font-data text-blue-100">{statusCounts.active}</strong></div>
              <div className="flex items-center justify-between rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2"><span className="text-amber-100">未開始</span><strong className="font-data text-amber-100">{statusCounts.waiting}</strong></div>
            </div>
          </div>
        </section>

        <section className="maintenance-panel overflow-hidden p-5" data-testid="dashboard-output-trend">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                <h2 className="text-base font-semibold text-[#f3f8fc]">近七日產出趨勢</h2>
              </div>
              <p className="mt-1 text-xs text-[#9eb8ca]">每日有完成測項的不同機台數</p>
            </div>
            <div className="flex divide-x divide-[#2a526f]/70 rounded-xl border border-[#2a526f]/70 bg-[#071522]/65">
              <div className="min-w-[84px] px-3 py-2 text-right">
                <div className="text-[10px] text-[#8fb0c5]">七日總產出</div>
                <div className="font-data mt-0.5 text-lg font-semibold text-cyan-100">{sevenDayOutput}<small className="ml-1 text-[10px] font-normal text-[#9eb8ca]">台</small></div>
              </div>
              <div className="min-w-[84px] px-3 py-2 text-right">
                <div className="text-[10px] text-[#8fb0c5]">每日平均</div>
                <div className="font-data mt-0.5 text-lg font-semibold text-[#f3f8fc]">{dailyAverage.toFixed(1)}<small className="ml-1 text-[10px] font-normal text-[#9eb8ca]">台</small></div>
              </div>
              <div className="min-w-[92px] px-3 py-2 text-right">
                <div className="text-[10px] text-[#8fb0c5]">單日高峰</div>
                <div className="font-data mt-0.5 text-lg font-semibold text-[#f3f8fc]">{peakDay.count}<small className="ml-1 text-[10px] font-normal text-[#9eb8ca]">台 · {peakDay.label}</small></div>
              </div>
            </div>
          </div>
          <figure
            className="mt-3 w-full min-w-0 rounded-xl border border-[#234963]/65 bg-[#071522]/45 px-3 py-2.5"
            aria-label={`近七日產出折線圖，總產出 ${sevenDayOutput} 台，每日平均 ${dailyAverage.toFixed(1)} 台`}
          >
            <figcaption className="sr-only">
              近七日每日完成機台數：{dailyCompletion.map((day) => `${day.label} ${day.count} 台`).join("、")}
            </figcaption>
            <div className="grid h-[150px] grid-cols-[28px_minmax(0,1fr)] gap-2">
              <div className="relative mb-2 mt-5" aria-hidden="true">
                {chartAxisTicks.map((tick, index) => (
                  <span
                    key={tick}
                    className="font-data absolute right-0 -translate-y-1/2 text-[10px] text-[#8fb0c5]"
                    style={{ top: `${index * 25}%` }}
                  >
                    {tick}
                  </span>
                ))}
              </div>
              <div className="relative mb-2 mt-5 min-w-0">
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="dashboard-output-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                      <stop offset="72%" stopColor="#38bdf8" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {chartAxisTicks.map((tick, index) => (
                    <line
                      key={tick}
                      x1="0"
                      x2="100"
                      y1={index * 25}
                      y2={index * 25}
                      stroke="#284b65"
                      strokeDasharray="3 6"
                      strokeOpacity="0.72"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <path d={trendAreaPath} fill="url(#dashboard-output-area)" />
                  <polyline
                    points={trendPointString}
                    fill="none"
                    stroke="#38bdf8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {dailyAverage > 0 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-amber-300/70"
                    style={{ top: `${dailyAverageY}%` }}
                    aria-hidden="true"
                  >
                    <span className="font-data absolute right-1 -top-5 rounded bg-[#152437] px-1.5 py-0.5 text-[9px] text-amber-100">
                      日均 {dailyAverage.toFixed(1)}
                    </span>
                  </div>
                )}

                {trendPoints.map((point, index) => {
                  const day = dailyCompletion[index];
                  return (
                    <span
                      key={day.key}
                      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 outline-none"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      tabIndex={0}
                      role="img"
                      title={`${day.label} 完成 ${day.count} 台`}
                      aria-label={`${day.label} 完成 ${day.count} 台`}
                    >
                      <span className="font-data absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-[#e0f7ff]">
                        {day.count}
                      </span>
                      <span className="block h-3 w-3 rounded-full border-2 border-cyan-200 bg-[#071522] ring-2 ring-cyan-400/15 transition-transform group-hover:scale-125 group-focus-visible:scale-125 group-focus-visible:ring-cyan-200" />
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2" aria-hidden="true">
              <span />
              <div className="grid grid-cols-7 text-center text-[10px] text-[#8fb0c5]">
                {dailyCompletion.map((day) => <span key={day.key}>{day.label}</span>)}
              </div>
            </div>
          </figure>
        </section>
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="maintenance-panel flex min-h-0 flex-col overflow-hidden" data-testid="dashboard-station-capacity">
          <div className="flex flex-col gap-3 border-b border-[#2a526f]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                <h2 className="text-base font-semibold text-[#f3f8fc]">站點產能與瓶頸</h2>
                <HoverCard openDelay={180} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      data-testid="dashboard-capacity-help"
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/[0.08] px-2 text-[11px] font-medium text-cyan-100 outline-none transition-colors hover:border-cyan-200/65 hover:bg-cyan-300/[0.14] focus-visible:ring-2 focus-visible:ring-cyan-200/75"
                      aria-label="查看站點產能與瓶頸的計算方式"
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                      計算方式
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    data-testid="dashboard-capacity-help-content"
                    align="start"
                    side="bottom"
                    className="z-[70] w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-[#3d718f] bg-[#071827] p-0 text-[#d9e8f2]"
                  >
                    <div className="border-b border-[#315d78]/70 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#f3f8fc]">
                        <Activity className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                        這區在估算什麼？
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-[#a9c0d1]">
                        只計入儀表板納管機台，依目前所在站點的排隊數與流程預估工時，找出最需要優先疏通的站點。這是流程工作量估算，不是設備即時利用率或 OEE。
                      </p>
                    </div>
                    <ol className="space-y-2.5 px-4 py-3 text-xs leading-5 text-[#c4d7e4]">
                      <li><strong className="text-cyan-100">1. 歸屬 WIP：</strong>未完成機台以目前站點為準；若未指定，歸到第一個尚未完成的站點。</li>
                      <li><strong className="text-cyan-100">2. 估算工作量：</strong>待處理工時 = WIP 台數 × 該站所有測項的預估工時總和。</li>
                      <li><strong className="text-cyan-100">3. 判定瓶頸：</strong>待處理工時最高者優先；同值時再比較 WIP 台數與單站預估工時。</li>
                    </ol>
                    <div className="border-t border-[#315d78]/70 px-4 py-2.5 text-[11px] text-[#8fb0c5]">
                      滑過任一站點卡，可查看該站當下代入的數字與完整公式。
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>
              <p className="mt-1 text-xs text-[#9eb8ca]">
                依 WIP × 單站預估工時判定；滑過卡片查看公式
                {bottleneckStation ? `，目前瓶頸為 ${bottleneckStation.name}` : "，目前沒有排隊瓶頸"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {bottleneckStation ? (
                <Badge variant="outline" className="border-amber-300/40 bg-amber-300/10 text-amber-100">
                  瓶頸 WIP {bottleneckStation.queue} 台
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300/35 bg-emerald-300/10 text-emerald-100">
                  目前順暢
                </Badge>
              )}
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                待處理 {stationWorkloadTotal.toFixed(1)}h
              </Badge>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 gap-2.5 p-3 md:grid-cols-2 2xl:grid-cols-4">
            {stationRows.map((station, index) => {
              const queueShare = stationQueueTotal
                ? Math.round((station.queue / stationQueueTotal) * 100)
                : 0;
              const workloadShare = stationWorkloadMax
                ? Math.round((station.workloadHours / stationWorkloadMax) * 100)
                : 0;
              const isBottleneck = station.id === bottleneckStation?.id && station.queue > 0;

              return (
                <HoverCard key={station.id} openDelay={220} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      data-testid={`station-capacity-card-${index}`}
                      aria-label={`查看 ${station.name}，目前 ${station.queue} 台 WIP，預估待處理 ${station.workloadHours.toFixed(1)} 小時；滑鼠停留可查看計算方式`}
                      className={cn(
                        "h-full min-w-0 rounded-xl border border-[#315d78]/75 bg-[#0a1c2e] px-3.5 py-3 text-left outline-none transition-colors hover:border-cyan-300/45 hover:bg-[#10283c] focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                        isBottleneck && "border-amber-300/55 bg-amber-300/[0.08] hover:border-amber-200/70 hover:bg-amber-300/[0.11]"
                      )}
                      onClick={() => onNavigate?.("test-tracker", { station: station.id })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={cn(
                            "font-data flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] text-xs text-cyan-100",
                            isBottleneck && "border-amber-300/35 bg-amber-300/10 text-amber-100"
                          )}>{index + 1}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#f3f8fc]">{station.name}</div>
                            <div className="mt-0.5 text-[10px] text-[#8fb0c5]">單站 {station.hours.toFixed(1)}h</div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={cn("font-data text-xl font-semibold text-cyan-100", isBottleneck && "text-amber-100")}>{station.queue}</div>
                          <div className="text-[10px] text-[#8fb0c5]">台 WIP</div>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-[#315d78]/55 pt-2.5">
                        <div className="flex items-center justify-between text-[10px] text-[#9eb8ca]">
                          <span>相對負載</span>
                          <span className={cn("font-data text-cyan-100", isBottleneck && "text-amber-100")}>{workloadShare}%</span>
                        </div>
                        <div
                          className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#06111f] ring-1 ring-inset ring-[#315d78]/65"
                          role="progressbar"
                          aria-label={`${station.name} 相對負載`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={workloadShare}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full bg-cyan-400 transition-[width] duration-200",
                              isBottleneck && "bg-amber-300"
                            )}
                            style={{ width: `${workloadShare}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                          <div className="flex items-center gap-1 text-[#8fb0c5]"><Clock3 className="h-3 w-3" aria-hidden="true" />待處理工時</div>
                          <div className="font-data mt-0.5 text-xs font-semibold text-[#d9e8f2]">{station.workloadHours.toFixed(1)}h</div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[#8fb0c5]"><TrendingUp className="h-3 w-3" aria-hidden="true" />平均完成</div>
                          <div className="font-data mt-0.5 text-xs font-semibold text-emerald-200">{station.averageProgress}%</div>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-[#315d78]/45 pt-2 text-[10px] text-[#8fb0c5]">
                        <span>WIP 占比 {queueShare}%</span>
                        <span className={cn(isBottleneck ? "text-amber-100" : "text-cyan-100")}>
                          {isBottleneck ? "優先疏通" : station.queue ? "持續監控" : "目前順暢"}
                        </span>
                      </div>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    data-testid={`station-capacity-formula-${index}`}
                    align="start"
                    side="right"
                    collisionPadding={12}
                    className="z-[70] w-[min(31rem,calc(100vw-2rem))] rounded-xl border border-[#3d718f] bg-[#071827] p-0 text-[#d9e8f2]"
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-[#315d78]/70 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-[#f3f8fc]">{station.name}</div>
                        <div className="mt-1 text-[11px] text-[#9eb8ca]">目前數值與計算基準</div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
                          isBottleneck && "border-amber-300/45 bg-amber-300/10 text-amber-100"
                        )}
                      >
                        {isBottleneck ? "目前瓶頸" : station.queue ? "持續監控" : "目前順暢"}
                      </Badge>
                    </div>
                    <dl className="px-4 py-2 text-xs">
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">WIP 台數</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          未完成且目前歸屬本站的機台，共 <strong className="font-data text-[#f3f8fc]">{station.queue} 台</strong>。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">單站預估工時</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {station.itemCount} 個測項的預估分鐘加總 ÷ 60 = <strong className="font-data text-[#f3f8fc]">{station.hours.toFixed(2)}h</strong>。未填預估時間的測項以 30 分鐘計。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">待處理工時</dt>
                        <dd className="font-data leading-5 text-[#f3f8fc]">
                          {station.queue} 台 × {station.hours.toFixed(2)}h = {station.workloadHours.toFixed(1)}h
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">相對負載</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {stationWorkloadMax ? (
                            <>本站 {station.workloadHours.toFixed(1)}h ÷ 站點最高 {stationWorkloadMax.toFixed(1)}h × 100 = <strong className="font-data text-[#f3f8fc]">{workloadShare}%</strong>。</>
                          ) : (
                            <>所有站點目前都沒有待處理工時，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">平均完成</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {station.possibleRecords ? (
                            <>已完成 {station.completedRecords} 筆 ÷（{includedSystems.length} 台 × {station.itemCount} 項，共 {station.possibleRecords} 筆）= <strong className="font-data text-[#f3f8fc]">{station.averageProgress}%</strong>，最高顯示 100%。</>
                          ) : (
                            <>本站尚未建立可計算的測項，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="font-medium text-cyan-100">WIP 占比</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {stationQueueTotal ? (
                            <>本站 {station.queue} 台 ÷ 全站 WIP {stationQueueTotal} 台 × 100 = <strong className="font-data text-[#f3f8fc]">{queueShare}%</strong>。</>
                          ) : (
                            <>目前沒有未完成機台列入 WIP，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="border-t border-[#315d78]/70 px-4 py-2.5 text-[11px] text-[#8fb0c5]">
                      點擊卡片會帶入此站點，前往 L10 測試追蹤查看機台明細。
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>
        </section>

        <section className="maintenance-panel flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2a526f]/70 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">管理層待辦</h2>
              <p className="mt-0.5 text-xs text-[#9eb8ca]">優先關注低進度機台</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.("test-tracker")}>查看全部</Button>
          </div>
          <div className="max-h-64 min-h-0 flex-1 divide-y divide-[#2a526f]/45 overflow-y-auto">
            {attentionSystems.slice(0, 5).map((system) => (
              <button
                key={system.id}
                type="button"
                className="w-full px-4 py-3 text-left hover:bg-[#10263a]"
                onClick={() => onNavigate?.("monitor", { system: system.system_name })}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</span>
                  <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[#8fb0c5]"><span className="truncate">{system.current_station || "尚未進站"}</span><span>{system.assigned_engineer || "未指定"}</span></div>
                <Progress value={system.overall_progress ?? 0} className="mt-2 h-1.5" />
              </button>
            ))}
          </div>
          <button type="button" className="flex w-full items-center justify-between border-t border-rose-300/25 bg-rose-300/[0.07] px-4 py-3 text-left hover:bg-rose-300/10" onClick={() => onNavigate?.("issues")}>
            <span className="flex items-center gap-2 text-sm text-rose-100"><AlertTriangle className="h-4 w-4" />高優先問題</span>
            <strong className="font-data text-xl text-rose-100">{issueCounts.critical}</strong>
          </button>
        </section>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title={`${activeProject?.name || "目前專案"} 管理報表`}
        data={systems}
        stations={stations}
        testItems={testItems}
        progress={progress}
      />
    </div>
  );
}
