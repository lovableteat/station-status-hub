
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
  const visibleSystems = systems.filter(system => !system.exclude_from_dashboard);
  const [metrics, setMetrics] = useState({
    totalUnits: 0,
    completedUnits: 0,
    passRate: 0,
    ongoingUnits: 0,
    notStartedUnits: 0
  });

  // Helper function to check if all stations 0-4 are 100% complete
  const areAllStationsComplete = (systemId: string) => {
    const stations0To4 = stations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.every(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return true;
      
      const completedItems = stationItems.filter(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        return prog?.status === 'Done';
      });
      return completedItems.length === stationItems.length;
    });
  };

  // Helper function to check if any progress exists for stations 0-4
  const hasAnyProgress = (systemId: string) => {
    const stations0To4 = stations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.some(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      return stationItems.some(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        return prog?.status === 'Done';
      });
    });
  };

  // Get current station status for a system (進行中、未開始、已完成)
  const getCurrentStationStatus = (systemId: string) => {
    const allStationsComplete = areAllStationsComplete(systemId);
    const anyProgress = hasAnyProgress(systemId);
    
    if (allStationsComplete) {
      return '已完成';
    } else if (anyProgress) {
      return '進行中';
    } else {
      return '未開始';
    }
  };

  useEffect(() => {
    if (!isLoading) {
      calculateMetrics();
    }
  }, [visibleSystems, progress, stations, testItems, isLoading]);

  const calculateMetrics = () => {
    if (!visibleSystems.length) {
      setMetrics({
        totalUnits: 0,
        completedUnits: 0,
        passRate: 0,
        ongoingUnits: 0,
        notStartedUnits: 0
      });
      return;
    }

    const totalUnits = visibleSystems.length;
    
    // Count based on current station status logic
    let completedUnits = 0;
    let ongoingUnits = 0;
    let notStartedUnits = 0;
    
    visibleSystems.forEach(system => {
      const status = getCurrentStationStatus(system.id);
      
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
      <Card className="border-primary/35 bg-primary/[0.05]">
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
      <Card className="border-amber-300/30 bg-amber-400/[0.05]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium sm:text-sm">測試通過率</CardTitle>
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
          <CardTitle className="text-sm font-medium sm:text-sm">統計摘要</CardTitle>
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
            * 基於當前站點欄位統計
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
