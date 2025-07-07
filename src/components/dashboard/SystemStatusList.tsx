
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Clock, User, Calendar, CheckCircle, AlertTriangle, Play } from "lucide-react";

interface SystemStatusListProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function SystemStatusList({ onNavigate }: SystemStatusListProps) {
  const { systems, progress, stations, testItems } = useUnifiedData();

  // Helper function to format time
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '未設定';
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '無效時間';
    }
  };

  // Get system start and end times from progress data
  const getSystemTimes = (systemId: string) => {
    const systemProgress = progress.filter(p => p.system_id === systemId);
    
    const startTimes = systemProgress.map(p => p.started_at).filter(Boolean);
    const endTimes = systemProgress.map(p => p.completed_at).filter(Boolean);
    
    const startTime = startTimes.length > 0 ? startTimes.sort()[0] : undefined;
    const endTime = endTimes.length > 0 ? endTimes.sort().reverse()[0] : undefined;
    
    return { startTime, endTime };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'On-going':
        return <Play className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-green-100 text-green-800';
      case 'On-going': return 'bg-blue-100 text-blue-800';
      case 'Not Start': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Sort systems by status priority and then by progress
  const sortedSystems = [...systems].sort((a, b) => {
    const statusPriority = { 'On-going': 0, 'Not Start': 1, 'Done': 2 };
    const aPriority = statusPriority[a.status as keyof typeof statusPriority] ?? 3;
    const bPriority = statusPriority[b.status as keyof typeof statusPriority] ?? 3;
    
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (b.overall_progress || 0) - (a.overall_progress || 0);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            所有機台即時狀況
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
          {sortedSystems.map((system) => {
            const { startTime, endTime } = getSystemTimes(system.id);
            const isCompleted = system.status === 'Done';
            
            return (
              <div
                key={system.id}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-gray-50 rounded-lg border hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onNavigate?.('monitor', { system: system.system_name })}
              >
                <div className="flex items-center gap-4 flex-1">
                  {getStatusIcon(system.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{system.system_name}</h3>
                      <Badge className={getStatusColor(system.status)}>
                        {system.status === 'Done' ? '已完成' : 
                         system.status === 'On-going' ? '進行中' : '未開始'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {system.assigned_engineer || '未指派'}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs">當前:</span>
                        {system.current_station || '未設定'}
                      </div>
                    </div>

                    {/* 顯示開始時間和結束時間 */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>開始: {formatTime(startTime)}</span>
                      </div>
                      {isCompleted && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>完成: {formatTime(system.actual_completed_at || endTime)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Progress value={system.overall_progress || 0} className="h-2 flex-1" />
                      <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                        {system.overall_progress || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            最近完成系統
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
          {systems
            .filter(s => s.status === 'Done')
            .sort((a, b) => {
              const aTime = a.actual_completed_at;
              const bTime = b.actual_completed_at;
              if (!aTime && !bTime) return 0;
              if (!aTime) return 1;
              if (!bTime) return -1;
              return new Date(bTime).getTime() - new Date(aTime).getTime();
            })
            .slice(0, 5)
            .map((system) => {
              const { startTime } = getSystemTimes(system.id);
              
              return (
                <div
                  key={system.id}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <h4 className="font-medium text-gray-900">{system.system_name}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="h-3 w-3" />
                        {system.assigned_engineer || '未指派'}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                        <span>開始: {formatTime(startTime)}</span>
                        <span>完成: {formatTime(system.actual_completed_at)}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate?.('monitor', { system: system.system_name })}
                  >
                    查看詳情
                  </Button>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
