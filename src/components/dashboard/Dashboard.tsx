
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { MachineTable } from "./MachineTable";
import { SystemStatusList } from "./SystemStatusList";
import { StationOverview } from "./StationOverview";
import { TestPassRateCard } from "./TestPassRateCard";
import { StationAverageTimeChart } from "./StationAverageTimeChart";
import { DailyStationCompletionChart } from "./DailyStationCompletionChart";
import { ExportDialog } from "@/components/production/ExportDialog";
import { DashboardScreenshotExporter } from "./DashboardScreenshotExporter";
import { BackButton } from "@/components/common/BackButton";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Download,
  Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stationStatuses, stations, testItems } = useUnifiedData();
  const { toast } = useToast();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [screenshotDialogOpen, setScreenshotDialogOpen] = useState(false);
  
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  // 排除設定為不列入統計的系統
  const filteredSystems = systems.filter(system => !system.exclude_from_dashboard);
  const totalSystems = filteredSystems.length;
  
  // 基於系統狀態與整體進度統計
  const completedSystems = filteredSystems.filter(system => system.overall_progress === 100 || system.status === 'Done').length;
  const ongoingSystems = filteredSystems.filter(system => (system.overall_progress > 0 && system.overall_progress < 100) || system.status === 'On-going').length;
  const notStartedSystems = filteredSystems.filter(system => system.overall_progress === 0 || system.status === 'Not Start').length;
  
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;
  
  // Calculate average progress
  const averageProgress = totalSystems > 0 
    ? Math.round(filteredSystems.reduce((sum, s) => sum + (s.overall_progress || 0), 0) / totalSystems)
    : 0;
  
  // 修改測試通過率計算：基於當前站點已完成的系統數量
  const completedSystemsCount = completedSystems;
  const passRate = totalSystems > 0 ? Math.round((completedSystemsCount / totalSystems) * 100) : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-dashboard-content>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">系統儀表板</h1>
            <p className="text-muted-foreground">
              測試管理系統總覽 - 實時監控測試進度與系統狀態
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
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

      {/* Machine List */}
      <Card>
        <CardContent className="pt-6">
          <MachineTable />
        </CardContent>
      </Card>

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
      
      <DashboardScreenshotExporter
        isOpen={screenshotDialogOpen}
        onClose={() => setScreenshotDialogOpen(false)}
      />
    </div>
  );
}
