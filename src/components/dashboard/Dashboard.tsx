import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { StationTimeChart } from "./StationTimeChart";
import { ProductionTrendChart } from "./ProductionTrendChart";
import { StationHeatmap } from "./StationHeatmap";
import { IssueTypeChart } from "./IssueTypeChart";
import { MachineTable } from "./MachineTable";
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
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

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
          title="今日產能"
          value="23"
          icon={<TrendingUp className="h-4 w-4" />}
          description="目標35台，完成率66%"
          trend={{ value: 12.5, isPositive: false }}
          variant="info"
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Test Pass Rate */}
        <Card>
          <CardHeader>
            <CardTitle>機台通過率分布</CardTitle>
          </CardHeader>
          <CardContent>
            <TestPassChart />
          </CardContent>
        </Card>

        {/* Station Time Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>各站測試工時分布</CardTitle>
          </CardHeader>
          <CardContent>
            <StationTimeChart />
          </CardContent>
        </Card>

        {/* Issue Types */}
        <Card>
          <CardHeader>
            <CardTitle>問題類型統計 Top 5</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueTypeChart />
          </CardContent>
        </Card>
      </div>

      {/* Production Trend */}
      <Card>
        <CardHeader>
          <CardTitle>測試產能趨勢</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductionTrendChart />
        </CardContent>
      </Card>

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