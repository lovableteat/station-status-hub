import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Monitor, Activity, AlertTriangle, CheckCircle, Clock, Download, ArrowLeft, Play, Bug, ExternalLink, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { TestProgressAuditLog } from "./TestProgressAuditLog";
import { ExportDialog } from "./ExportDialog";

interface Station {
  id: string;
  name: string;
  status: "idle" | "working" | "warning" | "error" | "complete";
  current_system?: string;
  efficiency: number;
  last_update: string;
}

export function ProductionMonitor() {
  const { stationStatuses: stations, systems, isLoading } = useUnifiedData();
  const { toast } = useToast();
  const [focusedSystem, setFocusedSystem] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showProductionHistory, setShowProductionHistory] = useState(false);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const systemParam = urlParams.get('system');
    if (systemParam) {
      setFocusedSystem(systemParam);
    }
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working': return 'bg-station-working text-primary-foreground';
      case 'complete': return 'bg-success text-success-foreground';
      case 'warning': return 'bg-warning text-warning-foreground';
      case 'error': return 'bg-danger text-danger-foreground';
      case 'idle': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working': return <Activity className="h-4 w-4" />;
      case 'complete': return <CheckCircle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'error': return <AlertTriangle className="h-4 w-4" />;
      case 'idle': return <Clock className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const exportData = () => {
    setShowExportDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If focused on specific system, show detailed view
  if (focusedSystem) {
    const system = systems.find(s => s.system_name === focusedSystem);
    if (!system) {
      return (
        <div className="p-6 text-center">
          <p className="text-muted-foreground">系統 {focusedSystem} 未找到</p>
          <Button onClick={() => setFocusedSystem(null)} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回總覽
          </Button>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={() => setFocusedSystem(null)} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回總覽
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{system.system_name} - 生產監控</h1>
              <p className="text-muted-foreground">即時測試進度 - 當前站點: {system.current_station}</p>
            </div>
          </div>
          <Badge className={getStatusColor(system.status)} variant="outline">
            <Play className="h-3 w-3 mr-1" />
            {system.status === 'Done' ? '已完成' : system.status === 'On-going' ? '進行中' : '未開始'}
          </Badge>
        </div>

        {/* Video-style Station Flow */}
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              測試流程監控
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stations.map((station, index) => {
                const isActive = system.current_station === station.name;
                const isCompleted = stations.slice(0, index).every(s => s.efficiency === 100);
                
                return (
                  <div key={station.id} className={`relative p-4 rounded-lg border-2 transition-all ${
                    isActive ? 'border-primary bg-primary/10 shadow-lg' : 
                    isCompleted ? 'border-success bg-success/10' : 'border-muted bg-muted/50'
                  }`}>
              <div className="text-center space-y-2">
                <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
                  isActive ? 'bg-primary text-primary-foreground animate-pulse' :
                  isCompleted ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {getStatusIcon(isActive ? 'working' : isCompleted ? 'complete' : 'idle')}
                </div>
                <h3 className="font-medium text-sm">{station.name}</h3>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">進度: {station.efficiency}%</div>
                  <Progress value={station.efficiency} className="h-1" />
                </div>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      // Navigate to issue tracker with station filter
                      const event = new CustomEvent('navigate', { 
                        detail: { 
                          module: 'issues', 
                          params: { 
                            station: station.name, 
                            system: system.system_name 
                          } 
                        } 
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    <Bug className="h-3 w-3 mr-1" />
                    問題
                  </Button>
                </div>
                {isActive && (
                  <div className="absolute -top-2 -right-2">
                    <div className="w-4 h-4 bg-primary rounded-full animate-ping"></div>
                  </div>
                )}
              </div>
                  </div>
                );
              })}
            </div>
            
            {/* Progress Arrow */}
            <div className="mt-6 text-center">
              <div className="text-2xl font-bold text-primary">
                整體進度: {system.overall_progress}%
              </div>
              <Progress value={system.overall_progress} className="mt-2 h-3" />
            </div>
          </CardContent>
        </Card>

        {/* System Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{system.assigned_engineer}</div>
              <div className="text-sm text-muted-foreground">負責工程師</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-success">{system.overall_progress}%</div>
              <div className="text-sm text-muted-foreground">完成進度</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-warning">
                {new Date().toLocaleDateString('zh-TW')}
              </div>
              <div className="text-sm text-muted-foreground">監控日期</div>
            </CardContent>
          </Card>
        </div>

        {/* Test Progress Audit Log */}
        <TestProgressAuditLog 
          systemId={system.id}
          systemName={system.system_name}
        />

        {/* Production History Dialog */}
        {showProductionHistory && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>機台生產履歷 - {system.system_name}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowProductionHistory(false)}>
                  關閉
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">返工紀錄</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>• Station 1 → Station 0 (2024-07-03 14:30) - 功能測試失敗，需重新檢查</p>
                      <p>• Station 2 → Station 1 (2024-07-02 09:15) - 軟體版本問題，需更新</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">瓶頸分析</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>• Station 1 平均停留時間: 2.5天 (標準: 1.5天)</p>
                      <p>• 主要問題: 軟體相容性測試</p>
                      <p>• 建議: 增加預檢程序</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">生產軌跡</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>• 2024-07-01 10:00 - 開始 Station 0</p>
                      <p>• 2024-07-02 15:30 - 轉入 Station 1</p>
                      <p>• 2024-07-03 11:45 - 轉入 Station 2</p>
                      <p>• 2024-07-04 16:20 - 目前 Station 2 (進行中)</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Export Dialog */}
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          title="生產監控報表"
          data={systems}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">生產監控牆</h1>
          <p className="text-muted-foreground">實時機台狀態監控 - 測試站點總覽</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowProductionHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            生產履歷
          </Button>
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4 mr-2" />
            匯出報表
          </Button>
        </div>
      </div>

      {/* ... keep existing code for stations grid and other components ... */}

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="生產監控報表"
        data={systems}
      />
    </div>
  );
}