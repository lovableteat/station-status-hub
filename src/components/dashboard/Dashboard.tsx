
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { DailyCompletion } from "./DailyCompletion";
import { StationHeatmap } from "./StationHeatmap";
import { MachineTable } from "./MachineTable";
import { SystemStatusList } from "./SystemStatusList";
import { StationOverview } from "./StationOverview";
import { TestPassRateCard } from "./TestPassRateCard";
import { StationAverageTimeChart } from "./StationAverageTimeChart";
import { ExportDialog } from "@/components/production/ExportDialog";
import { BackButton } from "@/components/common/BackButton";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stationStatuses, stations, testItems } = useUnifiedData();
  const { toast } = useToast();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  // 直接使用系統的 current_station 欄位進行統計
  const totalSystems = systems.length;
  
  // 基於 current_station 欄位統計
  const completedSystems = systems.filter(system => system.current_station === '已完成').length;
  const ongoingSystems = systems.filter(system => system.current_station === '進行中').length;
  const notStartedSystems = systems.filter(system => system.current_station === '未開始').length;
  
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;
  
  // Calculate average progress
  const averageProgress = totalSystems > 0 
    ? Math.round(systems.reduce((sum, s) => sum + (s.overall_progress || 0), 0) / totalSystems)
    : 0;
    
  // Calculate test pass rate
  const totalProgress = progress.length;
  const passedTests = progress.filter(p => p.status === 'Done').length;
  const passRate = totalProgress > 0 ? Math.round((passedTests / totalProgress) * 100) : 0;
  
  // Calculate active engineers
  const engineers = [...new Set(systems.map(s => s.assigned_engineer).filter(Boolean))];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
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
        <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
          <Download className="h-4 w-4 mr-2" />
          匯出報表
        </Button>
      </div>

      {/* Station Overview */}
      <StationOverview />

      {/* Test Pass Rate Metrics */}
      <TestPassRateCard />

      {/* Key Performance Indicators - 基於當前站點統計 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="進行中系統"
          value={`${ongoingSystems}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${notStartedSystems}個未開始待處理`}
          trend={{ value: ongoingSystems > notStartedSystems ? 2.3 : -1.8, isPositive: ongoingSystems > notStartedSystems }}
          variant={ongoingSystems > 0 ? "warning" : "success"}
        />
        <StatsCard
          title="系統完成狀況"
          value={`${completedSystems}/${totalSystems}`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={`完成率 ${completionRate}%`}
          trend={{ value: completionRate >= 70 ? 5.2 : -2.8, isPositive: completionRate >= 70 }}
          variant={completionRate >= 70 ? "success" : "warning"}
        />
        <StatsCard
          title="活躍工程師"
          value={`${engineers.length}`}
          icon={<Users className="h-4 w-4" />}
          description={`負責 ${totalSystems} 個系統`}
          variant="default"
        />
      </div>

      {/* Station Average Time Chart */}
      <StationAverageTimeChart />

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <CardTitle>每日完成與預計完成狀況</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyCompletion />
        </CardContent>
      </Card>

      {/* System Status List */}
      <SystemStatusList onNavigate={onNavigate} />

      {/* Station Heatmap */}
      <Card>
        <CardContent className="pt-6">
          <StationHeatmap onStationClick={handleStationClick} />
        </CardContent>
      </Card>

      {/* Machine List */}
      <Card>
        <CardContent className="pt-6">
          <MachineTable />
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="系統儀表板"
        data={systems}
      />
    </div>
  );
}
