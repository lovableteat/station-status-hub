
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
import { AlertTriangle, TrendingUp, Download, LayoutDashboard } from "lucide-react";
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
  
  return (
    <div className="space-y-6 p-4 animate-fade-in sm:p-6" data-dashboard-content>
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-[linear-gradient(135deg,hsl(var(--primary)/0.10),hsl(var(--card)/0.88)_48%,hsl(245_58%_66%/0.08))] p-5 shadow-[0_18px_55px_-40px_hsl(var(--primary)/0.7)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border border-primary/25 bg-background/45 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-primary/80 backdrop-blur">
              Dashboard Control Room
            </div>
            <h1 className="text-3xl font-bold tracking-tight">系統儀表板</h1>
            <p className="mt-1 text-muted-foreground">
              測試管理系統總覽 - 實時監控測試進度與系統狀態
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {headerStats.map((stat) => (
                <Badge
                  key={stat.label}
                  variant="secondary"
                  className={`gap-2 rounded-full px-3 py-1 text-xs font-medium ${stat.className}`}
                >
                  <span className="opacity-75">{stat.label}</span>
                  <span className="font-semibold text-foreground">{stat.value}</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-primary/25 bg-background/60 backdrop-blur hover:bg-primary/10">
                <Download className="h-4 w-4 mr-2" />
                匯出選項
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                <Download className="h-4 w-4 mr-2" />
                匯出資料報表
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Station Overview */}
      <StationOverview />

      {/* Test Pass Rate Metrics */}
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
      <StationAverageTimeChart />

      {/* Daily Station Completion Chart */}
      <DailyStationCompletionChart />

      {/* System Status List */}
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
