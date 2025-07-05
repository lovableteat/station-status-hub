import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Plus, Edit, Trash2, Save, ZoomIn, ZoomOut, Calendar, 
  ChevronLeft, ChevronRight, Download, Eye, EyeOff,
  Clock, User, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useSystemTimeline } from '@/hooks/useSystemTimeline';
import { supabase } from '@/integrations/supabase/client';

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
  dependencies?: string[];
  notes?: string;
}

type TimeScale = 'day' | 'week' | 'month' | 'year';

export function EnhancedGanttChart() {
  const { systems, progress } = useUnifiedData();
  const { calculateSystemTimeline, isLoading: timelineLoading } = useSystemTimeline();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
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
        group: `${system.assigned_engineer || 'Unassigned'} Team`,
        notes: `Current station: ${system.current_station}`
      };
    });
    
    setTasks(ganttTasks);
    
    // Set initial view range
    if (ganttTasks.length > 0) {
      const minDate = new Date(Math.min(...ganttTasks.map(t => t.startDate.getTime())));
      const maxDate = new Date(Math.max(...ganttTasks.map(t => t.endDate.getTime())));
      minDate.setDate(minDate.getDate() - 7); // Add some padding
      maxDate.setDate(maxDate.getDate() + 7);
      setViewRange({ start: minDate, end: maxDate });
    }
  }, [systems, progress, timelineLoading, calculateSystemTimeline]);

  // Group tasks by team/assignee
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
      case 'year':
        increment = 365;
        format = { year: 'numeric' };
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

  const getPriorityIcon = (priority: GanttTask['priority']) => {
    switch (priority) {
      case 'high': return <AlertCircle className="h-3 w-3 text-destructive" />;
      case 'medium': return <Clock className="h-3 w-3 text-warning" />;
      default: return null;
    }
  };

  const handleTaskClick = (task: GanttTask) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
  };

  const toggleGroupCollapse = (group: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(group)) {
      newCollapsed.delete(group);
    } else {
      newCollapsed.add(group);
    }
    setCollapsedGroups(newCollapsed);
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
              className="absolute h-6 rounded cursor-pointer transition-all duration-200 hover:h-7 hover:-translate-y-0.5 shadow-sm flex items-center justify-between px-2 text-xs font-medium text-white"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                backgroundColor: getStatusColor(task.status),
                minWidth: '60px'
              }}
              onClick={() => handleTaskClick(task)}
              onMouseEnter={() => setHoveredTask(task.id)}
              onMouseLeave={() => setHoveredTask(null)}
            >
              <span className="truncate">{task.progress}%</span>
              <span className="text-xs opacity-75">
                {task.startDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                -
                {task.endDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-2">
              <div className="font-medium">{task.name}</div>
              <div className="text-sm">
                <div>Progress: {task.progress}%</div>
                <div>Assignee: {task.assignee}</div>
                <div>Status: {task.status}</div>
                {task.notes && <div>Notes: {task.notes}</div>}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>專案甘特圖</CardTitle>
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
                <SelectItem value="year">年</SelectItem>
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
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              匯出
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex gap-4">
          {/* Left Panel - Task List */}
          <div className="w-80 flex-shrink-0 border-r">
            <div className="sticky top-0 bg-background z-10 pb-4">
              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground p-2 border-b">
                <div>任務名稱</div>
                <div>負責人</div>
                <div>優先度</div>
              </div>
            </div>
            
            <ScrollArea className="h-96">
              {Object.entries(groupedTasks).map(([group, groupTasks]) => (
                <div key={group} className="mb-4">
                  {/* Group Header */}
                  <div 
                    className="flex items-center gap-2 p-2 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleGroupCollapse(group)}
                  >
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      {collapsedGroups.has(group) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <span className="font-medium">{group}</span>
                    <Badge variant="secondary" className="text-xs">{groupTasks.length}</Badge>
                  </div>
                  
                  {/* Group Tasks */}
                  {!collapsedGroups.has(group) && (
                    <div className="space-y-1">
                      {groupTasks.map(task => (
                        <div 
                          key={task.id} 
                          className={`grid grid-cols-3 gap-2 p-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer ${
                            hoveredTask === task.id ? 'bg-muted/50' : ''
                          }`}
                          onClick={() => handleTaskClick(task)}
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: getStatusColor(task.status) }}
                            />
                            <span className="truncate font-medium">{task.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs truncate">{task.assignee}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {getPriorityIcon(task.priority)}
                            <span className="text-xs capitalize">{task.priority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
          
          {/* Right Panel - Gantt Chart */}
          <div className="flex-1">
            {/* Timeline Header */}
            <div className="sticky top-0 bg-background z-10 pb-4">
              <div className="relative h-12 bg-muted/30 rounded border overflow-hidden">
                {timeMarkers.map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-l border-border/50"
                    style={{ left: `${marker.percent}%` }}
                  >
                    <div className="absolute -top-1 left-1 text-xs text-muted-foreground whitespace-nowrap">
                      {marker.label}
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
                  <div className="absolute -top-4 -left-4 text-xs text-primary font-medium bg-background px-1 rounded">
                    今日
                  </div>
                </div>
              </div>
            </div>
            
            {/* Task Bars */}
            <ScrollArea className="h-96">
              {Object.entries(groupedTasks).map(([group, groupTasks]) => (
                <div key={group} className="mb-6">
                  {/* Group Header */}
                  <div className="h-8 bg-muted/20 rounded flex items-center px-2 mb-2">
                    <span className="font-medium text-sm">{group}</span>
                  </div>
                  
                  {/* Group Task Bars */}
                  {!collapsedGroups.has(group) && (
                    <div className="space-y-2">
                      {groupTasks.map(task => (
                        <div 
                          key={task.id} 
                          className="relative h-8 hover:bg-muted/20 rounded transition-colors"
                        >
                          {renderTaskBar(task)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
        
        {/* Task Detail Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                      <Label>負責人</Label>
                      <Input value={selectedTask.assignee} readOnly />
                    </div>
                    <div>
                      <Label>進度</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="h-2 bg-primary rounded-full transition-all"
                            style={{ width: `${selectedTask.progress}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{selectedTask.progress}%</span>
                      </div>
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
                      <Label>狀態</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getStatusColor(selectedTask.status) }}
                        />
                        <span className="capitalize">{selectedTask.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedTask.notes && (
                  <div>
                    <Label>備註</Label>
                    <div className="mt-2 p-3 bg-muted/50 rounded">
                      {selectedTask.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}