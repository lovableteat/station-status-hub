
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
  ongoingUnits: number;
  notStartedUnits: number;
}

export function TestPassRateCard() {
  const { systems, progress, stations, testItems, isLoading } = useUnifiedData();
  const [metrics, setMetrics] = useState({
    totalUnits: 0,
    completedUnits: 0,
    passRate: 0,
    ongoingUnits: 0,
    notStartedUnits: 0
  });

  // Helper function to get current station status for a system
  const getCurrentStationStatus = (system: any) => {
    // If current_station is already set correctly, use it
    if (system.current_station === '已完成' || system.current_station === '未開始') {
      return system.current_station;
    }
    
    // Check if it's a Station 0-4 (these are considered "進行中")
    const stations0To4Names = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 4)
      .map(station => station.station_name);
    
    if (stations0To4Names.includes(system.current_station)) {
      return '進行中';
    }
    
    return system.current_station;
  };

  useEffect(() => {
    if (!isLoading) {
      calculateMetrics();
    }
  }, [systems, progress, stations, testItems, isLoading]);

  const calculateMetrics = () => {
    if (!systems.length) return;

    const totalUnits = systems.length;
    
    // Count based on current_station field
    let completedUnits = 0;
    let ongoingUnits = 0;
    let notStartedUnits = 0;
    
    systems.forEach(system => {
      const status = getCurrentStationStatus(system);
      
      if (status === '已完成') {
        completedUnits++;
      } else if (status === '未開始') {
        notStartedUnits++;
      } else if (status === '進行中') {
        ongoingUnits++;
      }
    });
    
    // Calculate pass rate = completed / total
    const passRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

    setMetrics({
      totalUnits,
      completedUnits,
      passRate,
      ongoingUnits,
      notStartedUnits
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
            <span>目標: 100%</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            * 基於當前站點欄位統計
          </div>
        </CardContent>
      </Card>

      {/* 統計摘要 - 基於當前站點欄位 */}
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
                {metrics.ongoingUnits} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>未開始:</span>
              <span className="font-medium text-muted-foreground">
                {metrics.notStartedUnits} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>已完成:</span>
              <span className="font-medium text-success">
                {metrics.completedUnits} 台
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            * Station 0-4 顯示為進行中
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
