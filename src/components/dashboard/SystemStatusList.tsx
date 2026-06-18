
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Play,
  Eye,
  Zap
} from "lucide-react";

interface SystemStatusListProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function SystemStatusList({ onNavigate }: SystemStatusListProps) {
  const { systems, progress, stations, testItems } = useUnifiedData();
  const visibleSystems = systems.filter(system => !system.exclude_from_dashboard);

  // 計算系統在 Station 0-4 的整體進度 - 根據完成幾站來計算
  const calculateSystemOverallProgress = (systemId: string) => {
    // 找出 Station 0-4 的站點
    const targetStations = stations.filter(station => 
      station.station_name.includes('Station 0') || station.station_name.includes('組裝') ||
      station.station_name.includes('Station 1') || station.station_name.includes('開機') ||
      station.station_name.includes('Station 2') || station.station_name.includes('FW') ||
      station.station_name.includes('Station 3') || station.station_name.includes('EE') ||
      station.station_name.includes('Station 4') || station.station_name.includes('NV TEST')
    );

    if (targetStations.length === 0) return 0;

    let completedStations = 0;

    // 檢查每個站點是否完成（該站點的所有測項都是 Done 狀態）
    targetStations.forEach(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return; // 沒有測項的站點跳過
      
      const completedItems = stationItems.filter(item => {
        const itemProgress = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id &&
          p.status === 'Done'
        );
        return itemProgress;
      });

      // 如果該站點所有測項都完成，則站點完成
      if (completedItems.length === stationItems.length && stationItems.length > 0) {
        completedStations++;
      }
    });

    // 整體進度 = (完成的站點數 / 總站點數) * 100
    return Math.round((completedStations / targetStations.length) * 100);
  };

  const getStatusIcon = (status: string, progress: number) => {
    if (status === 'Done' || progress === 100) return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === 'On-going' || progress > 0) {
      if (progress > 75) return <Activity className="h-4 w-4 text-success animate-pulse" />;
      if (progress > 25) return <Zap className="h-4 w-4 text-warning animate-pulse" />;
      return <AlertTriangle className="h-4 w-4 text-danger animate-bounce" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusColor = (status: string, progress: number) => {
    if (status === 'Done' || progress === 100) return 'bg-success text-success-foreground';
    if (status === 'On-going' || progress > 0) return 'bg-warning text-warning-foreground';
    return 'bg-muted text-muted-foreground';
  };

  const getAnimationClass = (status: string, progress: number) => {
    if (progress > 0 && progress < 100) {
      if (progress < 25) return 'border-danger/30 shadow-[0_20px_46px_-38px_hsl(var(--danger)/0.85)]';
      if (progress < 75) return 'border-warning/30 shadow-[0_20px_46px_-38px_hsl(var(--warning)/0.85)]';
      return 'border-success/30 shadow-[0_20px_46px_-38px_hsl(var(--success)/0.85)]';
    }
    if (progress === 100) return 'border-success/22 shadow-[0_20px_46px_-38px_hsl(var(--success)/0.55)]';
    return 'border-white/8 shadow-[0_20px_46px_-42px_hsl(var(--background)/0.95)]';
  };

  const getCardTone = (status: string, progress: number) => {
    if (status === 'Done' || progress === 100) {
      return 'bg-[radial-gradient(circle_at_top_right,hsl(var(--success)/0.18),transparent_28%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]';
    }
    if (status === 'On-going' || progress > 0) {
      return 'bg-[radial-gradient(circle_at_top_right,hsl(var(--warning)/0.18),transparent_28%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]';
    }
    return 'bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_28%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]';
  };

  const handleSystemClick = (systemName: string) => {
    onNavigate?.('test-tracker', { system: systemName });
  };

  const handleMonitorClick = (systemName: string) => {
    onNavigate?.('monitor', { system: systemName });
  };

  return (
    <Card className="overflow-hidden rounded-[30px] border border-amber-300/20 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] shadow-[0_24px_64px_-48px_hsl(43_96%_56%/0.42)]">
      <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,hsl(43_96%_56%/0.08),transparent)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-100/65">即時狀態板</p>
            <CardTitle className="mt-3 flex items-center gap-2 text-2xl font-semibold sm:text-2xl">
              <Activity className="h-5 w-5" />
              所有機台即時狀況
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              原本邏輯不變，僅將系統卡片做成更清楚的即時狀態版面。
            </p>
          </div>
          <Badge
            variant="secondary"
            className="w-fit rounded-full border border-amber-300/18 bg-background/35 px-4 py-2 text-sm font-medium text-amber-100"
          >
            共 {visibleSystems.length} 台
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleSystems.map(system => {
            // 使用新的進度計算邏輯 - 根據 Station 0-4 完成幾站來計算
            const progressPercent = calculateSystemOverallProgress(system.id);

            return (
              <Card
                key={system.id}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-[28px] border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_60px_-44px_hsl(var(--primary)/0.55)]",
                  getCardTone(system.status, progressPercent),
                  getAnimationClass(system.status, progressPercent)
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
                <CardContent className="p-5">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-background/28">
                          {getStatusIcon(system.status, progressPercent)}
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">系統</p>
                          <h4 className="mt-1 font-semibold text-sm">{system.system_name}</h4>
                        </div>
                      </div>
                      <Badge className={cn("rounded-full px-3 py-1 text-xs font-medium", getStatusColor(system.status, progressPercent))} variant="secondary">
                        {progressPercent === 100 ? '已完成' : progressPercent > 0 ? '進行中' : '未開始'}
                      </Badge>
                    </div>

                    {/* Progress */}
                    <div className="rounded-2xl border border-white/8 bg-background/24 p-4">
                      <div className="flex justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <span>Station 0-4 進度</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <Progress 
                        value={progressPercent} 
                        className="mt-3 h-3 bg-background/55"
                      />
                    </div>

                     {/* Details */}
                     <div className="grid grid-cols-2 gap-3 text-xs">
                       <div className="rounded-2xl border border-white/8 bg-background/22 p-3">
                         <span className="text-muted-foreground">當前站點</span>
                         <p className="mt-2 font-medium leading-6">{system.current_station}</p>
                       </div>
                       <div className="rounded-2xl border border-white/8 bg-background/22 p-3">
                         <span className="text-muted-foreground">負責人</span>
                         <p className="mt-2 font-medium leading-6">{system.assigned_engineer || '未分配'}</p>
                       </div>
                        {(system as any).team && (
                          <>
                            <div className="rounded-2xl border border-white/8 bg-background/22 p-3 col-span-2">
                              <span className="text-muted-foreground">位置</span>
                              <p className="mt-2 font-medium text-primary leading-6">{(system as any).team}</p>
                            </div>
                          </>
                        )}
                     </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 flex-1 rounded-2xl border-white/10 bg-background/24 hover:bg-primary/10"
                        onClick={() => handleSystemClick(system.system_name)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        測試追蹤
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 flex-1 rounded-2xl border-white/10 bg-background/24 hover:bg-primary/10"
                        onClick={() => handleMonitorClick(system.system_name)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        即時監控
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {visibleSystems.length === 0 && (
          <div className="py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-background/25">
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-5 text-lg font-medium mb-2">沒有系統資料</h3>
            <p className="text-muted-foreground">請先在測試追蹤頁面新增系統</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
