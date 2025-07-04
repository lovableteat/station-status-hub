import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Monitor, Activity, AlertTriangle, CheckCircle, Clock, Download, ArrowLeft, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { TestProgressAuditLog } from "./TestProgressAuditLog";

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
    toast({
      title: "匯出功能",
      description: "匯出功能開發中...",
    });
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
        <Button variant="outline" onClick={exportData}>
          <Download className="h-4 w-4 mr-2" />
          匯出報表
        </Button>
      </div>

      {/* Station Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stations.map((station) => (
          <Card key={station.id} className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{station.name}</span>
                {getStatusIcon(station.status)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(station.status)}>
                  {station.status === 'working' && '運行中'}
                  {station.status === 'complete' && '已完成'}
                  {station.status === 'warning' && '警告'}
                  {station.status === 'error' && '錯誤'}
                  {station.status === 'idle' && '待機'}
                </Badge>
              </div>
              
              {station.current_system && (
                <div className="text-sm">
                  <span className="text-muted-foreground">當前系統: </span>
                  <span className="font-medium">{station.current_system}</span>
                </div>
              )}
              
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">進度</span>
                    <span className="font-medium">{station.efficiency}%</span>
                  </div>
                  <Progress value={station.efficiency} className="h-2" />
                </div>
              
              <div className="text-xs text-muted-foreground">
                最後更新: {new Date(station.last_update).toLocaleTimeString('zh-TW')}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {stations.filter(s => s.status === 'working' || s.status === 'complete').length}
              </div>
              <div className="text-sm text-muted-foreground">運行中站點</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {stations.filter(s => s.status === 'warning').length}
              </div>
              <div className="text-sm text-muted-foreground">警告站點</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-danger">
                {stations.filter(s => s.status === 'error').length}
              </div>
              <div className="text-sm text-muted-foreground">錯誤站點</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {stations.length > 0 ? Math.round(stations.reduce((sum, s) => sum + s.efficiency, 0) / stations.length) : 0}%
              </div>
              <div className="text-sm text-muted-foreground">平均進度</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Systems Overview Grid */}
      <Card>
        <CardHeader>
          <CardTitle>所有機台即時狀況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {systems.map(system => (
              <div 
                key={system.id}
                className="relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg"
                style={{
                  borderColor: system.status === 'Done' ? 'hsl(var(--success))' : 
                              system.status === 'On-going' ? 'hsl(var(--warning))' : 
                              'hsl(var(--muted-foreground))',
                  backgroundColor: system.status === 'Done' ? 'hsl(var(--success) / 0.1)' : 
                                  system.status === 'On-going' ? 'hsl(var(--warning) / 0.1)' : 
                                  'hsl(var(--muted) / 0.5)'
                }}
                onClick={() => setFocusedSystem(system.system_name)}
              >
                <div className="text-center space-y-1">
                  <div className="font-medium text-sm truncate">{system.system_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{system.assigned_engineer}</div>
                  <div className="text-xs">{system.current_station}</div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div 
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${system.overall_progress}%`,
                        backgroundColor: system.status === 'Done' ? 'hsl(var(--success))' : 
                                        system.status === 'On-going' ? 'hsl(var(--warning))' : 
                                        'hsl(var(--muted-foreground))'
                      }}
                    />
                  </div>
                  <div className="text-xs font-medium">{system.overall_progress}%</div>
                </div>
                
                {/* Animated status indicator */}
                {system.status === 'On-going' && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-3 h-3 bg-warning rounded-full animate-ping"></div>
                    <div className="absolute top-0 w-3 h-3 bg-warning rounded-full"></div>
                  </div>
                )}
                {system.status === 'Done' && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-3 h-3 bg-success rounded-full"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Systems Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>系統測試總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20 animate-fade-in">
              <div className="text-2xl font-bold text-success animate-pulse">
                {systems.filter(s => s.status === 'Done').length}
              </div>
              <div className="text-sm text-muted-foreground">已完成系統</div>
            </div>
            <div className="text-center p-4 bg-warning/10 rounded-lg border border-warning/20 animate-fade-in">
              <div className="text-2xl font-bold text-warning animate-pulse">
                {systems.filter(s => s.status === 'On-going').length}
              </div>
              <div className="text-sm text-muted-foreground">進行中系統</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg border animate-fade-in">
              <div className="text-2xl font-bold text-muted-foreground">
                {systems.filter(s => s.status === 'Not Start').length}
              </div>
              <div className="text-sm text-muted-foreground">未開始系統</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}