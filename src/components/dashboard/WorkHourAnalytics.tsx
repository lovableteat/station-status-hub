import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface WorkHourStats {
  systemId: string;
  systemName: string;
  totalEstimated: number;
  totalActual: number;
  dailyTarget: number;
  dailyActual: number;
  efficiency: number;
  status: 'on-track' | 'behind' | 'ahead' | 'completed';
  daysRemaining: number;
}

export function WorkHourAnalytics() {
  const { systems, progress } = useUnifiedData();
  const [workHourStats, setWorkHourStats] = useState<WorkHourStats[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    const calculateWorkHourStats = () => {
      const today = new Date();
      const stats: WorkHourStats[] = systems.map(system => {
        const systemProgress = progress.filter(p => p.system_id === system.id);
        
        // 計算預估總工時 (假設每個測試項目需要8小時)
        const totalEstimated = systemProgress.length * 8;
        
        // 計算實際工時
        let totalActual = 0;
        systemProgress.forEach(p => {
          if (p.started_at && p.completed_at) {
            const hours = (new Date(p.completed_at).getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60);
            totalActual += hours;
          } else if (p.started_at && !p.completed_at && p.status === 'On-going') {
            // 進行中的項目，計算到現在的時間
            const hours = (today.getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60);
            totalActual += hours;
          }
        });

        // 計算完成度
        const completedItems = systemProgress.filter(p => p.status === 'Done').length;
        const progressPercent = systemProgress.length > 0 ? (completedItems / systemProgress.length) * 100 : 0;

        // 計算效率和狀態
        const efficiency = totalActual > 0 ? (progressPercent / 100) / (totalActual / totalEstimated) * 100 : 0;
        
        // 計算每日目標工時 (假設每天8小時工作)
        const dailyTarget = 8;
        
        // 計算今日實際工時
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        
        let dailyActual = 0;
        systemProgress.forEach(p => {
          if (p.started_at) {
            const startTime = new Date(p.started_at);
            const endTime = p.completed_at ? new Date(p.completed_at) : today;
            
            // 檢查是否有今日的工作時間
            if (startTime < todayEnd && endTime > todayStart) {
              const workStart = new Date(Math.max(startTime.getTime(), todayStart.getTime()));
              const workEnd = new Date(Math.min(endTime.getTime(), todayEnd.getTime()));
              const hours = (workEnd.getTime() - workStart.getTime()) / (1000 * 60 * 60);
              dailyActual += hours;
            }
          }
        });

        // 計算剩餘天數
        const remainingWork = totalEstimated - (totalEstimated * progressPercent / 100);
        const daysRemaining = Math.ceil(remainingWork / dailyTarget);

        // 判斷狀態
        let status: WorkHourStats['status'] = 'on-track';
        if (progressPercent >= 100) {
          status = 'completed';
        } else if (efficiency < 80) {
          status = 'behind';
        } else if (efficiency > 120) {
          status = 'ahead';
        }

        return {
          systemId: system.id,
          systemName: system.system_name,
          totalEstimated,
          totalActual,
          dailyTarget,
          dailyActual,
          efficiency: Math.round(efficiency),
          status,
          daysRemaining
        };
      });

      setWorkHourStats(stats);
    };

    calculateWorkHourStats();
  }, [systems, progress]);

  const getStatusColor = (status: WorkHourStats['status']) => {
    switch (status) {
      case 'completed': return 'bg-success text-success-foreground';
      case 'ahead': return 'bg-info text-info-foreground';
      case 'on-track': return 'bg-primary text-primary-foreground';
      case 'behind': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: WorkHourStats['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'ahead': return <TrendingUp className="h-4 w-4" />;
      case 'behind': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusText = (status: WorkHourStats['status']) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'ahead': return '超前進度';
      case 'on-track': return '正常進度';
      case 'behind': return '進度落後';
      default: return '待開始';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          實際工時統計分析
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "grid gap-4",
          isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}>
          {workHourStats.map(stat => (
            <Card key={stat.systemId} className="border">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm truncate">{stat.systemName}</h4>
                    <Badge className={getStatusColor(stat.status)} variant="secondary">
                      <div className="flex items-center gap-1">
                        {getStatusIcon(stat.status)}
                        <span className={isMobile ? "text-xs" : "text-xs"}>{getStatusText(stat.status)}</span>
                      </div>
                    </Badge>
                  </div>

                  {/* Work Hours */}
                  <div className={cn(
                    "grid gap-2",
                    isMobile ? "grid-cols-2" : "grid-cols-2"
                  )}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">預估工時</span>
                      </div>
                      <div className="text-lg font-bold">{stat.totalEstimated}h</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">實際工時</span>
                      </div>
                      <div className="text-lg font-bold">{stat.totalActual.toFixed(1)}h</div>
                    </div>
                  </div>

                  {/* Daily Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>今日工時進度</span>
                      <span>{stat.dailyActual.toFixed(1)}h / {stat.dailyTarget}h</span>
                    </div>
                    <Progress 
                      value={Math.min(100, (stat.dailyActual / stat.dailyTarget) * 100)} 
                      className="h-2"
                    />
                  </div>

                  {/* Efficiency & Remaining */}
                  <div className={cn(
                    "grid gap-2 text-xs",
                    isMobile ? "grid-cols-2" : "grid-cols-2"
                  )}>
                    <div>
                      <span className="text-muted-foreground">效率: </span>
                      <span className={cn(
                        "font-medium",
                        stat.efficiency > 100 ? "text-success" : stat.efficiency < 80 ? "text-destructive" : "text-primary"
                      )}>
                        {stat.efficiency}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">預計剩餘: </span>
                      <span className="font-medium">
                        {stat.status === 'completed' ? '已完成' : `${stat.daysRemaining}天`}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {workHourStats.length === 0 && (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">沒有工時資料</h3>
            <p className="text-muted-foreground">請先在測試追蹤頁面開始工作</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}