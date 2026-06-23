import { useState } from "react";
import {
  AlertTriangle,
  Download,
  FileCode2,
  Gauge,
  LayoutDashboard,
  Radar,
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
import { useToast } from "@/hooks/use-toast";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { exportSiteArchiveHtml } from "@/utils/siteArchiveExport";

import { DailyStationCompletionChart } from "./DailyStationCompletionChart";
import { StationAverageTimeChart } from "./StationAverageTimeChart";
import { StationOverview } from "./StationOverview";
import { StatsCard } from "./StatsCard";
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

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stations, testItems, stationContents } =
    useUnifiedData();
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

  const heroSignals = [
    {
      title: "即時追蹤",
      value: `${ongoingSystems} 台`,
      description: "目前仍在流程中的機台數量。",
      icon: Radar,
      tone: "border-sky-300/20 bg-sky-400/[0.08] text-sky-100",
    },
    {
      title: "完成進度",
      value: `${completedSystems} / ${totalSystems}`,
      description: "已經結束整體測試流程的機台。",
      icon: ShieldCheck,
      tone: "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100",
    },
    {
      title: "待啟動",
      value: `${notStartedSystems} 台`,
      description: "尚未開始、可優先排程的機台。",
      icon: Sparkles,
      tone: "border-amber-300/20 bg-amber-400/[0.08] text-amber-100",
    },
  ];

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
      <div className="relative overflow-hidden rounded-[32px] border border-primary/20 bg-[linear-gradient(135deg,hsl(224_36%_16%),hsl(224_29%_13%)_42%,hsl(229_38%_18%)_100%)] shadow-[0_36px_100px_-60px_hsl(var(--primary)/0.9)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.26),transparent_22%),radial-gradient(circle_at_85%_18%,hsl(189_80%_55%/0.16),transparent_18%),linear-gradient(120deg,transparent_0%,hsl(0_0%_100%/0.025)_48%,transparent_52%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-[18%] hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent lg:block" />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="space-y-6">
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
                  <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
                    用來快速查看整體測試進度、站點狀態與完工比例。現在也可以直接從這裡匯出整站
                    HTML 封存，讓每個專案結束時都能保留一份舊網站快照。
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

            <div className="grid gap-3 sm:grid-cols-3">
              {heroSignals.map((signal) => {
                const Icon = signal.icon;

                return (
                  <div
                    key={signal.title}
                    className={`rounded-3xl border px-4 py-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)] backdrop-blur ${signal.tone}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-current/70">
                          {signal.title}
                        </p>
                        <p className="mt-3 text-2xl font-semibold text-foreground">
                          {signal.value}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-current/20 bg-background/25 text-current">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-current/75">
                      {signal.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-start lg:justify-end">
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

            <div className="rounded-[28px] border border-white/10 bg-background/28 p-5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/75">
                    Operations Pulse
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    即時節奏
                  </h3>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      完成比例
                    </span>
                    <span className="text-lg font-semibold text-foreground">
                      {completionRate}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/55">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(191_95%_68%))]"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      進行中
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-foreground">
                      {ongoingSystems}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      未開始
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-foreground">
                      {notStartedSystems}
                    </p>
                  </div>
                </div>

                <p className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] px-4 py-3 text-sm leading-6 text-muted-foreground">
                  如果你要做專案結案封存，建議直接從右上角選單匯出整站 HTML。
                  下載後的檔案可離線打開，方便後續回顧、交接與比對不同專案版本。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DashboardSection
        eyebrow="Overview"
        title="站點總覽"
        description="快速查看目前站點數量、每日目標與整體測試佈局，作為當前專案的基礎摘要。"
      />
      <StationOverview />

      <DashboardSection
        eyebrow="Quality"
        title="通過率與品質"
        description="用統一視角追蹤目前測試通過比例與達成狀況，方便評估整體品質成熟度。"
      />
      <TestPassRateCard />

      <div className="grid gap-4 md:grid-cols-2">
        <StatsCard
          title="進行中機台"
          value={`${ongoingSystems}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${notStartedSystems} 台尚未開始`}
          variant={ongoingSystems > 0 ? "warning" : "success"}
        />
        <StatsCard
          title="系統完成概況"
          value={`${completedSystems}/${totalSystems}`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={`完成率 ${completionRate}%`}
          variant={completionRate >= 70 ? "success" : "warning"}
        />
      </div>

      <DashboardSection
        eyebrow="Analysis"
        title="站點平均時間"
        description="觀察各站平均耗時與瓶頸位置，幫助你判斷哪一段流程最值得優先優化。"
      />
      <StationAverageTimeChart />

      <DailyStationCompletionChart />

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
