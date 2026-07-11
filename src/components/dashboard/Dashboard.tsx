import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileCode2,
  Gauge,
  LayoutDashboard,
  Server,
  Target,
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

function formatProjectDate(value?: string | null) {
  if (!value) return "未設定";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
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

function buildChartPoints(values: number[], width: number, height: number) {
  const maxValue = Math.max(1, ...values);
  return values.map((value, index) => ({
    x: values.length <= 1 ? 0 : (index / (values.length - 1)) * width,
    y: height - (value / maxValue) * (height - 18) - 8,
  }));
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
  const chartPoints = buildChartPoints(
    dailyCompletion.map((day) => day.count),
    620,
    150
  );
  const pointString = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = chartPoints.length
    ? `M 0 150 L ${chartPoints.map((point) => `${point.x} ${point.y}`).join(" L ")} L 620 150 Z`
    : "";
  const sevenDayOutput = dailyCompletion.reduce((sum, day) => sum + day.count, 0);

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
      return {
        averageProgress,
        hours,
        id: station.id,
        name: station.station_name,
        queue: queueByStation.get(station.id) ?? 0,
      };
    });
  }, [includedSystems, progress, stations, testItems]);
  const bottleneckStation = [...stationRows].sort(
    (left, right) => right.queue - left.queue || right.hours - left.hours
  )[0];
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
            <div className="min-w-0 flex-1 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-[#a9c0d1]">進行中</span><strong className="font-data text-blue-100">{statusCounts.active}</strong></div>
              <div className="flex items-center justify-between"><span className="text-[#a9c0d1]">未開始</span><strong className="font-data text-amber-100">{statusCounts.waiting}</strong></div>
              <div className="border-t border-[#2a526f]/60 pt-3">
                <div className="flex items-center gap-2 text-xs text-[#9eb8ca]"><Target className="h-4 w-4 text-cyan-200" />預計完成</div>
                <div className="font-data mt-1 text-sm text-[#f3f8fc]">{formatProjectDate(activeProject?.planned_end_date)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="maintenance-panel overflow-hidden p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">近七日產出趨勢</h2>
              <p className="mt-1 text-xs text-[#9eb8ca]">每日有完成測項的不同機台數</p>
            </div>
            <div className="text-right">
              <div className="font-data text-2xl font-semibold text-cyan-100">{sevenDayOutput}</div>
              <div className="text-[11px] text-[#8fb0c5]">七日產出</div>
            </div>
          </div>
          <div className="mt-4 h-[165px] w-full">
            <svg viewBox="0 0 620 165" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="近七日產出折線圖">
              <defs>
                <linearGradient id="dashboard-output-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#4c8dff" stopOpacity="0.36" />
                  <stop offset="100%" stopColor="#4c8dff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[30, 70, 110, 150].map((y) => (
                <line key={y} x1="0" x2="620" y1={y} y2={y} stroke="#284b65" strokeWidth="1" />
              ))}
              <path d={areaPath} fill="url(#dashboard-output-area)" />
              <polyline points={pointString} fill="none" stroke="#4c8dff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {chartPoints.map((point, index) => (
                <circle key={dailyCompletion[index].key} cx={point.x} cy={point.y} r="4" fill="#071522" stroke="#7dd3fc" strokeWidth="2" />
              ))}
            </svg>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-[#8fb0c5]">
            {dailyCompletion.map((day) => <span key={day.key}>{day.label}</span>)}
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="maintenance-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2a526f]/70 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">站點產能與瓶頸</h2>
              <p className="mt-1 text-xs text-[#9eb8ca]">目前瓶頸：{bottleneckStation?.name || "尚無資料"}</p>
            </div>
            <Activity className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="grid divide-y divide-[#2a526f]/55 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            {stationRows.map((station, index) => (
              <button
                key={station.id}
                type="button"
                className="min-w-0 px-4 py-4 text-left hover:bg-[#10263a]"
                onClick={() => onNavigate?.("test-tracker", { station: station.id })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-data flex h-7 w-7 items-center justify-center rounded-lg bg-[#10263a] text-xs text-cyan-100">{index + 1}</span>
                  <span className="font-data text-lg font-semibold text-[#f3f8fc]">{station.queue}<small className="ml-1 text-[10px] font-normal text-[#8fb0c5]">台</small></span>
                </div>
                <div className="mt-3 truncate text-sm font-semibold text-[#f3f8fc]">{station.name}</div>
                <div className="mt-1 text-xs text-[#8fb0c5]">單站預估 {station.hours.toFixed(1)}h</div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#9eb8ca]"><span>整體完成</span><span>{station.averageProgress}%</span></div>
                <Progress value={station.averageProgress} className="mt-1.5 h-1.5 bg-[#193149] [&>div]:bg-[#39c6e8]" />
              </button>
            ))}
          </div>
        </section>

        <section className="maintenance-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2a526f]/70 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">管理層待辦</h2>
              <p className="mt-0.5 text-xs text-[#9eb8ca]">優先關注低進度機台</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.("test-tracker")}>查看全部</Button>
          </div>
          <div className="max-h-64 divide-y divide-[#2a526f]/45 overflow-y-auto">
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
