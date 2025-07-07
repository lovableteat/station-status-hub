
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
  const { systems, progress, stations, testItems, isLoading } = useUnifiedData();
  const [metrics, setMetrics] = useState({
    totalUnits: 0,
    completedUnits: 0,
    passRate: 0,
    targetPassRate: 100
  });

  // 檢查系統是否完成（Station 0-4 全部100%）
  const isSystemCompleted = (systemId: string) => {
    // 取得Station 0-4
    const stations0To4 = stations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    return stations0To4.every(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return true; // 如果沒有測試項目，視為完成
      
      const completedItems = stationItems.filter(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id &&
          p.status === 'Done'
        );
        return prog;
      });
      
      return completedItems.length === stationItems.length;
    });
  };

  useEffect(() => {
    if (!isLoading) {
      calculateMetrics();
    }
  }, [systems, progress, stations, testItems, isLoading]);

  const calculateMetrics = () => {
    if (!systems.length) return;

    // 計算總台數和完成台數（基於Station 0-4全部100%的邏輯）
    const totalUnits = systems.length;
    const completedUnits = systems.filter(system => isSystemCompleted(system.id)).length;
    
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
          <div className="text-xs text-muted-foreground mt-1">
            * 基於Station 0-4全部完成的標準計算
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
                {systems.filter(s => !isSystemCompleted(s.id) && 
                  progress.some(p => p.system_id === s.id && p.status !== 'Not Start')).length} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>未開始:</span>
              <span className="font-medium text-muted-foreground">
                {systems.filter(s => !isSystemCompleted(s.id) && 
                  !progress.some(p => p.system_id === s.id && p.status !== 'Not Start')).length} 台
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
