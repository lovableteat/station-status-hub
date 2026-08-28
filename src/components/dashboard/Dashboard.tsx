import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
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

import { calculateDashboardMetrics } from "./dashboardMetrics";

interface DashboardProps {
  onNavigate?: (module: string, params?: Record<string, string>) => void;
}

const KPI_TONES = {
  blue: "border-blue-300/30 bg-[#0d2139] text-blue-200",
  cyan: "border-cyan-300/30 bg-[#0b2434] text-cyan-200",
  emerald: "border-emerald-300/30 bg-[#0c2828] text-emerald-200",
  rose: "border-rose-300/30 bg-[#2b1822] text-rose-200",
} as const;

function buildTrendPoints(values: number[], maxValue: number) {
  return values.map((value, index) => ({
    x: values.length <= 1 ? 50 : (index / (values.length - 1)) * 100,
    y: 100 - (value / maxValue) * 100,
  }));
}

function formatActivityTime(value: string | null) {
  if (!value) return "尚無進度紀錄";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間資料異常";

  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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
    <div className={cn("flex min-w-[142px] snap-start items-center gap-2 rounded-xl border px-3 py-2 lg:min-w-0 lg:gap-3 lg:px-4 lg:py-3", KPI_TONES[tone])}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/20 lg:h-10 lg:w-10 lg:rounded-xl">
        <Icon className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-[#a9c0d1]">{label}</div>
        <div className="font-data mt-0.5 text-xl font-semibold text-[#f3f8fc] lg:text-2xl">{value}</div>
        <div className="hidden truncate text-[11px] text-[#8fb0c5] sm:block">{detail}</div>
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

  const loadIssueCounts = useCallback(async () => {
    if (!activeProjectId) {
      setIssueCounts({ critical: 0, open: 0 });
      return;
    }

    const [openResult, criticalResult] = await Promise.all([
      supabase
        .from("issues")
        .select("id", { count: "exact", head: true })
        .eq("project_id", activeProjectId)
        .in("status", ["open", "in_progress"]),
      supabase
        .from("issues")
        .select("id", { count: "exact", head: true })
        .eq("project_id", activeProjectId)
        .in("status", ["open", "in_progress"])
        .eq("priority", "critical"),
    ]);

    if (openResult.error || criticalResult.error) {
      console.error("Failed to refresh dashboard issue counts:", openResult.error ?? criticalResult.error);
      return;
    }

    setIssueCounts({
      critical: criticalResult.count ?? 0,
      open: openResult.count ?? 0,
    });
  }, [activeProjectId]);

  useEffect(() => {
    void loadIssueCounts();
    if (!activeProjectId) return;

    const channel = supabase
      .channel(`dashboard-issues:${activeProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `project_id=eq.${activeProjectId}`,
          schema: "workspace",
          table: "issues",
        },
        () => void loadIssueCounts()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeProjectId, loadIssueCounts]);

  const dashboardMetrics = useMemo(
    () => calculateDashboardMetrics({ progress, stations, systems, testItems }),
    [progress, stations, systems, testItems]
  );
  const {
    activeItemCount,
    bottleneckStation,
    completionRate,
    dailyCompletion,
    includedSystems,
    maxRemainingHours,
    portfolioProgress,
    stationRows,
    statusCounts,
    systemMetricById,
    totalRemainingHours,
  } = dashboardMetrics;
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

  const attentionSystems = useMemo(
    () =>
      includedSystems
        .filter((system) => systemMetricById.get(system.id)?.status !== "completed")
        .sort(
          (left, right) =>
            (systemMetricById.get(left.id)?.progress ?? 0) -
              (systemMetricById.get(right.id)?.progress ?? 0) ||
            left.system_name.localeCompare(right.system_name, "zh-Hant")
        )
        .slice(0, 5),
    [includedSystems, systemMetricById]
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
          <div className="flex items-center gap-2">
            <HoverCard openDelay={180} closeDelay={120}>
              <HoverCardTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100 hover:bg-cyan-300/[0.12]"
                  data-testid="dashboard-metric-help"
                >
                  <CircleHelp className="h-4 w-4 sm:mr-2" /><span className="max-sm:sr-only">計算口徑</span>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent
                align="end"
                className="z-[70] w-[min(31rem,calc(100vw-2rem))] rounded-xl border border-[#3d718f] bg-[#071827] p-0 text-[#d9e8f2]"
              >
                <div className="border-b border-[#315d78]/70 px-4 py-3">
                  <div className="text-sm font-semibold text-[#f3f8fc]">儀表板共用計算口徑</div>
                  <p className="mt-1 text-xs leading-5 text-[#a9c0d1]">
                    目前依 {includedSystems.length} 台納管機台、{activeItemCount} 個有效測項與最新測項紀錄即時計算，不採用可能延遲的 overall_progress 或 current_station 快取值。
                  </p>
                </div>
                <dl className="divide-y divide-[#294b63]/55 px-4 py-2 text-xs leading-5">
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt className="font-medium text-cyan-100">平均進度</dt><dd className="text-[#c4d7e4]">各機台已完成測項數 ÷ 有效測項數，再取所有納管機台平均。</dd></div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt className="font-medium text-cyan-100">完成機台</dt><dd className="text-[#c4d7e4]">所有有效測項的狀態都必須是 Done；只有百分比 100 不會誤算完成。</dd></div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt className="font-medium text-cyan-100">七日產出</dt><dd className="text-[#c4d7e4]">依機台完成全部有效測項的日期計數，不再把單一測項完成當成整台產出。</dd></div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt className="font-medium text-cyan-100">待處理問題</dt><dd className="text-[#c4d7e4]">問題狀態不是 resolved 或 closed 的最新紀錄。</dd></div>
                </dl>
              </HoverCardContent>
            </HoverCard>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-lg">
                  <Download className="h-4 w-4 sm:mr-2" /><span className="max-sm:sr-only">匯出管理報表</span>
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
          </div>
        }
      />

      <div data-mobile-dashboard-kpis="true" className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
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
              <p className="mt-1 text-xs text-[#9eb8ca]">每日完成全部 {activeItemCount} 個有效測項的機台數</p>
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
            aria-label={`近七日完成全部有效測項的機台折線圖，總產出 ${sevenDayOutput} 台，每日平均 ${dailyAverage.toFixed(1)} 台`}
          >
            <figcaption className="sr-only">
              近七日每日完成全部有效測項的機台數：{dailyCompletion.map((day) => `${day.label} ${day.count} 台`).join("、")}
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
                        只計入儀表板納管機台，逐台檢查本站每個有效測項是否完成，再加總尚未完成測項的預估工時。這是剩餘工作量估算，不是設備即時利用率或 OEE。
                      </p>
                    </div>
                    <ol className="space-y-2.5 px-4 py-3 text-xs leading-5 text-[#c4d7e4]">
                      <li><strong className="text-cyan-100">1. 整站完成機台：</strong>機台在本站的所有有效測項都為 Done 才計入已完成；只要還有一項未完成，就計入處理中。</li>
                      <li><strong className="text-cyan-100">2. 站點機台總數：</strong>以目前儀表板納管的專案機台為準，已排除設定為不納入儀表板的機台。</li>
                      <li><strong className="text-cyan-100">3. 剩餘工作量：</strong>逐筆加總所有未完成測項的預估分鐘，不再以機台數乘上整站完整工時。</li>
                      <li><strong className="text-cyan-100">4. 判定瓶頸：</strong>剩餘工時最高者優先；同值時再比較處理中機台數與剩餘測項數。</li>
                    </ol>
                    <div className="border-t border-[#315d78]/70 px-4 py-2.5 text-[11px] text-[#8fb0c5]">
                      滑過任一站點卡，可查看該站當下代入的數字與完整公式。
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>
              <p className="mt-1 text-xs text-[#9eb8ca]">
                依每台機台尚未完成的測項逐筆加總；滑過卡片查看公式
                {bottleneckStation ? `，目前瓶頸為 ${bottleneckStation.name}` : "，目前沒有排隊瓶頸"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {bottleneckStation ? (
                <Badge variant="outline" className="border-amber-300/40 bg-amber-300/10 text-amber-100">
                  瓶頸 {bottleneckStation.remainingHours.toFixed(1)}h
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300/35 bg-emerald-300/10 text-emerald-100">
                  目前順暢
                </Badge>
              )}
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                總剩餘 {totalRemainingHours.toFixed(1)}h
              </Badge>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide text-[#9eb8ca]">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-1 text-cyan-100">
                起點 · 第 1 站
              </span>
              <span className="hidden items-center gap-2 text-[#7897aa] sm:flex">
                依站別順序向右執行
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="rounded-full border border-[#315d78]/75 bg-[#0a1c2e] px-3 py-1">
                終點 · 第 {stationRows.length} 站
              </span>
            </div>
            <div
              data-testid="station-capacity-flow"
              className="overflow-x-auto pb-3 snap-x snap-mandatory"
              aria-label={`站點產能流程，共 ${stationRows.length} 站，依第一站至最後一站排列`}
            >
              <ol className="flex min-w-max items-stretch">
                {stationRows.map((station, index) => {
              const remainingShare = totalRemainingHours
                ? Math.round((station.remainingHours / totalRemainingHours) * 100)
                : 0;
              const workloadShare = maxRemainingHours
                ? Math.round((station.remainingHours / maxRemainingHours) * 100)
                : 0;
              const isBottleneck =
                station.id === bottleneckStation?.id && station.remainingHours > 0;

              return (
                <li
                  key={station.id}
                  data-station-order={station.order}
                  className="relative flex w-80 min-w-80 snap-start items-stretch pr-10 last:pr-0"
                >
                <HoverCard openDelay={220} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      data-testid={`station-capacity-card-${index}`}
                      aria-label={`查看 ${station.name}，總共 ${station.totalSystems} 台，整站已完成 ${station.completedSystems} 台，還有 ${station.incompleteSystems} 台處理中，預估剩餘 ${station.remainingHours.toFixed(1)} 小時；滑鼠停留可查看計算方式`}
                      className={cn(
                        "h-full w-full min-w-0 rounded-xl border border-[#315d78]/75 bg-[#0a1c2e] p-4 text-left outline-none transition-colors hover:border-cyan-300/45 hover:bg-[#10283c] focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                        isBottleneck && "border-amber-300/55 bg-amber-300/[0.08] hover:border-amber-200/70 hover:bg-amber-300/[0.11]"
                      )}
                      onClick={() => onNavigate?.("test-tracker", { station: station.id, excludeStatus: "completed" })}
                    >
                      <div className="flex min-h-20 flex-col justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-wide">
                          <span className={cn(
                            "rounded-full border border-cyan-300/30 bg-cyan-300/[0.09] px-2 py-1 text-cyan-100",
                            isBottleneck && "border-amber-300/40 bg-amber-300/10 text-amber-100"
                          )}>
                            第 {index + 1} 站
                          </span>
                          {index === 0 && "起點"}
                          {index === stationRows.length - 1 && "終點"}
                          {isBottleneck && "瓶頸"}
                        </div>
                        <div>
                          <div className="break-words text-base font-semibold leading-6 text-[#f3f8fc]">
                            {station.name}
                          </div>
                          <div className="mt-1 text-xs text-[#8fb0c5]">
                            單站 {station.hours.toFixed(1)}h · 共 {station.totalSystems} 台
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-[#315d78]/60 bg-[#071522] p-3" aria-label={`${station.name} 目前主要工作量`}>
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-[#9eb8ca]">
                              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                              預估剩餘
                            </div>
                            <strong className={cn(
                              "font-data mt-1 block text-2xl font-semibold text-cyan-100",
                              isBottleneck && "text-amber-100"
                            )}>
                              {station.remainingHours.toFixed(1)}h
                            </strong>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-[#8fb0c5]">仍在處理</div>
                            <strong className={cn(
                              "font-data mt-1 block text-lg text-cyan-100",
                              isBottleneck && "text-amber-100"
                            )}>
                              {station.incompleteSystems} 台
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-[#315d78]/55 pt-3">
                        <div className="flex items-center justify-between text-[11px] text-[#9eb8ca]">
                          <span>相對負載</span>
                          <span className={cn("font-data text-cyan-100", isBottleneck && "text-amber-100")}>{workloadShare}%</span>
                        </div>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-[#06111f] ring-1 ring-inset ring-[#315d78]/65"
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

                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[#8fb0c5]">
                        <span>整站完成 {station.completedSystems} / {station.totalSystems} 台</span>
                        <span className="flex items-center gap-1 text-emerald-200">
                          <TrendingUp className="h-3 w-3" aria-hidden="true" />
                          測項 {station.averageProgress}%
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-[#315d78]/45 pt-2 text-[10px] text-[#8fb0c5]">
                        <span>剩餘工時占比 {remainingShare}%</span>
                        <span className={cn(isBottleneck ? "text-amber-100" : "text-cyan-100")}>
                          {isBottleneck ? "優先疏通" : station.remainingItems ? "持續監控" : "工作已清空"}
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
                        {isBottleneck ? "目前瓶頸" : station.remainingItems ? "持續監控" : "工作已清空"}
                      </Badge>
                    </div>
                    <dl className="px-4 py-2 text-xs">
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">站點機台總數</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          目前儀表板納管 <strong className="font-data text-[#f3f8fc]">{station.totalSystems} 台</strong>；已排除不納入儀表板的機台。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-emerald-100">整站已完成</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          本站所有 {station.itemCount} 個有效測項都為 Done 的機台，共 <strong className="font-data text-emerald-200">{station.completedSystems} 台</strong>。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-amber-100">仍在處理</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          站點總數 {station.totalSystems} 台 − 整站已完成 {station.completedSystems} 台 = <strong className="font-data text-amber-100">{station.incompleteSystems} 台</strong>；包含未開始與處理中機台。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">完整站點工時</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {station.itemCount} 個測項的預估分鐘加總 ÷ 60 = <strong className="font-data text-[#f3f8fc]">{station.hours.toFixed(2)}h</strong>。未填預估時間的測項以 30 分鐘計。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">剩餘工作量</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          剩餘 <strong className="font-data text-[#f3f8fc]">{station.remainingItems} 筆測項</strong>，逐筆加總預估分鐘 ÷ 60 = <strong className="font-data text-[#f3f8fc]">{station.remainingHours.toFixed(1)}h</strong>。
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">相對負載</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {maxRemainingHours ? (
                            <>本站 {station.remainingHours.toFixed(1)}h ÷ 站點最高 {maxRemainingHours.toFixed(1)}h × 100 = <strong className="font-data text-[#f3f8fc]">{workloadShare}%</strong>。</>
                          ) : (
                            <>所有站點目前都沒有待處理工時，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-[#294b63]/55 py-2.5">
                        <dt className="font-medium text-cyan-100">測項完成率</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {station.possibleRecords ? (
                            <>已完成 {station.completedRecords} 筆 ÷（{includedSystems.length} 台 × {station.itemCount} 項，共 {station.possibleRecords} 筆）= <strong className="font-data text-[#f3f8fc]">{station.averageProgress}%</strong>，最高顯示 100%。</>
                          ) : (
                            <>本站尚未建立可計算的測項，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="font-medium text-cyan-100">剩餘工時占比</dt>
                        <dd className="leading-5 text-[#c4d7e4]">
                          {totalRemainingHours ? (
                            <>本站 {station.remainingHours.toFixed(1)}h ÷ 全流程剩餘 {totalRemainingHours.toFixed(1)}h × 100 = <strong className="font-data text-[#f3f8fc]">{remainingShare}%</strong>。</>
                          ) : (
                            <>目前沒有未完成測項，因此顯示 <strong className="font-data text-[#f3f8fc]">0%</strong>。</>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="border-t border-[#315d78]/70 px-4 py-2.5 text-[11px] text-[#8fb0c5]">
                      點擊卡片會帶入此站點，前往 L10 測試追蹤查看機台明細。
                    </div>
                  </HoverCardContent>
                </HoverCard>
                  {index < stationRows.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute right-1 top-1/2 flex w-8 -translate-y-1/2 items-center text-cyan-300/70"
                    >
                      <span className="h-px flex-1 bg-cyan-300/45" />
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </span>
                  )}
                </li>
              );
            })}
              </ol>
            </div>
          </div>
        </section>

        <section className="maintenance-panel flex min-h-0 flex-col overflow-hidden" aria-labelledby="attention-machines-title">
          <div className="flex flex-col gap-3 border-b border-[#2a526f]/70 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="attention-machines-title" className="text-base font-semibold text-[#f3f8fc]">需關注機台</h2>
                <Badge variant="outline" className="border-amber-300/35 bg-amber-300/10 text-amber-100">
                  {attentionSystems.length} 台
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#9eb8ca]">依測項完成率由低到高，顯示前 5 台未完成機台。</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100 hover:bg-cyan-300/[0.13]"
              onClick={() => onNavigate?.("test-tracker", { attention: "1", trackerView: "board" })}
            >
              開啟生產看板
            </Button>
          </div>

          <div className="max-h-[23rem] min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {attentionSystems.length ? attentionSystems.map((system) => {
              const metric = systemMetricById.get(system.id);
              const calculatedProgress = metric?.progress ?? 0;
              const totalItems = metric?.totalItems ?? 0;
              const completedItems = metric?.completedItems ?? 0;
              const remainingItems = Math.max(0, totalItems - completedItems);

              return (
                <article key={system.id} className="rounded-xl border border-[#315d78]/75 bg-[#0a1d2d] p-3" data-testid="attention-machine-row">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-[#f3f8fc]" title={system.system_name}>
                      {system.system_name}
                    </h3>
                    <span className="font-data shrink-0 rounded-md bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">
                      {calculatedProgress}%
                    </span>
                  </div>
                  <Progress value={calculatedProgress} className="mt-2 h-1.5" />
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#8fb0c5]">未完成測項</span>
                    <strong className="font-data text-[#dceaf3]">{remainingItems} / {totalItems}</strong>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#294b63]/55 pt-3 text-[11px]">
                    <div className="min-w-0">
                      <dt className="text-[#789ab1]">卡關站點</dt>
                      <dd className="mt-0.5 truncate font-medium text-[#cfe1ec]" title={metric?.nextStationName || "尚未設定待辦站點"}>
                        {metric?.nextStationName || "尚未設定待辦站點"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[#789ab1]">負責人</dt>
                      <dd className="mt-0.5 truncate font-medium text-[#cfe1ec]" title={system.assigned_engineer || "未指定"}>
                        {system.assigned_engineer || "未指定"}
                      </dd>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <dt className="text-[#789ab1]">最近更新</dt>
                      <dd className="mt-0.5 font-medium text-[#cfe1ec]">{formatActivityTime(metric?.lastActivityAt ?? null)}</dd>
                    </div>
                  </dl>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 h-8 w-full justify-between border border-[#315d78]/70 bg-[#10283b] px-3 text-xs text-cyan-100 hover:bg-[#17364d]"
                    onClick={() => onNavigate?.("test-tracker", { system: system.id })}
                  >
                    查看機台
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </article>
              );
            }) : (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-6 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-emerald-100">目前沒有未完成機台</p>
                <p className="mt-1 text-xs text-[#9eb8ca]">所有納管機台的有效測項皆已完成。</p>
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
              issueCounts.critical > 0
                ? "border-rose-300/30 bg-rose-300/[0.08]"
                : "border-emerald-300/25 bg-emerald-300/[0.06]"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                issueCounts.critical > 0 ? "bg-rose-300/15 text-rose-200" : "bg-emerald-300/15 text-emerald-200"
              )}>
                {issueCounts.critical > 0
                  ? <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <h3 className={cn("text-sm font-semibold", issueCounts.critical > 0 ? "text-rose-100" : "text-emerald-100")}>高風險問題</h3>
                <p className="mt-0.5 text-xs text-[#a9c0d1]">
                  {issueCounts.critical > 0
                    ? `有 ${issueCounts.critical} 件高風險問題待處理`
                    : "目前沒有高風險問題"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 shrink-0",
                issueCounts.critical > 0
                  ? "border-rose-300/35 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15"
                  : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
              )}
              onClick={() => onNavigate?.("issues")}
            >
              查看問題
            </Button>
          </div>
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
