import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Monitor, Activity, AlertTriangle, CheckCircle, Clock, Download, ArrowLeft, Play, Bug, ExternalLink, History, Wifi, WifiOff, Pause, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { TestProgressAuditLog } from "./TestProgressAuditLog";
import { ExportDialog } from "./ExportDialog";
import { ProductionHistory } from "./ProductionHistory";
import { BackButton } from "@/components/common/BackButton";
import { SystemSelectionDialog } from "./SystemSelectionDialog";

interface Station {
  id: string;
  name: string;
  status: "idle" | "working" | "warning" | "error" | "complete" | "offline" | "running";
  current_system?: string;
  efficiency: number;
  last_update: string;
}

interface MachineStatus {
  id: string;
  name: string;
  status: "running" | "idle" | "error" | "offline";
  currentStation: string;
  currentTestItem: string;
  stationProgress: {
    station0: number;
    station1: number;
    station2: number;
    station3: number;
    station4: number;
  };
}

export function ProductionMonitor() {
  const { stationStatuses: stations, systems, testItems, progress, isLoading } = useUnifiedData();
  const { toast } = useToast();
  const [focusedSystem, setFocusedSystem] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showProductionHistory, setShowProductionHistory] = useState(false);
  const [showSystemSelection, setShowSystemSelection] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const systemParam = urlParams.get('system');
    if (systemParam) {
      setFocusedSystem(systemParam);
    }
  }, []);

  // Enhanced status color mapping based on progress
  const getStatusColor = (overallProgress: number, hasError: boolean) => {
    if (hasError) return 'bg-red-500 text-white';
    if (overallProgress === 100) return 'bg-green-500 text-white';
    if (overallProgress >= 1 && overallProgress <= 99) return 'bg-yellow-500 text-white';
    return 'bg-gray-500 text-white'; // 未開始 (0%)
  };

  // Enhanced status icon mapping based on progress
  const getStatusIcon = (overallProgress: number, hasError: boolean) => {
    if (hasError) return <AlertTriangle className="h-4 w-4" />;
    if (overallProgress === 100) return <CheckCircle className="h-4 w-4" />;
    if (overallProgress >= 1 && overallProgress <= 99) return <PlayCircle className="h-4 w-4" />;
    return <Pause className="h-4 w-4" />; // 未開始
  };

  // Get status text based on progress
  const getStatusText = (overallProgress: number, hasError: boolean) => {
    if (hasError) return '異常';
    if (overallProgress === 100) return '已完成';
    if (overallProgress >= 1 && overallProgress <= 99) return '進行中';
    return '未開始';
  };

  // Get current test item for a system at a station
  const getCurrentTestItem = (systemId: string, stationId: string) => {
    const stationItems = testItems.filter(item => item.station_id === stationId);
    const ongoingItem = stationItems.find(item => {
      const prog = progress.find(p => 
        p.system_id === systemId && 
        p.station_id === stationId && 
        p.item_id === item.id &&
        p.status === 'On-going'
      );
      return prog;
    });
    
    return ongoingItem?.item_name || '待開始';
  };

  // Calculate station progress for Station 0-3
  const calculateStationProgress = (stationId: string, systemId: string) => {
    const stationTestItems = testItems.filter(item => item.station_id === stationId);
    const systemStationProgress = progress.filter(p => 
      p.system_id === systemId && p.station_id === stationId
    );
    
    if (stationTestItems.length === 0) return 0;
    
    const completedItems = systemStationProgress.filter(p => p.status === 'Done').length;
    return Math.round((completedItems / stationTestItems.length) * 100);
  };

  // Enhanced overall progress calculation for Station 0-3
  const calculateOverallProgress = (systemId: string) => {
    const targetStations = stations.filter(station => 
      station.id && typeof station.id === 'string' && 
      (station.name.includes('Station 0') || station.name.includes('組裝') ||
       station.name.includes('Station 1') || station.name.includes('開機') ||
       station.name.includes('Station 2') || station.name.includes('FW') ||
       station.name.includes('Station 3') || station.name.includes('EE'))
    );
    
    if (targetStations.length === 0) return 0;
    
    let totalProgress = 0;
    let validStations = 0;
    
    targetStations.forEach(station => {
      const stationProgress = calculateStationProgress(station.id, systemId);
      totalProgress += stationProgress;
      validStations++;
    });
    
    return validStations > 0 ? Math.round(totalProgress / validStations) : 0;
  };

  // Get machine status based on system progress
  const getMachineStatus = (system: any): MachineStatus => {
    const hasError = progress.some(p => p.system_id === system.id && p.status === 'Error');
    const hasOngoing = progress.some(p => p.system_id === system.id && p.status === 'On-going');
    const overallProgress = calculateOverallProgress(system.id);
    
    let status: "running" | "idle" | "error" | "offline" = "idle";
    if (hasError) status = "error";
    else if (overallProgress >= 1 && overallProgress <= 99) status = "running"; // 進行中
    else if (overallProgress === 100) status = "idle"; // 已完成但可用
    else status = "offline"; // 未開始

    // Get current station info
    const currentStationName = system.current_station || 'Station 0';
    const currentStationData = stations.find(s => s.name.includes(currentStationName.split(' ')[1]));
    const currentTestItem = currentStationData ? 
      getCurrentTestItem(system.id, currentStationData.id) : '待開始';

    return {
      id: system.id,
      name: system.system_name,
      status,
      currentStation: currentStationName,
      currentTestItem,
      stationProgress: {
        station0: calculateStationProgress(stations.find(s => s.name.includes('Station 0') || s.name.includes('組裝'))?.id || '', system.id),
        station1: calculateStationProgress(stations.find(s => s.name.includes('Station 1') || s.name.includes('開機'))?.id || '', system.id),
        station2: calculateStationProgress(stations.find(s => s.name.includes('Station 2') || s.name.includes('FW'))?.id || '', system.id),
        station3: calculateStationProgress(stations.find(s => s.name.includes('Station 3') || s.name.includes('EE'))?.id || '', system.id),
        station4: 0, // 不再使用 Station 4
      }
    };
  };

  const exportData = () => {
    setShowExportDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stations.length && !systems.length) {
    return (
      <div className="p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">生產監控牆</h2>
          <p className="text-muted-foreground">目前沒有站點或系統資料</p>
          <p className="text-sm text-muted-foreground">請確認資料庫中有測試系統和站點資料</p>
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

    const systemOverallProgress = calculateOverallProgress(system.id);
    const hasSystemError = progress.some(p => p.system_id === system.id && p.status === 'Error');

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
          <Badge className={getStatusColor(systemOverallProgress, hasSystemError)} variant="outline">
            {getStatusIcon(systemOverallProgress, hasSystemError)}
            <span className="ml-1">{getStatusText(systemOverallProgress, hasSystemError)}</span>
          </Badge>
        </div>

        {/* Video-style Station Flow - 只顯示 Station 0-3 */}
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                測試流程監控 (Station 0-3)
              </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {stations.filter(station => 
                station.name.includes('Station 0') || station.name.includes('組裝') ||
                station.name.includes('Station 1') || station.name.includes('開機') ||
                station.name.includes('Station 2') || station.name.includes('FW') ||
                station.name.includes('Station 3') || station.name.includes('EE')
              ).map((station, index) => {
                const isActive = system.current_station === station.name;
                const stationProgress = calculateStationProgress(station.id, system.id);
                const isCompleted = stationProgress === 100;
                const currentTestItem = getCurrentTestItem(system.id, station.id);
                
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
                        {getStatusIcon(stationProgress, false)}
                      </div>
                      <h3 className="font-medium text-sm">{station.name}</h3>
                      
                      {/* Current Test Item */}
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                        <span className="font-medium">測項: </span>
                        <span>{currentTestItem}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">進度: {stationProgress}%</div>
                        <Progress value={stationProgress} className="h-1" />
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
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
            
            <div className="mt-6 text-center">
              <div className="text-2xl font-bold text-primary">
                整體進度 (Station 0-3): {systemOverallProgress}%
              </div>
              <Progress value={systemOverallProgress} className="mt-2 h-3" />
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
              <div className="text-2xl font-bold text-success">{systemOverallProgress}%</div>
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

        <TestProgressAuditLog 
          systemId={system.id}
          systemName={system.system_name}
        />

        {showProductionHistory && <ProductionHistory />}

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          title="生產監控報表"
          data={systems}
        />
      </div>
    );
  }

  // Enhanced machine status cards for overview
  const machineStatuses = systems.map(getMachineStatus);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold">生產監控牆</h1>
            <p className="text-muted-foreground">即時機台狀態監控 - 測試站點總覽 (Station 0-3)</p>
          </div>
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

      {/* Enhanced Machine Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {machineStatuses.map((machine) => {
          const overallProgress = calculateOverallProgress(machine.id);
          const hasError = progress.some(p => p.system_id === machine.id && p.status === 'Error');
          
          return (
            <Card key={machine.id} className="relative overflow-hidden transition-all duration-200 hover:shadow-lg">
              <CardContent className="p-6">
                {/* Status Indicator */}
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-full ${getStatusColor(overallProgress, hasError)}`}>
                    {getStatusIcon(overallProgress, hasError)}
                  </div>
                  <Badge variant="outline" className={getStatusColor(overallProgress, hasError)}>
                    {getStatusText(overallProgress, hasError)}
                  </Badge>
                </div>
                
                <h3 className="font-semibold text-lg mb-2">{machine.name}</h3>
                
                {/* Current Status Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前站別:</span>
                    <span className="font-medium">{machine.currentStation}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前測項:</span>
                    <span className="font-medium text-xs">{machine.currentTestItem}</span>
                  </div>
                </div>

                {/* Station Progress Overview - 只顯示 Station 0-3 */}
                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-medium text-muted-foreground">各站進度追蹤</h4>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { name: 'S0', progress: machine.stationProgress.station0 },
                      { name: 'S1', progress: machine.stationProgress.station1 },
                      { name: 'S2', progress: machine.stationProgress.station2 },
                      { name: 'S3', progress: machine.stationProgress.station3 },
                    ].map((station, index) => (
                      <div key={index} className="text-center">
                        <div className="text-xs text-muted-foreground mb-1">{station.name}</div>
                        <div className={`h-2 rounded-full ${
                          station.progress === 100 ? 'bg-green-500' :
                          station.progress >= 1 ? 'bg-yellow-500' : 'bg-gray-500'
                        }`} />
                        <div className="text-xs mt-1">{station.progress}%</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Overall Progress */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">整體進度:</span>
                    <span className="font-medium">{overallProgress}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-2" />
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => setFocusedSystem(machine.name)}
                  >
                    查看詳情
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const event = new CustomEvent('navigate', { 
                        detail: { 
                          module: 'issues', 
                          params: { system: machine.name } 
                        } 
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    <Bug className="h-4 w-4" />
                  </Button>
                </div>

                {/* Status indicator animation */}
                {overallProgress >= 1 && overallProgress <= 99 && !hasError && (
                  <div className="absolute top-2 right-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  </div>
                )}
                {overallProgress === 100 && !hasError && (
                  <div className="absolute top-2 right-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showProductionHistory && <ProductionHistory />}

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="生產監控報表"
        data={systems}
      />

      <SystemSelectionDialog
        open={showSystemSelection}
        onOpenChange={setShowSystemSelection}
        stationName={selectedStation?.name || ''}
        systems={selectedStation?.current_systems || []}
        systemProgress={selectedStation?.system_progress || []}
        onSystemSelect={setFocusedSystem}
      />
    </div>
  );
}
