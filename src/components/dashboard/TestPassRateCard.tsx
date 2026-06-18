
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      {/* 總體通過率 */}
      <Card className="relative overflow-hidden rounded-[28px] border border-amber-300/22 bg-[radial-gradient(circle_at_top_right,hsl(43_96%_56%/0.18),transparent_28%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] shadow-[0_18px_48px_-40px_hsl(43_96%_56%/0.4)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-100/65">通過率</p>
            <CardTitle className="mt-3 text-xl font-semibold sm:text-xl">測試通過率</CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              維持原本統計邏輯，只把完成度呈現得更清楚、更容易一眼辨識。
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]">
            <Target className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-5xl font-semibold tracking-tight">
                <span className={getPassRateColor(metrics.passRate)}>
                  {metrics.passRate}%
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {metrics.completedUnits} / {metrics.totalUnits} 台已達成目前的完成條件
              </p>
            </div>
            <Badge
              variant="secondary"
              className="w-fit rounded-full border border-amber-300/18 bg-background/35 px-4 py-2 text-sm font-medium text-amber-100 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05)]"
            >
              目標完成率 100%
            </Badge>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-background/25 p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="text-3xl font-semibold">
                <span className={getPassRateColor(metrics.passRate)}>
                  {metrics.passRate}%
                </span>
              </div>
              <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">目前完成度</span>
            </div>
            <Progress value={metrics.passRate} className="h-3 bg-background/55" />
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{metrics.completedUnits} / {metrics.totalUnits} 台</span>
              <span>目標: 100%</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-400/[0.06] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">已完成</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metrics.completedUnits}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/14 bg-amber-400/[0.06] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100/70">進行中</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metrics.ongoingUnits}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-background/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">未開始</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metrics.notStartedUnits}</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            * 基於當前站點欄位統計
          </div>
        </CardContent>
      </Card>

      {/* 統計摘要 - 基於當前站點欄位 */}
      <Card className="relative overflow-hidden rounded-[28px] border border-primary/22 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_30%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] shadow-[0_20px_50px_-42px_hsl(var(--primary)/0.45)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/75">摘要</p>
            <CardTitle className="mt-3 text-xl font-semibold sm:text-xl">統計摘要</CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              保留原本完成、進行中、未開始的判斷方式，只升級成更清楚的管理面板。
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]">
            <BarChart3 className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {[
            { label: "進行中", value: metrics.ongoingUnits, tone: "border-amber-300/14 bg-amber-400/[0.06] text-amber-100", accent: "text-amber-200" },
            { label: "未開始", value: metrics.notStartedUnits, tone: "border-white/8 bg-background/28 text-foreground", accent: "text-muted-foreground" },
            { label: "已完成", value: metrics.completedUnits, tone: "border-emerald-300/14 bg-emerald-400/[0.06] text-emerald-100", accent: "text-primary" },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${item.tone}`}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-current/65">{item.label}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.label === "進行中"
                    ? "正在消化測試項目"
                    : item.label === "未開始"
                      ? "尚未排入處理節奏"
                      : "已達成目前完成條件"}
                </p>
              </div>
              <span className={`text-3xl font-semibold ${item.accent}`}>{item.value}</span>
            </div>
          ))}

          <div className="rounded-2xl border border-primary/12 bg-primary/[0.05] px-4 py-3 text-xs leading-6 text-muted-foreground">
            * 基於當前站點欄位統計
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
