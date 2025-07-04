import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target, BarChart3, Calendar } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";

interface PassRateMetrics {
  totalUnits: number;
  completedUnits: number;
  passRate: number;
  dailyAverage: number;
  weeklyTrend: number;
  targetPassRate: number;
}

export function TestPassRateCard() {
  const { systems, progress, isLoading } = useUnifiedData();
  const [metrics, setMetrics] = useState<PassRateMetrics>({
    totalUnits: 0,
    completedUnits: 0,
    passRate: 0,
    dailyAverage: 0,
    weeklyTrend: 0,
    targetPassRate: 95
  });
  const [workTimeConfig, setWorkTimeConfig] = useState<any>(null);

  useEffect(() => {
    if (!isLoading) {
      loadWorkTimeConfig();
      calculateMetrics();
    }
  }, [systems, progress, isLoading]);

  const loadWorkTimeConfig = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('category', 'work_time')
        .single();

      if (data) {
        setWorkTimeConfig(data.settings);
      }
    } catch (error) {
      console.error('Error loading work time config:', error);
    }
  };

  const calculateMetrics = () => {
    if (!systems.length) return;

    // 計算總台數和完成台數
    const totalUnits = systems.length;
    const completedUnits = systems.filter(system => system.status === 'Done').length;
    
    // 計算通過率 = 完成台數 / 總台數
    const passRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

    // 計算每日平均完成台數
    const dailyAverage = calculateDailyAverage();
    
    // 計算週趨勢
    const weeklyTrend = calculateWeeklyTrend();

    setMetrics({
      totalUnits,
      completedUnits,
      passRate,
      dailyAverage,
      weeklyTrend,
      targetPassRate: 95
    });
  };

  const calculateDailyAverage = (): number => {
    if (!systems.length) return 0;

    // 計算最近7天的完成數量
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCompletions = progress.filter(p => {
      if (p.status !== 'Done' || !p.completed_at) return false;
      const completedDate = new Date(p.completed_at);
      return completedDate >= sevenDaysAgo;
    });

    // 按系統分組，每個系統只計算一次
    const completedSystems = new Set(recentCompletions.map(p => p.system_id));
    
    // 計算工作日數量
    const workDays = workTimeConfig?.work_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const workDaysInPeriod = calculateWorkDaysInPeriod(sevenDaysAgo, now, workDays);
    
    return workDaysInPeriod > 0 ? Math.round((completedSystems.size / workDaysInPeriod) * 100) / 100 : 0;
  };

  const calculateWeeklyTrend = (): number => {
    if (!systems.length) return 0;

    const now = new Date();
    const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 計算本週完成數
    const thisWeekCompletions = progress.filter(p => {
      if (p.status !== 'Done' || !p.completed_at) return false;
      const completedDate = new Date(p.completed_at);
      return completedDate >= thisWeekStart;
    });

    // 計算上週完成數
    const lastWeekCompletions = progress.filter(p => {
      if (p.status !== 'Done' || !p.completed_at) return false;
      const completedDate = new Date(p.completed_at);
      return completedDate >= lastWeekStart && completedDate < thisWeekStart;
    });

    const thisWeekCount = new Set(thisWeekCompletions.map(p => p.system_id)).size;
    const lastWeekCount = new Set(lastWeekCompletions.map(p => p.system_id)).size;

    if (lastWeekCount === 0) return thisWeekCount > 0 ? 100 : 0;
    
    return Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);
  };

  const calculateWorkDaysInPeriod = (start: Date, end: Date, workDays: string[]): number => {
    let count = 0;
    const current = new Date(start);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    while (current <= end) {
      const dayName = dayNames[current.getDay()];
      if (workDays.includes(dayName)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 95) return 'text-success';
    if (rate >= 80) return 'text-warning';
    return 'text-danger';
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-success';
    if (trend < 0) return 'text-danger';
    return 'text-muted-foreground';
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return '↗';
    if (trend < 0) return '↘';
    return '→';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-2/3"></div>
            <div className="h-2 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 總體通過率 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">測試通過率</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold mb-2">
            <span className={getPassRateColor(metrics.passRate)}>
              {metrics.passRate}%
            </span>
          </div>
          <Progress value={metrics.passRate} className="mb-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{metrics.completedUnits} / {metrics.totalUnits} 台</span>
            <span>目標: {metrics.targetPassRate}%</span>
          </div>
        </CardContent>
      </Card>

      {/* 每日平均完成數 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">每日平均完成</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            {metrics.dailyAverage}
          </div>
          <p className="text-xs text-muted-foreground">
            台/工作日
          </p>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs">
              過去7天統計
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 週趨勢 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">週趨勢</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold mb-2">
            <span className={getTrendColor(metrics.weeklyTrend)}>
              {getTrendIcon(metrics.weeklyTrend)} {Math.abs(metrics.weeklyTrend)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            相較上週變化
          </p>
          <div className="mt-2">
            <Badge 
              variant={metrics.weeklyTrend >= 0 ? "default" : "destructive"} 
              className="text-xs"
            >
              {metrics.weeklyTrend >= 0 ? '上升' : '下降'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 統計摘要 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">統計摘要</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>進行中:</span>
              <span className="font-medium text-warning">
                {systems.filter(s => s.status === 'On-going').length} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>未開始:</span>
              <span className="font-medium text-muted-foreground">
                {systems.filter(s => s.status === 'Not Start').length} 台
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>已完成:</span>
              <span className="font-medium text-success">
                {metrics.completedUnits} 台
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}