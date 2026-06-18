
import { useState } from "react";
import { StatsCard } from "./StatsCard";
import { SystemStatusList } from "./SystemStatusList";
import { StationOverview } from "./StationOverview";
import { TestPassRateCard } from "./TestPassRateCard";
import { StationAverageTimeChart } from "./StationAverageTimeChart";
import { DailyStationCompletionChart } from "./DailyStationCompletionChart";
import { ExportDialog } from "@/components/production/ExportDialog";
import { BackButton } from "@/components/common/BackButton";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  AlertTriangle,
  TrendingUp,
  Download,
  LayoutDashboard,
  Gauge,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

interface DashboardSectionProps {
  eyebrow: string;
  title: string;
  description: string;
}

function DashboardSection({ eyebrow, title, description }: DashboardSectionProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/75">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stations, testItems } = useUnifiedData();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // 排除設定為不列入統計的系統
  const filteredSystems = systems.filter(system => !system.exclude_from_dashboard);
  const totalSystems = filteredSystems.length;
  
  // 基於系統狀態與整體進度統計
  const completedSystems = filteredSystems.filter(system => system.overall_progress === 100 || system.status === 'Done').length;
  const ongoingSystems = filteredSystems.filter(system => (system.overall_progress > 0 && system.overall_progress < 100) || system.status === 'On-going').length;
  const notStartedSystems = filteredSystems.filter(system => system.overall_progress === 0 || system.status === 'Not Start').length;
  
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;
  const headerStats = [
    {
      label: "納入統計",
      value: `${totalSystems} 台`,
      className: "border-primary/35 bg-primary/12 text-primary"
    },
    {
      label: "已完成",
      value: `${completedSystems} 台`,
      className: "border-emerald-300/30 bg-emerald-400/12 text-emerald-200"
    },
    {
      label: "完成率",
      value: `${completionRate}%`,
      className: "border-amber-300/30 bg-amber-400/12 text-amber-200"
    }
  ];
  const heroSignals = [
    {
      title: "即時追蹤",
      value: `${ongoingSystems} 台`,
      description: "系統正在測試流程中",
      icon: Radar,
      tone: "border-sky-300/20 bg-sky-400/[0.08] text-sky-100",
    },
    {
      title: "品質狀態",
      value: `${completedSystems} / ${totalSystems}`,
      description: "目前已完成的系統數量",
      icon: ShieldCheck,
      tone: "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100",
    },
    {
      title: "待補處理",
      value: `${notStartedSystems} 台`,
      description: "尚未開始的測試系統",
      icon: Sparkles,
      tone: "border-amber-300/20 bg-amber-400/[0.08] text-amber-100",
    },
  ];
  
  return (
    <div className="space-y-8 p-4 animate-fade-in sm:p-6" data-dashboard-content>
      {/* Header */}
      <div className="relative overflow-hidden rounded-[32px] border border-primary/20 bg-[linear-gradient(135deg,hsl(224_36%_16%),hsl(224_29%_13%)_42%,hsl(229_38%_18%)_100%)] shadow-[0_36px_100px_-60px_hsl(var(--primary)/0.9)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.26),transparent_22%),radial-gradient(circle_at_85%_18%,hsl(189_80%_55%/0.16),transparent_18%),linear-gradient(120deg,transparent_0%,hsl(0_0%_100%/0.025)_48%,transparent_52%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-[18%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent lg:block hidden" />
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
                    用更清楚的節奏與層次查看整體測試進度、站點效率與系統即時狀態，
                    讓每天的工廠決策更快更穩。
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
                    <span className="font-semibold text-foreground">{stat.value}</span>
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
                        <p className="text-[11px] uppercase tracking-[0.24em] text-current/70">{signal.title}</p>
                        <p className="mt-3 text-2xl font-semibold text-foreground">{signal.value}</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-current/20 bg-background/25 text-current">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-current/75">{signal.description}</p>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-background/28 p-5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/75">
                    Operations Pulse
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">今日監控重點</h3>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">完成進度</span>
                    <span className="text-lg font-semibold text-foreground">{completionRate}%</span>
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
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">進行中</p>
                    <p className="mt-3 text-3xl font-semibold text-foreground">{ongoingSystems}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">未開始</p>
                    <p className="mt-3 text-3xl font-semibold text-foreground">{notStartedSystems}</p>
                  </div>
                </div>

                <p className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] px-4 py-3 text-sm leading-6 text-muted-foreground">
                  把整體進度、待補處理量與完成率集中在同一個控制面板，方便現場快速掃視。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Station Overview */}
      <DashboardSection
        eyebrow="Overview"
        title="核心總覽"
        description="把總量、測試工時、目標與站點一次排開，先掌握今日節奏，再往下看品質與效率。"
      />
      <StationOverview />

      {/* Test Pass Rate Metrics */}
      <DashboardSection
        eyebrow="Quality"
        title="品質與節奏"
        description="用更聚焦的視覺呈現通過率、進行中系統與整體完成狀態，方便快速掃描。"
      />
      <TestPassRateCard />

      {/* Key Performance Indicators - 移除活躍工程師板塊 */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatsCard
          title="進行中系統"
          value={`${ongoingSystems}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${notStartedSystems}個未開始待處理`}
          variant={ongoingSystems > 0 ? "warning" : "success"}
        />
        <StatsCard
          title="系統完成狀況"
          value={`${completedSystems}/${totalSystems}`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={`完成率 ${completionRate}%`}
          variant={completionRate >= 70 ? "success" : "warning"}
        />
      </div>

      {/* Station Average Time Chart */}
      <DashboardSection
        eyebrow="Analysis"
        title="工站分析"
        description="從處理時間與每日完成趨勢觀察各站節奏，快速找出瓶頸與異常波動。"
      />
      <StationAverageTimeChart />

      {/* Daily Station Completion Chart */}
      <DailyStationCompletionChart />

      {/* System Status List */}
      <DashboardSection
        eyebrow="Live"
        title="即時作業"
        description="保留原本的系統狀態邏輯，只把資訊卡改得更清楚，讓現場查看時更直觀。"
      />
      <SystemStatusList onNavigate={onNavigate} />

      {/* Export Dialogs */}
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
