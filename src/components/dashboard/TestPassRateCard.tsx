import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, BarChart3 } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";

interface PassRateMetrics {
  totalUnits: number;
  completedUnits: number;
  passRate: number;
  dailyAverage: number;
  weeklyTrend: number;
  targetPassRate: number;
}

export function TestPassRateCard() {
  const { systems, progress, isLoading } = useUnifiedData();
  const [metrics, setMetrics] = useState({
    totalUnits: 0,
    completedUnits: 0,
    passRate: 0,
      targetPassRate: 100
  });

  useEffect(() => {
    if (!isLoading) {
      calculateMetrics();
    }
  }, [systems, progress, isLoading]);

  const calculateMetrics = () => {
    if (!systems.length) return;

    // 計算總台數和完成台數
    const totalUnits = systems.length;
    const completedUnits = systems.filter(system => system.status === 'Done').length;
    
    // 計算通過率 = 完成台數 / 總台數
    const passRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

    setMetrics({
      totalUnits,
      completedUnits,
      passRate,
      targetPassRate: 100
    });
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 100) return 'text-success';
    if (rate >= 80) return 'text-warning';
    return 'text-danger';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-2/3"></div>
            <div className="h-2 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 總體通過率 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">測試通過率</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold mb-2">
            <span className={getPassRateColor(metrics.passRate)}>
              {metrics.passRate}%
            </span>
          </div>
          <Progress value={metrics.passRate} className="mb-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{metrics.completedUnits} / {metrics.totalUnits} 台</span>
            <span>目標: {metrics.targetPassRate}%</span>
          </div>
        </CardContent>
      </Card>

      {/* 統計摘要 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">統計摘要</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>進行中:</span>
              <span className="font-medium text-warning">
                {systems.filter(s => s.status === 'On-going').length} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>未開始:</span>
              <span className="font-medium text-muted-foreground">
                {systems.filter(s => s.status === 'Not Start').length} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>已完成:</span>
              <span className="font-medium text-success">
                {metrics.completedUnits} 台
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}