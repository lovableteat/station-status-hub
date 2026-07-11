import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Download,
  FileCode2,
  Gauge,
  LayoutDashboard,
  ListChecks,
  TimerReset,
  TrendingUp,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { MaintenanceMetricStrip } from "@/components/maintenance/MaintenanceMetricStrip";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
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

export function Dashboard({ onNavigate }: DashboardProps) {
  const {
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
  const estimatedHours = useMemo(
    () =>
      testItems.reduce((sum, item) => sum + (item.estimated_minutes ?? 30), 0) / 60,
    [testItems]
  );

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
  const maxDailyCompletion = Math.max(1, ...dailyCompletion.map((day) => day.count));

  const stationRows = useMemo(() => {
    return [...stations]
      .sort((left, right) => left.station_order - right.station_order)
      .map((station) => {
        const stationItems = testItems.filter((item) => item.station_id === station.id);
        const systemsAtStation = includedSystems.filter(
          (system) => system.current_station === station.station_name
        );
        const completedRecords = progress.filter(
          (entry) => entry.station_id === station.id && entry.status === "Done"
        ).length;
        const possibleRecords = Math.max(1, systemsAtStation.length * stationItems.length);
        const averageProgress = Math.min(
          100,
          systemsAtStation.length ? Math.round((completedRecords / possibleRecords) * 100) : 0
        );
        const hours = stationItems.reduce(
          (sum, item) => sum + (item.estimated_minutes ?? 30),
          0
        ) / 60;
        return {
          averageProgress,
          hours,
          id: station.id,
          name: station.station_name,
          queue: systemsAtStation.length,
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
        .slice(0, 8),
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

  return (
    <div className="maintenance-page space-y-3" data-dashboard-content>
      <MaintenancePageHeader
        icon={LayoutDashboard}
        title="系統儀表板"
        description={`${activeProject?.name || "目前專案"} · 管理數據與站點效能`}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <Download className="mr-2 h-4 w-4" />
                匯出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                <Download className="mr-2 h-4 w-4" />
                專案資料報表
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchiveExport} disabled={isArchiveExporting}>
                <FileCode2 className="mr-2 h-4 w-4" />
                HTML 離線封存
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <MaintenanceMetricStrip
        metrics={[
          { accent: "blue", icon: Boxes, label: "專案機台", value: includedSystems.length },
          { accent: "amber", icon: Activity, label: "進行中", value: statusCounts.active },
          { accent: "emerald", icon: CheckCircle2, label: "已完成", value: statusCounts.completed },
          { accent: "cyan", icon: Gauge, label: "完成率", value: `${completionRate}%` },
          { accent: "rose", icon: AlertTriangle, label: "待處理問題", value: issueCounts.open },
          { accent: "blue", icon: Clock3, label: "單機預估", value: `${estimatedHours.toFixed(1)}h` },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.72fr)]">
        <section className="maintenance-panel min-h-[238px] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">近七日完成趨勢</h2>
              <p className="mt-1 text-xs text-[#a9c0d1]">依測項完成時間計算每日有產出的機台數。</p>
            </div>
            <Badge variant="outline" className="rounded-md border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              7 天
            </Badge>
          </div>

          <div className="mt-5 grid h-[150px] grid-cols-7 items-end gap-2">
            {dailyCompletion.map((day, index) => {
              const height = Math.max(8, Math.round((day.count / maxDailyCompletion) * 112));
              const isToday = index === dailyCompletion.length - 1;
              return (
                <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5">
                  <span className="font-data text-xs text-[#f3f8fc]">{day.count}</span>
                  <div className="flex h-28 w-full max-w-14 items-end rounded-md bg-[#06111f] p-1">
                    <div
                      className={cn(
                        "w-full rounded-[4px]",
                        isToday ? "bg-[#39c6e8]" : "bg-[#4c8dff]"
                      )}
                      style={{ height }}
                    />
                  </div>
                  <span className="text-[11px] text-[#a9c0d1]">{day.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="maintenance-panel min-h-[238px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2a526f]/70 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">站點負載</h2>
              <p className="mt-0.5 text-xs text-[#a9c0d1]">
                瓶頸：{bottleneckStation?.name || "尚無資料"}
              </p>
            </div>
            <ListChecks className="h-5 w-5 text-cyan-100" />
          </div>
          <div className="divide-y divide-[#2a526f]/50">
            {stationRows.slice(0, 5).map((station) => (
              <button
                key={station.id}
                type="button"
                className="grid w-full grid-cols-[minmax(0,1fr)_54px_92px] items-center gap-3 px-4 py-2.5 text-left hover:bg-[#10263a]"
                onClick={() => onNavigate?.("test-tracker", { station: station.id })}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#f3f8fc]">{station.name}</div>
                  <div className="mt-0.5 text-xs text-[#a9c0d1]">預估 {station.hours.toFixed(1)}h</div>
                </div>
                <div className="text-right">
                  <div className="font-data text-base font-semibold text-[#f3f8fc]">{station.queue}</div>
                  <div className="text-[10px] text-[#a9c0d1]">台</div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-[#a9c0d1]">
                    <span>平均</span><span>{station.averageProgress}%</span>
                  </div>
                  <Progress value={station.averageProgress} className="h-1.5" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="maintenance-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2a526f]/70 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[#f3f8fc]">待關注機台</h2>
              <p className="mt-0.5 text-xs text-[#a9c0d1]">依完成度由低到高排列。</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.("test-tracker")}>查看全部</Button>
          </div>
          <div className="grid divide-y divide-[#2a526f]/45 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            {attentionSystems.slice(0, 4).map((system) => (
              <button
                key={system.id}
                type="button"
                className="min-w-0 px-4 py-3 text-left hover:bg-[#10263a]"
                onClick={() => onNavigate?.("monitor", { system: system.system_name })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</span>
                  <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
                </div>
                <div className="mt-2 truncate text-xs text-[#a9c0d1]">{system.current_station || "尚未進站"}</div>
                <Progress value={system.overall_progress ?? 0} className="mt-2 h-1.5" />
              </button>
            ))}
            {attentionSystems.length === 0 && (
              <div className="col-span-full px-4 py-8 text-center text-sm text-[#a9c0d1]">目前沒有待關注機台。</div>
            )}
          </div>
        </section>

        <section className="maintenance-panel flex items-center justify-between gap-4 p-4">
          <div>
            <div className="text-xs text-[#a9c0d1]">高優先問題</div>
            <div className="font-data mt-1 text-3xl font-semibold text-rose-100">{issueCounts.critical}</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => onNavigate?.("issues")}>前往問題追蹤</Button>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-rose-300/35 bg-rose-300/10 text-rose-100">
            {issueCounts.critical ? <AlertTriangle className="h-6 w-6" /> : <TimerReset className="h-6 w-6" />}
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
