
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, User, AlertTriangle, CheckCircle, Play, Pause } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { SystemSelectionDialog } from "./SystemSelectionDialog";

interface ProductionMonitorProps {
  selectedSystem?: string;
}

export function ProductionMonitor({ selectedSystem }: ProductionMonitorProps) {
  const { systems, stations, testItems, progress, isLoading } = useUnifiedData();
  const [currentSystemId, setCurrentSystemId] = useState<string>("");
  const [isSystemDialogOpen, setIsSystemDialogOpen] = useState(false);

  // Find the system based on the selectedSystem name
  useEffect(() => {
    if (selectedSystem) {
      const system = systems.find(s => s.system_name === selectedSystem);
      if (system) {
        setCurrentSystemId(system.id);
      }
    } else if (systems.length > 0 && !currentSystemId) {
      setCurrentSystemId(systems[0].id);
    }
  }, [selectedSystem, systems, currentSystemId]);

  const currentSystem = systems.find(s => s.id === currentSystemId);
  
  if (isLoading) {
    return <div className="p-6">載入中...</div>;
  }

  if (!currentSystem) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">請選擇要監控的系統</p>
          <Button onClick={() => setIsSystemDialogOpen(true)}>
            選擇系統
          </Button>
        </div>
        <SystemSelectionDialog
          open={isSystemDialogOpen}
          onOpenChange={setIsSystemDialogOpen}
          systems={systems}
          onSelectSystem={(systemId) => {
            setCurrentSystemId(systemId);
            setIsSystemDialogOpen(false);
          }}
        />
      </div>
    );
  }

  // Calculate station progress based on completed test items
  const stationProgressData = stations
    .sort((a, b) => a.station_order - b.station_order)
    .map(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      const stationProgress = stationItems.map(item => 
        progress.find(p => 
          p.system_id === currentSystemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        )
      );
      
      const completedItems = stationProgress.filter(p => p?.status === 'Done').length;
      const totalItems = stationItems.length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      
      // Determine station status
      let status: 'idle' | 'working' | 'complete' | 'warning' = 'idle';
      if (progressPercent === 100) {
        status = 'complete';
      } else if (stationProgress.some(p => p?.status === 'On-going')) {
        status = 'working';
      } else if (completedItems > 0) {
        status = 'warning';
      }

      return {
        station,
        progressPercent,
        completedItems,
        totalItems,
        status,
        items: stationItems.map(item => {
          const itemProgress = progress.find(p => 
            p.system_id === currentSystemId && 
            p.station_id === station.id && 
            p.item_id === item.id
          );
          return {
            ...item,
            progress: itemProgress
          };
        })
      };
    });

  // Calculate overall progress based on completed stations
  const completedStations = stationProgressData.filter(s => s.progressPercent === 100).length;
  const totalStations = stationProgressData.length;
  const overallProgress = totalStations > 0 ? Math.round((completedStations / totalStations) * 100) : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-success text-success-foreground';
      case 'working': return 'bg-warning text-warning-foreground';
      case 'warning': return 'bg-orange-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-4 w-4" />;
      case 'working': return <Play className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      default: return <Pause className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">生產監控</h1>
          <p className="text-muted-foreground">實時監控系統測試進度</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={currentSystemId} onValueChange={setCurrentSystemId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="選擇系統" />
            </SelectTrigger>
            <SelectContent>
              {systems.map(system => (
                <SelectItem key={system.id} value={system.id}>
                  {system.system_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* System Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {currentSystem.system_name} - 系統總覽
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">負責工程師</p>
              <p className="font-medium">{currentSystem.assigned_engineer || '未指派'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">當前站點</p>
              <Badge variant="secondary">{currentSystem.current_station}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">系統狀態</p>
              <Badge className={getStatusColor(currentSystem.status || 'idle')}>
                {currentSystem.status === 'Done' ? '已完成' : 
                 currentSystem.status === 'On-going' ? '進行中' : '未開始'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">整體進度</p>
              <div className="flex items-center gap-2">
                <Progress value={overallProgress} className="flex-1" />
                <span className="text-sm font-medium">{overallProgress}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {completedStations}/{totalStations} 個站點完成
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Station Progress */}
      <Card>
        <CardHeader>
          <CardTitle>測試流程監控</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {stationProgressData.map((stationData, index) => (
              <div key={stationData.station.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${getStatusColor(stationData.status)}`}>
                      {getStatusIcon(stationData.status)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{stationData.station.station_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        站點 {stationData.station.station_order}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <Progress value={stationData.progressPercent} className="w-24" />
                      <span className="text-sm font-medium">{stationData.progressPercent}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stationData.completedItems}/{stationData.totalItems} 項目完成
                    </p>
                  </div>
                </div>

                {/* Test Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stationData.items.map(item => (
                    <div 
                      key={item.id} 
                      className={`p-3 border rounded-lg ${
                        item.progress?.status === 'Done' ? 'bg-success/10 border-success' :
                        item.progress?.status === 'On-going' ? 'bg-warning/10 border-warning' :
                        'bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{item.item_name}</span>
                        <Badge 
                          variant="outline" 
                          className={
                            item.progress?.status === 'Done' ? 'border-success text-success' :
                            item.progress?.status === 'On-going' ? 'border-warning text-warning' :
                            'border-muted-foreground text-muted-foreground'
                          }
                        >
                          {item.progress?.status === 'Done' ? '完成' :
                           item.progress?.status === 'On-going' ? '進行中' : '未開始'}
                        </Badge>
                      </div>
                      {item.progress?.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.progress.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Selection Dialog */}
      <SystemSelectionDialog
        open={isSystemDialogOpen}
        onOpenChange={setIsSystemDialogOpen}
        systems={systems}
        onSelectSystem={(systemId) => {
          setCurrentSystemId(systemId);
          setIsSystemDialogOpen(false);
        }}
      />
    </div>
  );
}
