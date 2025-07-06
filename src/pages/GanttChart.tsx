import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Calendar, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';

interface GanttTask {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  assignee: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
}

export default function GanttChart() {
  const { systems, progress, stations } = useUnifiedData();
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Create Gantt tasks from test progress data
  const ganttTasks: GanttTask[] = useMemo(() => {
    if (!systems.length) return [];

    return systems.map((system) => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      
      // Calculate actual start and end dates from progress data
      const allStartTimes = systemProgress
        .map(p => p.started_at)
        .filter(Boolean)
        .map(t => new Date(t!));
      
      const allEndTimes = systemProgress
        .map(p => p.completed_at)
        .filter(Boolean)
        .map(t => new Date(t!));
      
      const startDate = allStartTimes.length > 0 
        ? new Date(Math.min(...allStartTimes.map(d => d.getTime())))
        : null;
        
      const endDate = allEndTimes.length > 0
        ? new Date(Math.max(...allEndTimes.map(d => d.getTime())))
        : null;
      
      // Calculate progress percentage
      const completedItems = systemProgress.filter(p => p.status === 'Done').length;
      const totalItems = systemProgress.length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      
      // Determine status
      let status: GanttTask['status'] = 'not_started';
      if (progressPercent === 100) {
        status = 'completed';
      } else if (progressPercent > 0) {
        status = 'in_progress';
      }

      return {
        id: system.id,
        name: system.system_name,
        startDate,
        endDate,
        progress: progressPercent,
        assignee: system.assigned_engineer || 'Unassigned',
        status
      };
    });
  }, [systems, progress]);

  // Set view range based on actual data
  useEffect(() => {
    if (ganttTasks.length > 0) {
      const allDates = ganttTasks.flatMap(task => [task.startDate, task.endDate]).filter(Boolean) as Date[];
      
      if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        
        // Add buffer
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);
        
        setViewRange({ start: minDate, end: maxDate });
      }
    }
  }, [ganttTasks]);

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      markers.push({
        date: new Date(currentDate),
        percent,
        label: currentDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return markers;
  }, [viewRange]);

  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel * 1.5, 3) : Math.max(zoomLevel / 1.5, 0.5);
    setZoomLevel(newZoom);
  };

  const handleTimeNavigation = (direction: 'prev' | 'next') => {
    const { start, end } = viewRange;
    const duration = end.getTime() - start.getTime();
    const shift = direction === 'next' ? duration * 0.3 : -duration * 0.3;
    
    setViewRange({
      start: new Date(start.getTime() + shift),
      end: new Date(end.getTime() + shift)
    });
  };

  const renderTaskBar = (task: GanttTask) => {
    if (!task.startDate) return null;
    
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const taskStart = Math.max(0, task.startDate.getTime() - start.getTime());
    const taskEnd = task.endDate 
      ? Math.min(totalDuration, task.endDate.getTime() - start.getTime())
      : taskStart + (24 * 60 * 60 * 1000); // Default 1 day if no end date
    
    const taskDuration = taskEnd - taskStart;
    
    if (taskDuration <= 0) return null;
    
    const leftPercent = (taskStart / totalDuration) * 100;
    const widthPercent = Math.max((taskDuration / totalDuration) * 100, 5);
    
    return (
      <div
        className="relative h-8 rounded-md cursor-pointer transition-all duration-200 hover:h-9 shadow-sm border"
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          backgroundColor: getStatusColor(task.status),
          minWidth: '80px'
        }}
        title={`${task.name} - ${task.progress}%`}
      >
        {/* Progress fill */}
        <div 
          className="h-full bg-white/30 rounded-md transition-all duration-500"
          style={{ width: `${task.progress}%` }}
        />
        
        {/* Task content */}
        <div className="absolute inset-0 flex items-center justify-between px-3 text-white text-sm font-medium">
          <span className="truncate max-w-[60%]">
            {task.name}
          </span>
          <span className="text-xs bg-black/20 px-2 py-1 rounded">
            {task.progress}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <Card className="w-full">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  window.history.pushState({}, '', '/test-tracker');
                  window.location.reload();
                }}
              >
                測試進度表
              </Button>
              <div>
                <CardTitle className="text-2xl">機台排程甘特圖</CardTitle>
                <p className="text-muted-foreground mt-1">基於測試進度的機台排程時間軸</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => handleZoom('out')}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleZoom('in')}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Navigation Controls */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex">
            {/* Left Panel - Task List */}
            <div className="w-80 border-r bg-muted/30">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold">機台列表</h3>
                <p className="text-sm text-muted-foreground">共 {ganttTasks.length} 台機器</p>
              </div>
              <ScrollArea className="h-[600px]">
                <div className="p-2 space-y-2">
                  {ganttTasks.map(task => (
                    <div 
                      key={task.id} 
                      className="p-3 bg-background rounded border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{task.name}</span>
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getStatusColor(task.status) }}
                          title={task.status}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        負責人: {task.assignee}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>進度</span>
                          <span className="font-medium">{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-1" />
                      </div>
                      {task.startDate && (
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>{task.startDate.toLocaleDateString('zh-TW')}</span>
                          {task.endDate && <span>{task.endDate.toLocaleDateString('zh-TW')}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* Right Panel - Gantt Chart */}
            <div className="flex-1">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold">時間軸圖表</h3>
                <p className="text-sm text-muted-foreground">機台排程與進度視覺化</p>
              </div>
              
              {/* Timeline Header */}
              <div className="relative h-12 bg-muted/20 border-b overflow-hidden">
                {timeMarkers.map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${marker.percent}%` }}
                  >
                    <div className="absolute top-1 left-1 text-xs text-muted-foreground whitespace-nowrap">
                      {marker.label}
                    </div>
                  </div>
                ))}
                
                {/* Today Line */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                  style={{ 
                    left: `${((new Date().getTime() - viewRange.start.getTime()) / (viewRange.end.getTime() - viewRange.start.getTime())) * 100}%` 
                  }}
                >
                  <div className="absolute -top-1 -left-6 text-xs text-primary font-medium bg-background px-1 rounded">
                    今日
                  </div>
                </div>
              </div>
              
              {/* Gantt Bars */}
              <ScrollArea className="h-[600px]">
                <div className="p-4 space-y-4">
                  {ganttTasks.map(task => (
                    <div key={task.id} className="relative h-12 hover:bg-muted/20 rounded p-2">
                      {renderTaskBar(task)}
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
}