import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { StationTimeComparison } from "./StationTimeComparison";
import { DailyCompletion } from "./DailyCompletion";
import { StationHeatmap } from "./StationHeatmap";
import { MachineTable } from "./MachineTable";
import { ProjectGanttChart } from "./ProjectGanttChart";
import { SystemStatusList } from "./SystemStatusList";
import { StationOverview } from "./StationOverview";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stationStatuses, stations } = useUnifiedData();
  
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  // Calculate real-time metrics from actual data
  const totalSystems = systems.length;
  const completedSystems = systems.filter(s => s.status === 'Done').length;
  const ongoingSystems = systems.filter(s => s.status === 'On-going').length;
  const notStartedSystems = systems.filter(s => s.status === 'Not Start').length;
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
  
  // Calculate system efficiency (running stations)
  const runningStations = stationStatuses.filter(s => s.status === 'working' || s.status === 'complete').length;
  const systemEfficiency = stations.length > 0 ? Math.round((runningStations / stations.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">系統儀表板</h1>
        <p className="text-muted-foreground">
          測試管理系統總覽 - 實時監控測試進度與系統狀態
        </p>
      </div>

      {/* Station Overview */}
      <StationOverview />

      {/* Key Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatsCard
          title="測試通過率"
          value={`${passRate}%`}
          icon={<CheckCircle className="h-4 w-4" />}
          description={`${passedTests}項完成 / ${totalProgress}項總測試`}
          trend={{ value: passRate >= 70 ? 5.2 : -2.8, isPositive: passRate >= 70 }}
          variant={passRate >= 70 ? "success" : "warning"}
        />
        <StatsCard
          title="平均進度"
          value={`${averageProgress}%`}
          icon={<Clock className="h-4 w-4" />}
          description={`系統整體測試進度`}
          trend={{ value: averageProgress >= 50 ? 3.1 : -1.5, isPositive: averageProgress >= 50 }}
          variant={averageProgress >= 50 ? "success" : "warning"}
        />
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
        <StatsCard
          title="站點效能"
          value={`${systemEfficiency}%`}
          icon={<Zap className="h-4 w-4" />}
          description={`${runningStations}/${stations.length} 站點運行中`}
          trend={{ value: systemEfficiency >= 70 ? 2.1 : -1.2, isPositive: systemEfficiency >= 70 }}
          variant={systemEfficiency >= 70 ? "success" : "warning"}
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Station Time Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>各站測試工時比較</CardTitle>
          </CardHeader>
          <CardContent>
            <StationTimeComparison />
          </CardContent>
        </Card>

        {/* Daily Completion */}
        <Card>
          <CardHeader>
            <CardTitle>每日完成與預計完成狀況</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyCompletion />
          </CardContent>
        </Card>
      </div>

      {/* Gantt Chart */}
      <ProjectGanttChart />

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
    </div>
  );
}