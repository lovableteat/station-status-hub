import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ZoomIn, ZoomOut, Calendar, 
  ChevronLeft, ChevronRight, Download, ArrowLeft
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useSystemTimeline } from '@/hooks/useSystemTimeline';

interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  group: string;
}

type TimeScale = 'day' | 'week' | 'month';

export default function GanttChart() {
  const { systems, progress } = useUnifiedData();
  const { calculateSystemTimeline, isLoading: timelineLoading } = useSystemTimeline();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const { toast } = useToast();

  // Initialize tasks from systems data
  useEffect(() => {
    if (timelineLoading || !systems.length) return;
    
    const ganttTasks: GanttTask[] = systems.map((system) => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      const avgProgress = systemProgress.length > 0 
        ? systemProgress.reduce((sum, p) => sum + (p.progress_percent || 0), 0) / systemProgress.length 
        : 0;

      const calculatedTimeline = calculateSystemTimeline(system.system_name, systems);
      
      // Determine status based on progress and dates
      let status: GanttTask['status'] = 'not_started';
      const today = new Date();
      
      if (avgProgress === 100) {
        status = 'completed';
      } else if (avgProgress > 0) {
        status = calculatedTimeline.endDate < today ? 'delayed' : 'in_progress';
      } else if (calculatedTimeline.startDate <= today) {
        status = 'delayed';
      }

      return {
        id: system.id,
        name: system.system_name,
        startDate: calculatedTimeline.startDate,
        endDate: calculatedTimeline.endDate,
        progress: Math.round(avgProgress),
        assignee: system.assigned_engineer || 'Unassigned',
        priority: avgProgress < 50 && calculatedTimeline.endDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'high' : 'medium',
        status,
        group: `${system.assigned_engineer || 'Unassigned'} Team`
      };
    });
    
    setTasks(ganttTasks);
    
    // Set initial view range
    if (ganttTasks.length > 0) {
      const minDate = new Date(Math.min(...ganttTasks.map(t => t.startDate.getTime())));
      const maxDate = new Date(Math.max(...ganttTasks.map(t => t.endDate.getTime())));
      minDate.setDate(minDate.getDate() - 7);
      maxDate.setDate(maxDate.getDate() + 7);
      setViewRange({ start: minDate, end: maxDate });
    }
  }, [systems, progress, timelineLoading, calculateSystemTimeline]);

  // Generate time markers based on scale and zoom
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let increment: number;
    let format: Intl.DateTimeFormatOptions;
    
    switch (timeScale) {
      case 'day':
        increment = 1;
        format = { month: 'short', day: 'numeric' };
        break;
      case 'week':
        increment = 7;
        format = { month: 'short', day: 'numeric' };
        break;
      case 'month':
        increment = 30;
        format = { month: 'short', year: 'numeric' };
        break;
    }
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      markers.push({
        date: new Date(currentDate),
        percent,
        label: currentDate.toLocaleDateString('zh-TW', format)
      });
      
      currentDate.setDate(currentDate.getDate() + increment);
    }
    
    return markers;
  }, [viewRange, timeScale]);

  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel * 1.5, 5) : Math.max(zoomLevel / 1.5, 0.5);
    setZoomLevel(newZoom);
  };

  const handleTimeNavigation = (direction: 'prev' | 'next') => {
    const { start, end } = viewRange;
    const duration = end.getTime() - start.getTime();
    const shift = direction === 'next' ? duration * 0.5 : -duration * 0.5;
    
    setViewRange({
      start: new Date(start.getTime() + shift),
      end: new Date(end.getTime() + shift)
    });
  };

  const renderTaskBar = (task: GanttTask) => {
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const taskStart = Math.max(0, task.startDate.getTime() - start.getTime());
    const taskEnd = Math.min(totalDuration, task.endDate.getTime() - start.getTime());
    const taskDuration = taskEnd - taskStart;
    
    if (taskDuration <= 0) return null;
    
    const leftPercent = (taskStart / totalDuration) * 100;
    const widthPercent = (taskDuration / totalDuration) * 100;
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative h-8 rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 shadow-md border border-white/20"
              style={{
                left: `${leftPercent}%`,
                width: `${Math.max(widthPercent, 5)}%`,
                backgroundColor: getStatusColor(task.status),
                minWidth: '80px'
              }}
            >
              {/* Progress fill */}
              <div 
                className="h-full bg-white/20 rounded-lg transition-all duration-500"
                style={{ width: `${task.progress}%` }}
              />
              
              {/* Task content */}
              <div className="absolute inset-0 flex items-center justify-between px-3 text-white text-sm font-medium">
                <span className="truncate flex-1">{task.name}</span>
                <span className="ml-2 text-xs bg-black/20 px-2 py-1 rounded">
                  {task.progress}%
                </span>
              </div>
              
              {/* Date labels */}
              <div className="absolute -bottom-6 left-0 text-xs text-muted-foreground">
                {task.startDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
              </div>
              <div className="absolute -bottom-6 right-0 text-xs text-muted-foreground">
                {task.endDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-2">
              <div className="font-medium">{task.name}</div>
              <div className="text-sm">
                <div>Progress: {task.progress}%</div>
                <div>Assignee: {task.assignee}</div>
                <div>Status: {task.status}</div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
              <div>
                <CardTitle className="text-2xl">專案甘特圖</CardTitle>
                <p className="text-muted-foreground mt-1">視覺化項目時程與進度管理</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Time Scale Selector */}
              <Select value={timeScale} onValueChange={(value: TimeScale) => setTimeScale(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">日</SelectItem>
                  <SelectItem value="week">週</SelectItem>
                  <SelectItem value="month">月</SelectItem>
                </SelectContent>
              </Select>
              
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
              
              {/* Export Button */}
              <Button variant="outline" size="sm" onClick={() => toast({ title: "匯出功能", description: "甘特圖匯出功能開發中..." })}>
                <Download className="h-4 w-4 mr-2" />
                匯出
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          {/* Timeline Header */}
          <div className="relative h-16 bg-muted/30 rounded-lg border mb-6 overflow-hidden">
            {timeMarkers.map((marker, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 border-l border-border/50 flex flex-col items-start pl-2"
                style={{ left: `${marker.percent}%` }}
              >
                <div className="text-sm font-medium text-foreground pt-2">
                  {marker.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {marker.date.toLocaleDateString('zh-TW', { weekday: 'short' })}
                </div>
              </div>
            ))}
            
            {/* Today Line */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
              style={{ 
                left: `${((new Date().getTime() - viewRange.start.getTime()) / (viewRange.end.getTime() - viewRange.start.getTime())) * 100}%` 
              }}
            >
              <div className="absolute -top-2 -left-8 text-xs text-primary font-medium bg-background px-2 py-1 rounded border">
                今日
              </div>
            </div>
          </div>
          
          {/* Task Bars */}
          <div className="space-y-6">
            {tasks.map((task, index) => (
              <div key={task.id} className="relative">
                {/* Task Info */}
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-60 flex-shrink-0">
                    <div className="font-medium text-sm">{task.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{task.assignee}</span>
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{ backgroundColor: getStatusColor(task.status) + '20', borderColor: getStatusColor(task.status) }}
                      >
                        {task.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {/* Task Bar Container */}
                <div className="relative h-12 mb-4">
                  {renderTaskBar(task)}
                </div>
                
                {/* Separator */}
                {index < tasks.length - 1 && <div className="border-b border-border/30 mb-6" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}