import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ZoomIn, ZoomOut, Calendar, Plus, Edit, Trash2,
  ChevronLeft, ChevronRight, Download, ArrowLeft, Clock, User, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useSystemTimeline } from '@/hooks/useSystemTimeline';
import { ExportDialog } from '@/components/production/ExportDialog';

interface GanttTask {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  duration: number; // in days
  progress: number;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  group: string;
  dependencies?: string[];
  estimatedHours: number;
}

type TimeScale = 'day' | 'week' | 'month';

export default function GanttChart() {
  const { systems, progress, stations } = useUnifiedData();
  const { calculateSystemTimeline, isLoading: timelineLoading } = useSystemTimeline();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
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
      
      // Calculate duration in days
      const duration = Math.ceil((calculatedTimeline.endDate.getTime() - calculatedTimeline.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
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

      // Calculate estimated hours based on stations
      const estimatedHours = stations.reduce((sum, station) => sum + (station.estimated_hours || 0), 0);

      return {
        id: system.id,
        name: system.system_name,
        description: `${system.model || 'GB300'} 系統測試流程`,
        startDate: calculatedTimeline.startDate,
        endDate: calculatedTimeline.endDate,
        duration,
        progress: Math.round(avgProgress),
        assignee: system.assigned_engineer || 'Unassigned',
        priority: avgProgress < 50 && calculatedTimeline.endDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'high' : 'medium',
        status,
        group: `${system.assigned_engineer || 'Unassigned'} Team`,
        dependencies: [], // Can be enhanced later
        estimatedHours
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
  }, [systems, progress, timelineLoading, calculateSystemTimeline, stations]);

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

  const handleTaskClick = (task: GanttTask) => {
    setSelectedTask(task);
    setIsTaskDialogOpen(true);
  };

  const getPriorityColor = (priority: GanttTask['priority']) => {
    switch (priority) {
      case 'high': return 'hsl(var(--destructive))';
      case 'medium': return 'hsl(var(--warning))';
      default: return 'hsl(var(--muted))';
    }
  };

  const groupedTasks = useMemo(() => {
    const groups: Record<string, GanttTask[]> = {};
    tasks.forEach(task => {
      if (!groups[task.group]) {
        groups[task.group] = [];
      }
      groups[task.group].push(task);
    });
    return groups;
  }, [tasks]);

  const renderTaskBar = (task: GanttTask) => {
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const taskStart = Math.max(0, task.startDate.getTime() - start.getTime());
    const taskEnd = Math.min(totalDuration, task.endDate.getTime() - start.getTime());
    const taskDuration = taskEnd - taskStart;
    
    if (taskDuration <= 0) return null;
    
    const leftPercent = (taskStart / totalDuration) * 100;
    const widthPercent = Math.max((taskDuration / totalDuration) * 100, 8);
    
    return (
      <div
        className="relative h-6 rounded cursor-pointer transition-all duration-200 hover:h-7 shadow-sm"
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          backgroundColor: getStatusColor(task.status),
          minWidth: '60px'
        }}
        onClick={() => handleTaskClick(task)}
      >
        {/* Progress fill */}
        <div 
          className="h-full bg-white/30 rounded transition-all duration-500"
          style={{ width: `${task.progress}%` }}
        />
        
        {/* Task content with better text handling */}
        <div className="absolute inset-0 flex items-center px-2 text-white text-xs font-medium">
          <span className="truncate mr-1" style={{ maxWidth: '70%' }}>
            {task.name}
          </span>
          <span className="text-xs opacity-90 ml-auto">
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
              <div>
                <CardTitle className="text-2xl">專案甘特圖</CardTitle>
                <p className="text-muted-foreground mt-1">視覺化項目時程與進度管理 - 任務規劃與依賴關係</p>
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
              <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
                <Download className="h-4 w-4 mr-2" />
                匯出
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex">
            {/* Left Panel - Task List */}
            <div className="w-1/3 border-r bg-muted/30">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold">任務清單與活動列表</h3>
                <p className="text-sm text-muted-foreground">專案中所有任務活動及其詳細資訊</p>
              </div>
              <ScrollArea className="h-96">
                {Object.entries(groupedTasks).map(([group, groupTasks]) => (
                  <div key={group} className="p-2">
                    <div className="font-medium text-sm mb-2 px-2 py-1 bg-muted rounded">
                      {group} ({groupTasks.length})
                    </div>
                    {groupTasks.map(task => (
                      <div 
                        key={task.id} 
                        className="p-3 mb-2 bg-background rounded border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleTaskClick(task)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{task.name}</span>
                          <Badge 
                            variant="outline" 
                            className="text-xs"
                            style={{ 
                              backgroundColor: getPriorityColor(task.priority) + '20', 
                              borderColor: getPriorityColor(task.priority) 
                            }}
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {task.description}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            <span>{task.assignee}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            <span>{task.duration}天</span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>進度</span>
                            <span>{task.progress}%</span>
                          </div>
                          <Progress value={task.progress} className="h-1" />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{task.startDate.toLocaleDateString('zh-TW')}</span>
                          <span>{task.endDate.toLocaleDateString('zh-TW')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </ScrollArea>
            </div>
            
            {/* Right Panel - Timeline */}
            <div className="flex-1">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold">專案時間軸</h3>
                <p className="text-sm text-muted-foreground">時程規劃與依賴關係視覺化</p>
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
                  <div className="absolute -top-1 -left-4 text-xs text-primary font-medium bg-background px-1 rounded">
                    今日
                  </div>
                </div>
              </div>
              
              {/* Task Bars */}
              <ScrollArea className="h-96">
                <div className="p-4 space-y-4">
                  {Object.entries(groupedTasks).map(([group, groupTasks]) => (
                    <div key={group}>
                      <div className="text-sm font-medium mb-2 p-2 bg-muted/50 rounded">
                        {group}
                      </div>
                      {groupTasks.map(task => (
                        <div key={task.id} className="relative h-8 mb-3 hover:bg-muted/20 rounded p-1">
                          {renderTaskBar(task)}
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
      
      {/* Task Detail Dialog */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>任務詳情 - {selectedTask?.name}</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>任務名稱</Label>
                    <Input value={selectedTask.name} readOnly />
                  </div>
                  <div>
                    <Label>任務描述</Label>
                    <Textarea value={selectedTask.description} readOnly />
                  </div>
                  <div>
                    <Label>負責人</Label>
                    <Input value={selectedTask.assignee} readOnly />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label>開始日期</Label>
                    <Input value={selectedTask.startDate.toLocaleDateString('zh-TW')} readOnly />
                  </div>
                  <div>
                    <Label>結束日期</Label>
                    <Input value={selectedTask.endDate.toLocaleDateString('zh-TW')} readOnly />
                  </div>
                  <div>
                    <Label>工期</Label>
                    <Input value={`${selectedTask.duration} 天`} readOnly />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>預計工時</Label>
                  <Input value={`${selectedTask.estimatedHours} 小時`} readOnly />
                </div>
                <div>
                  <Label>優先度</Label>
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getPriorityColor(selectedTask.priority) }}
                    />
                    <span className="capitalize">{selectedTask.priority}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>進度狀態</Label>
                <div className="mt-2">
                  <div className="flex justify-between text-sm mb-2">
                    <span>完成度</span>
                    <span className="font-medium">{selectedTask.progress}%</span>
                  </div>
                  <Progress value={selectedTask.progress} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>未開始</span>
                    <span>進行中</span>
                    <span>已完成</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>相互依賴關係</Label>
                <div className="mt-2 p-3 bg-muted/50 rounded">
                  {selectedTask.dependencies && selectedTask.dependencies.length > 0 ? (
                    <div className="space-y-1">
                      {selectedTask.dependencies.map((dep, idx) => (
                        <div key={idx} className="text-sm">• 依賴任務: {dep}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">無依賴關係</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="專案甘特圖"
        data={tasks}
      />
    </div>
  );
}