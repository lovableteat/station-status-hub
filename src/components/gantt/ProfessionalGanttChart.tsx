import { useState, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOptimizedGanttData } from '@/hooks/useOptimizedGanttData';

// 優化的時間軸組件
const TimelineHeader = memo(({ 
  viewRange,
  onNavigate 
}: {
  viewRange: { start: Date; end: Date };
  onNavigate: (direction: 'prev' | 'next') => void;
}) => {
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    // 每3天顯示一個標記，避免擁擠
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      markers.push({
        date: new Date(currentDate),
        percent,
        label: currentDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
        weekday: currentDate.toLocaleDateString('zh-TW', { weekday: 'short' })
      });
      
      currentDate.setDate(currentDate.getDate() + 3);
    }
    
    return markers;
  }, [viewRange]);

  // 今日位置計算
  const todayPercent = useMemo(() => {
    const today = new Date();
    const { start, end } = viewRange;
    if (today < start || today > end) return null;
    
    const totalDuration = end.getTime() - start.getTime();
    const todayOffset = today.getTime() - start.getTime();
    return (todayOffset / totalDuration) * 100;
  }, [viewRange]);

  return (
    <div className="relative h-20 bg-muted/20 border-b border-border">
      {/* 時間標記網格 */}
      {timeMarkers.map((marker, idx) => (
        <div
          key={idx}
          className="absolute top-0 bottom-0 border-l border-border/30"
          style={{ left: `${marker.percent}%` }}
        >
          <div className="absolute top-2 left-2 text-sm font-medium text-foreground bg-background/90 px-2 py-1 rounded shadow-sm">
            {marker.label}
          </div>
          <div className="absolute top-12 left-2 text-xs text-muted-foreground">
            {marker.weekday}
          </div>
        </div>
      ))}
      
      {/* 強化的今日標記 */}
      {todayPercent !== null && (
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-danger z-20 animate-pulse-slow"
          style={{ left: `${todayPercent}%` }}
        >
          <div className="absolute -top-2 -left-8 bg-danger text-danger-foreground text-xs font-bold px-3 py-1 rounded-full shadow-md">
            今日
          </div>
          <div className="absolute bottom-2 -left-1 w-3 h-3 bg-danger rounded-full shadow-md"></div>
        </div>
      )}

      {/* 導航控制 */}
      <div className="absolute top-2 right-2 flex gap-1">
        <Button variant="outline" size="sm" onClick={() => onNavigate('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

// 優化的甘特條組件
const GanttBar = memo(({ 
  system, 
  viewRange 
}: {
  system: any;
  viewRange: { start: Date; end: Date };
}) => {
  if (!system.startDate) return null;

  const { start, end } = viewRange;
  const totalDuration = end.getTime() - start.getTime();
  const taskStart = Math.max(0, system.startDate.getTime() - start.getTime());
  const taskEnd = system.endDate 
    ? Math.min(totalDuration, system.endDate.getTime() - start.getTime())
    : taskStart + (7 * 24 * 60 * 60 * 1000); // 預設7天
  
  const taskDuration = taskEnd - taskStart;
  if (taskDuration <= 0) return null;
  
  const leftPercent = (taskStart / totalDuration) * 100;
  const widthPercent = Math.max((taskDuration / totalDuration) * 100, 8);

  const getStatusColor = () => {
    switch (system.status) {
      case 'Done': return 'bg-gradient-success';
      case 'On-going': return 'bg-gradient-primary';
      case 'Not Start': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  return (
    <div
      className={`absolute h-8 rounded-md cursor-pointer transition-all duration-200 hover:h-10 hover:shadow-md ${getStatusColor()}`}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        minWidth: '80px'
      }}
      title={`${system.system_name} - ${system.overall_progress}%`}
    >
      {/* 進度填充 */}
      <div 
        className="h-full bg-white/20 rounded-md transition-all duration-300"
        style={{ width: `${system.overall_progress}%` }}
      />
      
      {/* 任務名稱 */}
      <div className="absolute inset-0 flex items-center px-2 text-white text-sm font-medium">
        <span className="truncate">{system.system_name}</span>
        <span className="ml-auto text-xs bg-black/20 px-2 py-0.5 rounded">
          {system.overall_progress}%
        </span>
      </div>
    </div>
  );
});

// 主甘特圖組件
export const ProfessionalGanttChart = memo(() => {
  const { systems, isLoading, error } = useOptimizedGanttData();
  const [viewRange, setViewRange] = useState({ 
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), 
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
  });

  const handleTimeNavigation = useCallback((direction: 'prev' | 'next') => {
    setViewRange(prev => {
      const duration = prev.end.getTime() - prev.start.getTime();
      const shift = direction === 'next' ? duration * 0.3 : -duration * 0.3;
      
      return {
        start: new Date(prev.start.getTime() + shift),
        end: new Date(prev.end.getTime() + shift)
      };
    });
  }, []);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  const handleNavigateToTracker = useCallback(() => {
    window.location.href = '/test-tracker';
  }, []);

  // 按負責工程師分組
  const groupedSystems = useMemo(() => {
    const groups: Record<string, typeof systems> = {};
    systems.forEach(system => {
      const engineer = system.assigned_engineer || '未指派';
      if (!groups[engineer]) {
        groups[engineer] = [];
      }
      groups[engineer].push(system);
    });
    return groups;
  }, [systems]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="w-full shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-10" />
              <Skeleton className="w-24 h-10" />
              <Skeleton className="w-48 h-8" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-80 h-12" />
                  <Skeleton className="flex-1 h-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="w-full shadow-lg">
          <CardContent className="p-6">
            <div className="text-center text-destructive">
              <p className="text-lg font-semibold">載入失敗</p>
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <Card className="w-full shadow-lg">
        <CardHeader className="bg-gradient-to-r from-card to-card/80">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Button>
              <Button variant="outline" onClick={handleNavigateToTracker}>
                測試進度表
              </Button>
              <div>
                <CardTitle className="text-2xl text-primary">
                  機台排程甘特圖
                </CardTitle>
                <p className="text-muted-foreground mt-1">
                  基於測試記錄的系統排程時間軸 • 共 {systems.length} 個系統
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex">
            {/* 左側系統列表 */}
            <div className="w-80 flex-shrink-0 border-r border-border bg-muted/10">
              <div className="p-4 border-b border-border bg-muted/20">
                <h3 className="text-lg font-semibold text-foreground">系統列表</h3>
                <p className="text-sm text-muted-foreground">按負責工程師分組</p>
              </div>
              
              <ScrollArea className="h-[600px]">
                <div className="p-2">
                  {Object.entries(groupedSystems).map(([engineer, engineerSystems]) => (
                    <div key={engineer} className="mb-4">
                      <div className="p-2 bg-primary/10 rounded-md mb-2">
                        <h4 className="text-base font-medium text-primary">{engineer}</h4>
                        <p className="text-xs text-muted-foreground">{engineerSystems.length} 個系統</p>
                      </div>
                      
                      {engineerSystems.map(system => (
                        <div 
                          key={system.id}
                          className="p-3 mb-2 bg-card rounded-md border border-border hover:shadow-sm transition-shadow cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="text-sm font-medium text-foreground">
                                {system.system_name}
                              </h5>
                              <p className="text-xs text-muted-foreground">
                                {system.current_station}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-primary">
                                {system.overall_progress}%
                              </div>
                              <div className={`text-xs px-2 py-0.5 rounded-full ${
                                system.status === 'Done' ? 'bg-success/20 text-success' :
                                system.status === 'On-going' ? 'bg-primary/20 text-primary' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {system.status}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* 右側甘特圖 */}
            <div className="flex-1">
              <TimelineHeader 
                viewRange={viewRange} 
                onNavigate={handleTimeNavigation}
              />
              
              <ScrollArea className="h-[600px]">
                <div className="p-4 space-y-3">
                  {Object.entries(groupedSystems).map(([engineer, engineerSystems]) => (
                    <div key={engineer}>
                      <div className="h-8 bg-primary/10 rounded-md flex items-center px-3 mb-2">
                        <span className="text-sm font-medium text-primary">{engineer}</span>
                      </div>
                      
                      {engineerSystems.map(system => (
                        <div key={system.id} className="relative h-12 mb-1 hover:bg-muted/20 rounded-md transition-colors">
                          <GanttBar system={system} viewRange={viewRange} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

ProfessionalGanttChart.displayName = 'ProfessionalGanttChart';