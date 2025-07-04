import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Monitor, Activity, AlertTriangle, CheckCircle, Clock, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
                  <span className="text-muted-foreground">效率</span>
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
              <div className="text-sm text-muted-foreground">平均效率</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Systems Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>系統測試總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-success/10 rounded-lg border border-success/20">
              <div className="text-2xl font-bold text-success">
                {systems.filter(s => s.status === 'Done').length}
              </div>
              <div className="text-sm text-muted-foreground">已完成系統</div>
            </div>
            <div className="text-center p-4 bg-warning/10 rounded-lg border border-warning/20">
              <div className="text-2xl font-bold text-warning">
                {systems.filter(s => s.status === 'On-going').length}
              </div>
              <div className="text-sm text-muted-foreground">進行中系統</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg border">
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