import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { StationTimeComparison } from "./StationTimeComparison";
import { DailyCompletion } from "./DailyCompletion";
import { StationHeatmap } from "./StationHeatmap";
import { MachineTable } from "./MachineTable";
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
  const { systems } = useUnifiedData();
  
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  // Calculate total vs completed systems
  const totalSystems = systems.length;
  const completedSystems = systems.filter(s => s.status === 'Done').length;
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">系統儀表板</h1>
        <p className="text-muted-foreground">
          測試管理系統總覽 - 實時監控測試進度與系統狀態
        </p>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatsCard
          title="今日通過率"
          value="78%"
          icon={<CheckCircle className="h-4 w-4" />}
          description="23台完成 / 78台通過"
          trend={{ value: 5.2, isPositive: true }}
          variant="success"
        />
        <StatsCard
          title="平均工時"
          value="2.1h"
          icon={<Clock className="h-4 w-4" />}
          description="較標準工時延遲12分鐘"
          trend={{ value: 8.1, isPositive: false }}
          variant="warning"
        />
        <StatsCard
          title="活躍問題"
          value="12"
          icon={<AlertTriangle className="h-4 w-4" />}
          description="7個高優先級待處理"
          trend={{ value: 15.3, isPositive: false }}
          variant="danger"
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
          title="在線人員"
          value="8/10"
          icon={<Users className="h-4 w-4" />}
          description="2人請假，6人作業中"
          variant="default"
        />
        <StatsCard
          title="系統效能"
          value="94%"
          icon={<Zap className="h-4 w-4" />}
          description="所有系統正常運行"
          trend={{ value: 2.1, isPositive: true }}
          variant="success"
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