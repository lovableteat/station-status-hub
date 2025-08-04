
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUnifiedData } from "@/hooks/useUnifiedData";
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
      if (progress < 25) return 'animate-pulse border-danger/50 shadow-danger/20';
      if (progress < 75) return 'animate-pulse border-warning/50 shadow-warning/20';
      return 'animate-pulse border-success/50 shadow-success/20';
    }
    if (progress === 100) return 'border-success/30 shadow-success/10';
    return '';
  };

  const handleSystemClick = (systemName: string) => {
    onNavigate?.('test-tracker', { system: systemName });
  };

  const handleMonitorClick = (systemName: string) => {
    onNavigate?.('monitor', { system: systemName });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          所有機台即時狀況
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {systems.map(system => {
            // 使用新的進度計算邏輯 - 根據 Station 0-4 完成幾站來計算
            const progressPercent = calculateSystemOverallProgress(system.id);

            return (
              <Card
                key={system.id}
                className={`transition-all duration-300 hover:shadow-lg cursor-pointer ${getAnimationClass(system.status, progressPercent)}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(system.status, progressPercent)}
                        <h4 className="font-semibold text-sm">{system.system_name}</h4>
                      </div>
                      <Badge className={getStatusColor(system.status, progressPercent)} variant="secondary">
                        {progressPercent === 100 ? '已完成' : progressPercent > 0 ? '進行中' : '未開始'}
                      </Badge>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>整體進度 (Station 0-4)</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <Progress 
                        value={progressPercent} 
                        className="h-2"
                      />
                    </div>

                     {/* Details */}
                     <div className="grid grid-cols-2 gap-2 text-xs">
                       <div>
                         <span className="text-muted-foreground">當前站點:</span>
                         <p className="font-medium">{system.current_station}</p>
                       </div>
                       <div>
                         <span className="text-muted-foreground">負責人:</span>
                         <p className="font-medium">{system.assigned_engineer || '未分配'}</p>
                       </div>
                        {(system as any).team && (
                          <>
                            <div>
                              <span className="text-muted-foreground">位置:</span>
                              <p className="font-medium text-primary">{(system as any).team}</p>
                            </div>
                            <div></div>
                          </>
                        )}
                     </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleSystemClick(system.system_name)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        測試追蹤
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
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

        {systems.length === 0 && (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">沒有系統資料</h3>
            <p className="text-muted-foreground">請先在測試追蹤頁面新增系統</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
