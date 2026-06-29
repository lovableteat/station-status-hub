import { ComponentType, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Clock3,
  Download,
  FileCode2,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { BackButton } from "@/components/common/BackButton";
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { exportSiteArchiveHtml } from "@/utils/siteArchiveExport";

import { DailyStationCompletionChart } from "./DailyStationCompletionChart";
import { StationAverageTimeChart } from "./StationAverageTimeChart";
import { StationOverview } from "./StationOverview";
import { SystemStatusList } from "./SystemStatusList";
import { TestPassRateCard } from "./TestPassRateCard";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

interface DashboardSectionProps {
  eyebrow: string;
  title: string;
  description: string;
}

interface CommandCardProps {
  eyebrow: string;
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  accent: string;
}

function DashboardSection({
  eyebrow,
  title,
  description,
}: DashboardSectionProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/75">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function CommandCard({
  eyebrow,
  title,
  value,
  description,
  icon: Icon,
  tone,
  accent,
}: CommandCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[30px] border p-5 shadow-[0_24px_58px_-46px_hsl(var(--background)/0.95)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-42px_hsl(var(--primary)/0.55)]",
        tone
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/70">
            {eyebrow}
          </p>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]",
            accent
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-5xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-4 rounded-2xl border border-white/8 bg-background/24 px-4 py-3">
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const {
    systems,
    progress,
    stations,
    testItems,
    stationContents,
  } = useUnifiedData();
  const { user } = useUser();
  const { toast } = useToast();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isArchiveExporting, setIsArchiveExporting] = useState(false);

  const filteredSystems = systems.filter(
    (system) => !system.exclude_from_dashboard
  );
  const totalSystems = filteredSystems.length;
  const completedSystems = filteredSystems.filter(
    (system) =>
      system.overall_progress === 100 || system.status === "Done"
  ).length;
  const ongoingSystems = filteredSystems.filter(
    (system) =>
      (system.overall_progress > 0 && system.overall_progress < 100) ||
      system.status === "On-going"
  ).length;
  const notStartedSystems = filteredSystems.filter(
    (system) =>
      system.overall_progress === 0 || system.status === "Not Start"
  ).length;

  const completionRate =
    totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;

  const singleMachineTestHours = useMemo(() => {
    const totalEstimatedMinutes = testItems.reduce((sum, item) => {
      return sum + (item.estimated_minutes ?? 30);
    }, 0);

    return Number((totalEstimatedMinutes / 60).toFixed(1));
  }, [testItems]);

  const headerStats = [
    {
      label: "納入統計",
      value: `${totalSystems} 台`,
      className: "border-primary/35 bg-primary/12 text-primary",
    },
    {
      label: "已完成",
      value: `${completedSystems} 台`,
      className: "border-emerald-300/30 bg-emerald-400/12 text-emerald-200",
    },
    {
      label: "完成率",
      value: `${completionRate}%`,
      className: "border-amber-300/30 bg-amber-400/12 text-amber-200",
    },
  ];

  const commandCards = [
    {
      eyebrow: "Total",
      title: "進行中機台總數",
      value: `${ongoingSystems}台`,
      description: `L10 現在仍在測試流程中的機台，已完成 ${completedSystems} 台。`,
      icon: Activity,
      tone: "border-blue-300/22 bg-[radial-gradient(circle_at_top_right,hsl(220_95%_68%/0.18),transparent_30%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      accent: "border-blue-300/22 bg-blue-400/10 text-blue-200",
    },
    {
      eyebrow: "Yield",
      title: "測試目前總完成率",
      value: `${completionRate}%`,
      description: `目前共 ${totalSystems} 台，已完成 ${completedSystems} 台。`,
      icon: ShieldCheck,
      tone: "border-emerald-300/22 bg-[radial-gradient(circle_at_top_right,hsl(152_80%_58%/0.18),transparent_30%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      accent: "border-emerald-300/22 bg-emerald-400/10 text-emerald-200",
    },
    {
      eyebrow: "Capacity",
      title: "機台總數",
      value: `${totalSystems}台`,
      description: `${notStartedSystems} 台尚未啟動，方便你安排下一批進站節奏。`,
      icon: Boxes,
      tone: "border-indigo-300/20 bg-[radial-gradient(circle_at_top_right,hsl(232_96%_72%/0.16),transparent_30%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      accent: "border-indigo-300/20 bg-indigo-400/10 text-indigo-200",
    },
    {
      eyebrow: "Test Time",
      title: "單機總測試時間",
      value: `${singleMachineTestHours}h`,
      description: `依目前測項估算，涵蓋 ${testItems.length} 個測試項目。`,
      icon: Clock3,
      tone: "border-amber-300/20 bg-[radial-gradient(circle_at_top_right,hsl(43_96%_56%/0.16),transparent_30%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      accent: "border-amber-300/20 bg-amber-400/10 text-amber-200",
    },
  ];

  const stationQueue = useMemo(() => {
    return [...stations]
      .sort((a, b) => a.station_order - b.station_order)
      .map((station) => {
        const systemsAtStation = filteredSystems.filter(
          (system) => system.current_station === station.station_name
        );
        const stationItemsForThisStation = testItems.filter(
          (item) => item.station_id === station.id
        );

        const progressValues = systemsAtStation.map((system) => {
          if (stationItemsForThisStation.length === 0) {
            return 0;
          }

          const completedCount = stationItemsForThisStation.filter((item) =>
            progress.some(
              (entry) =>
                entry.system_id === system.id &&
                entry.station_id === station.id &&
                entry.item_id === item.id &&
                entry.status === "Done"
            )
          ).length;

          return Math.round(
            (completedCount / stationItemsForThisStation.length) * 100
          );
        });

        const averageProgress = progressValues.length
          ? Math.round(
              progressValues.reduce((sum, value) => sum + value, 0) /
                progressValues.length
            )
          : 0;

        let queueState: "idle" | "running" | "blocked" | "complete" = "idle";
        if (systemsAtStation.length > 0) {
          if (averageProgress >= 100) {
            queueState = "complete";
          } else if (averageProgress < 50) {
            queueState = "blocked";
          } else {
            queueState = "running";
          }
        }

        return {
          id: station.id,
          name: station.station_name,
          count: systemsAtStation.length,
          averageProgress,
          queueState,
          previewSystems: systemsAtStation.slice(0, 3).map((system) => system.system_name),
        };
      });
  }, [filteredSystems, progress, stations, testItems]);

  const rankedStations = useMemo(() => {
    return stationQueue
      .filter((station) => station.count > 0)
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.averageProgress - b.averageProgress ||
          a.name.localeCompare(b.name, "zh-Hant")
      )
      .slice(0, 5);
  }, [stationQueue]);

  const maxQueueCount = Math.max(
    1,
    ...rankedStations.map((station) => station.count)
  );

  const handleArchiveExport = async () => {
    if (isArchiveExporting) return;

    try {
      setIsArchiveExporting(true);

      const { warnings } = await exportSiteArchiveHtml({
        systems,
        stations,
        testItems,
        progress,
        stationContents,
        exportedBy: user?.username,
      });

      toast({
        title: "HTML 封存已匯出",
        description: warnings.length
          ? `整站封存已下載，但有 ${warnings.length} 個區塊未完整納入。`
          : "整站 HTML 封存已下載，可作為專案結束後的離線保存版本。",
      });
    } catch (error) {
      console.error("Site archive export failed:", error);
      toast({
        title: "HTML 封存匯出失敗",
        description:
          error instanceof Error
            ? error.message
            : "無法產生整站 HTML 封存，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsArchiveExporting(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-8 p-4 sm:p-6" data-dashboard-content>
      <div className="relative overflow-hidden rounded-[34px] border border-primary/20 bg-[linear-gradient(135deg,hsl(225_34%_16%),hsl(224_27%_13%)_46%,hsl(228_37%_17%)_100%)] shadow-[0_36px_100px_-60px_hsl(var(--primary)/0.9)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.22),transparent_22%),radial-gradient(circle_at_80%_16%,hsl(193_96%_68%/0.12),transparent_16%),linear-gradient(120deg,transparent_0%,hsl(0_0%_100%/0.03)_48%,transparent_54%)]" />

        <div className="relative space-y-6 p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <BackButton />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <Badge
                  variant="secondary"
                  className="rounded-full border border-primary/20 bg-background/35 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/85 backdrop-blur"
                >
                  Dashboard Control Room
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 hidden h-20 w-px bg-gradient-to-b from-primary/80 via-cyan-300/50 to-transparent sm:block" />
                  <div>
                    <h1 className="text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
                      系統儀表板
                    </h1>
                    <p className="mt-3 max-w-4xl text-base leading-7 text-muted-foreground">
                      參考你指定的控制台式放置方式，把首頁第一屏改成更容易掃視的總覽版面。
                      原本統計、進度、匯出邏輯都保留，只把資訊改成更適合現場看板的配置。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {headerStats.map((stat) => (
                    <Badge
                      key={stat.label}
                      variant="secondary"
                      className={`gap-2 rounded-full px-4 py-2 text-xs font-medium shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)] ${stat.className}`}
                    >
                      <span className="opacity-70">{stat.label}</span>
                      <span className="font-semibold text-foreground">
                        {stat.value}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-start xl:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-primary/25 bg-background/45 px-5 backdrop-blur hover:bg-primary/10"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    匯出選項
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    匯出資料報表
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleArchiveExport}>
                    <FileCode2 className="mr-2 h-4 w-4" />
                    匯出整站 HTML 封存
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)_minmax(300px,0.84fr)]">
            <div className="grid gap-4 sm:grid-cols-2">
              {commandCards.map((card) => (
                <CommandCard key={card.title} {...card} />
              ))}
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,hsl(224_16%_15%/0.96),hsl(224_18%_13%/0.96))] p-5 shadow-[0_24px_62px_-46px_hsl(var(--background)/0.95)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/70">
                    Ranking
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-foreground">
                    站點節奏排行
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    以目前站點上的機台數與平均進度排序，方便你快速找出最擁擠或最需要關注的站點。
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-300/16 bg-rose-400/10 text-rose-200">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {rankedStations.length > 0 ? (
                  rankedStations.map((station, index) => {
                    const ratio = Math.max(
                      16,
                      Math.round((station.count / maxQueueCount) * 100)
                    );

                    return (
                      <div
                        key={station.id}
                        className="rounded-[24px] border border-rose-300/10 bg-background/22 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-semibold text-rose-100/80">
                                {index + 1}.
                              </span>
                              <p className="truncate text-base font-semibold text-foreground">
                                {station.name}
                              </p>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              平均進度 {station.averageProgress}%，目前有 {station.count} 台在此站點。
                            </p>
                          </div>
                          <span className="shrink-0 text-xl font-semibold text-rose-100">
                            {station.count}台
                          </span>
                        </div>

                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-background/60">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,hsl(2_68%_74%),hsl(6_78%_66%))]"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-white/10 bg-background/18 px-5 py-8 text-sm leading-6 text-muted-foreground">
                    目前還沒有站點排程中的機台，等第一批系統進站後，這裡就會自動顯示節奏排行。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,hsl(224_16%_15%/0.96),hsl(224_18%_13%/0.96))] p-5 shadow-[0_24px_62px_-46px_hsl(var(--background)/0.95)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/75">
                    WIP Queue
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-foreground">
                    站點在製品監控
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    依照每台機器目前的 `current_station` 顯示隊列狀況，不改原本資料來源，只換成更像看板的表現。
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {stationQueue.map((station) => {
                  const stateConfig = {
                    idle: {
                      tone: "border-white/10 bg-background/18 text-foreground",
                      label: "Idle",
                      countTone: "text-slate-200",
                    },
                    running: {
                      tone: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-50",
                      label: "Running",
                      countTone: "text-emerald-200",
                    },
                    blocked: {
                      tone: "border-rose-300/18 bg-rose-400/[0.10] text-rose-50",
                      label: "Blocked",
                      countTone: "text-rose-200",
                    },
                    complete: {
                      tone: "border-sky-300/18 bg-sky-400/[0.08] text-sky-50",
                      label: "Complete",
                      countTone: "text-sky-200",
                    },
                  }[station.queueState];

                  return (
                    <div
                      key={station.id}
                      className={cn(
                        "rounded-[24px] border px-4 py-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05)]",
                        stateConfig.tone
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-foreground">
                            {station.name}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] opacity-70">
                            平均進度 {station.averageProgress}%
                          </p>
                        </div>
                        <span className={cn("shrink-0 text-lg font-semibold", stateConfig.countTone)}>
                          [ {station.count}台 {stateConfig.label} ]
                        </span>
                      </div>

                      {station.previewSystems.length > 0 && (
                        <p className="mt-3 truncate text-sm opacity-80">
                          {station.previewSystems.join("、")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                className="mt-5 h-11 w-full rounded-2xl border-white/10 bg-background/24 hover:bg-primary/10"
                onClick={() => onNavigate?.("test-tracker")}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                查看排程機台清單
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DashboardSection
        eyebrow="Overview"
        title="核心概況"
        description="保留原本的總量、目標與站點資訊，只把首頁後續區塊整理成更清楚的資訊段落。"
      />
      <StationOverview />

      <DashboardSection
        eyebrow="Quality"
        title="通過率與完成節奏"
        description="用一致的方式追蹤目前完成比例、進行中與未開始分布，讓專案狀態更容易判讀。"
      />
      <TestPassRateCard />

      <DashboardSection
        eyebrow="Trend"
        title="每日站點完成趨勢"
        description="維持原本統計來源，把完成數量趨勢保留在首頁中段，方便快速看出各站節奏變化。"
      />
      <DailyStationCompletionChart />

      <DashboardSection
        eyebrow="Analysis"
        title="站點平均時間"
        description="觀察各站平均耗時與瓶頸位置，幫助你判斷哪一段流程最值得優先優化。"
      />
      <StationAverageTimeChart />

      <DashboardSection
        eyebrow="Live"
        title="系統狀態清單"
        description="用清單方式查看每台機台目前進度與站點位置，方便在儀表板中直接追蹤現場狀況。"
      />
      <SystemStatusList onNavigate={onNavigate} />

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="系統儀表板"
        data={systems}
        stations={stations}
        testItems={testItems}
        progress={progress}
      />
    </div>
  );
}
