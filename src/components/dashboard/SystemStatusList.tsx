
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
  const { systems, progress } = useUnifiedData();

  const getStatusIcon = (status: string, progress: number) => {
    if (status === 'Done') return <CheckCircle className="h-4 w-4 text-green-600 animate-pulse" />;
    if (status === 'On-going') {
      if (progress > 75) return <Activity className="h-4 w-4 text-yellow-500 animate-spin" />;
      if (progress > 25) return <Zap className="h-4 w-4 text-yellow-500 animate-pulse" />;
      return <AlertTriangle className="h-4 w-4 text-yellow-500 animate-bounce" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-green-100 text-green-800 border-green-200';
      case 'On-going': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getAnimationClass = (status: string, progress: number) => {
    if (status === 'Done') return 'animate-pulse border-green-300 shadow-green-100 bg-green-50/30';
    if (status === 'On-going') {
      if (progress < 25) return 'animate-pulse border-yellow-300 shadow-yellow-100 bg-yellow-50/30';
      if (progress < 75) return 'animate-pulse border-yellow-300 shadow-yellow-100 bg-yellow-50/30';
      return 'animate-pulse border-yellow-300 shadow-yellow-100 bg-yellow-50/30';
    }
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
            // Calculate system progress
            const systemProgress = progress.filter(p => p.system_id === system.id);
            const completedItems = systemProgress.filter(p => p.status === 'Done').length;
            const totalItems = systemProgress.length;
            const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

            return (
              <Card
                key={system.id}
                className={`transition-all duration-500 hover:shadow-lg cursor-pointer border-2 ${getAnimationClass(system.status, progressPercent)}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(system.status, progressPercent)}
                        <h4 className="font-semibold text-sm">{system.system_name}</h4>
                      </div>
                      <Badge className={`${getStatusColor(system.status)} font-medium`} variant="secondary">
                        {system.status === 'Done' && '已完成'}
                        {system.status === 'On-going' && '進行中'}
                        {system.status === 'Not Start' && '未開始'}
                      </Badge>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>整體進度</span>
                        <span className="font-medium">{progressPercent}%</span>
                      </div>
                      <Progress 
                        value={progressPercent} 
                        className={`h-3 transition-all duration-300 ${
                          system.status === 'Done' ? 'bg-green-100' : 
                          system.status === 'On-going' ? 'bg-yellow-100' : 'bg-gray-100'
                        }`}
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
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 hover:scale-105 transition-transform duration-200"
                        onClick={() => handleSystemClick(system.system_name)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        測試追蹤
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 hover:scale-105 transition-transform duration-200"
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
