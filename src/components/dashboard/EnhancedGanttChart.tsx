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
import { supabase } from '@/integrations/supabase/client';
import { ExportDialog } from '@/components/production/ExportDialog';

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
  const { systems, progress, stations } = useUnifiedData();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { toast } = useToast();

  // Initialize tasks from systems data using real database timestamps
  useEffect(() => {
    if (!systems.length) return;
    
    const ganttTasks: GanttTask[] = systems.map((system) => {
      const systemProgress = progress.filter(p => p.system_id === system.id);
      const avgProgress = systemProgress.length > 0 
        ? systemProgress.reduce((sum, p) => sum + (p.progress_percent || 0), 0) / systemProgress.length 
        : 0;

      // Calculate real start and end dates from test_progress data
      const progressWithDates = systemProgress.filter(p => p.started_at || p.completed_at);
      
      let realStartDate: Date;
      let realEndDate: Date;
      
      if (progressWithDates.length > 0) {
        // Use actual database timestamps
        const startDates = progressWithDates
          .filter(p => p.started_at)
          .map(p => new Date(p.started_at!));
        const endDates = progressWithDates
          .filter(p => p.completed_at)
          .map(p => new Date(p.completed_at!));
        
        realStartDate = startDates.length > 0 
          ? new Date(Math.min(...startDates.map(d => d.getTime())))
          : new Date('2025-07-01'); // Default start date
        
        if (endDates.length > 0) {
          realEndDate = new Date(Math.max(...endDates.map(d => d.getTime())));
        } else {
          // Estimate end date based on start date and progress
          const estimatedDurationDays = avgProgress > 0 ? (100 / avgProgress) * 5 : 10; // 5 days per 100% progress
          realEndDate = new Date(realStartDate.getTime() + estimatedDurationDays * 24 * 60 * 60 * 1000);
        }
      } else {
        // Fallback if no test progress data
        realStartDate = new Date('2025-07-01'); // Default start date
        realEndDate = new Date(realStartDate.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days default
      }
      
      // Determine status based on progress and dates
      let status: GanttTask['status'] = 'not_started';
      const today = new Date();
      
      if (avgProgress === 100) {
        status = 'completed';
      } else if (avgProgress > 0) {
        status = realEndDate < today ? 'delayed' : 'in_progress';
      } else if (realStartDate <= today) {
        status = 'delayed';
      }

      return {
        id: system.id,
        name: system.system_name,
        startDate: realStartDate,
        endDate: realEndDate,
        progress: Math.round(avgProgress),
        assignee: system.assigned_engineer || 'Unassigned',
        priority: avgProgress < 50 && realEndDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'high' : 'medium',
        status,
        group: `${system.assigned_engineer || 'Unassigned'} Team`,
        notes: `Current station: ${system.current_station}`
      };
    });
    
    setTasks(ganttTasks);
    
    // Set initial view range based on real data
    if (ganttTasks.length > 0) {
      const minDate = new Date(Math.min(...ganttTasks.map(t => t.startDate.getTime())));
      const maxDate = new Date(Math.max(...ganttTasks.map(t => t.endDate.getTime())));
      minDate.setDate(minDate.getDate() - 7); // Add some padding
      maxDate.setDate(maxDate.getDate() + 14); // More padding for future planning
      setViewRange({ start: minDate, end: maxDate });
    } else {
      // Fallback view range if no tasks
      const today = new Date();
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const end = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);   // 60 days forward
      setViewRange({ start, end });
    }
  }, [systems, progress]);

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

  // Generate time markers based on scale and zoom - with improved spacing for Chinese text
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let increment: number;
    let format: Intl.DateTimeFormatOptions;
    let secondaryFormat: Intl.DateTimeFormatOptions;
    let minSpacing: number; // Minimum spacing percentage to avoid overlap
    
    switch (timeScale) {
      case 'day':
        increment = 1;
        format = { month: 'short', day: 'numeric' };
        secondaryFormat = { weekday: 'short' };
        minSpacing = 12; // Increase spacing for Chinese text
        break;
      case 'week':
        increment = 3; // Show every 3 days to reduce crowding
        format = { month: 'short', day: 'numeric' };
        secondaryFormat = { weekday: 'short' };
        minSpacing = 10;
        break;
      case 'month':
        increment = 7;
        format = { month: 'short', day: 'numeric' };
        secondaryFormat = { month: 'short', year: 'numeric' };
        minSpacing = 8;
        break;
      case 'year':
        increment = 30;
        format = { year: 'numeric', month: 'short' };
        secondaryFormat = { year: 'numeric' };
        minSpacing = 6;
        break;
    }
    
    // Adjust increment based on total time span to prevent overcrowding
    if (totalDays > 180) { // More than 6 months
      increment = Math.max(increment, 7);
      minSpacing = Math.max(minSpacing, 5);
    } else if (totalDays > 90) { // More than 3 months
      increment = Math.max(increment, 3);
      minSpacing = Math.max(minSpacing, 8);
    }
    
    let currentDate = new Date(start);
    let lastLabelPosition = -minSpacing; // Track last label position to avoid overlap
    
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      // Only add marker if it's far enough from the last one
      if (percent - lastLabelPosition >= minSpacing) {
        markers.push({
          date: new Date(currentDate),
          percent,
          label: currentDate.toLocaleDateString('zh-TW', format),
          secondaryLabel: currentDate.toLocaleDateString('zh-TW', secondaryFormat)
        });
        lastLabelPosition = percent;
      }
      
      currentDate.setDate(currentDate.getDate() + increment);
    }
    
    // Ensure we have at least a few markers, but not too many
    if (markers.length < 3 && totalDays > 7) {
      // If we have too few markers, create some basic ones
      const markersToAdd = Math.min(5, Math.floor(totalDays / 7));
      const additionalMarkers = [];
      for (let i = 1; i <= markersToAdd; i++) {
        const dayOffset = Math.floor((totalDays / (markersToAdd + 1)) * i);
        const markerDate = new Date(start.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const percent = (dayOffset / totalDays) * 100;
        
        additionalMarkers.push({
          date: markerDate,
          percent,
          label: markerDate.toLocaleDateString('zh-TW', format),
          secondaryLabel: markerDate.toLocaleDateString('zh-TW', secondaryFormat)
        });
      }
      return [...markers, ...additionalMarkers].sort((a, b) => a.percent - b.percent);
    }
    
    return markers;
  }, [viewRange, timeScale, zoomLevel]);

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
    
    // Calculate task position relative to view range
    const taskStartOffset = task.startDate.getTime() - start.getTime();
    const taskEndOffset = task.endDate.getTime() - start.getTime();
    
    // Skip tasks completely outside view range
    if (taskEndOffset < 0 || taskStartOffset > totalDuration) return null;
    
    // Calculate visible portion of the task
    const visibleStart = Math.max(0, taskStartOffset);
    const visibleEnd = Math.min(totalDuration, taskEndOffset);
    const visibleDuration = visibleEnd - visibleStart;
    
    if (visibleDuration <= 0) return null;
    
    const leftPercent = (visibleStart / totalDuration) * 100;
    const widthPercent = (visibleDuration / totalDuration) * 100;
    
    // Get detailed station progress for this system
    const systemProgress = progress.filter(p => p.system_id === task.id);
    const stageProgress = stations.map(station => {
      const stationProgress = systemProgress.filter(p => p.station_id === station.id);
      const completedItems = stationProgress.filter(p => p.status === 'Done').length;
      const totalItems = stationProgress.length;
      const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
      
      return {
        stationName: station.station_name,
        stationOrder: station.station_order,
        progress: progressPercent,
        status: progressPercent === 100 ? 'completed' : 
                progressPercent > 0 ? 'in_progress' : 'not_started',
        completedItems,
        totalItems
      };
    }).sort((a, b) => a.stationOrder - b.stationOrder);
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute h-6 rounded cursor-pointer transition-all duration-200 hover:h-7 hover:-translate-y-0.5 shadow-sm flex overflow-hidden"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                minWidth: '80px'
              }}
              onClick={() => handleTaskClick(task)}
              onMouseEnter={() => setHoveredTask(task.id)}
              onMouseLeave={() => setHoveredTask(null)}
            >
              {/* Multi-stage progress bars */}
              {stageProgress.map((stage, index) => (
                <div
                  key={stage.stationName}
                  className="flex-1 relative flex items-center justify-center text-xs font-medium text-white border-r border-white/20 last:border-r-0"
                  style={{
                    backgroundColor: stage.status === 'completed' ? 'hsl(var(--success))' :
                                   stage.status === 'in_progress' ? 'hsl(var(--primary))' :
                                   'hsl(var(--muted))',
                    minWidth: '20px'
                  }}
                >
                  {/* Progress fill within each stage */}
                  <div 
                    className="absolute inset-0 bg-white/20 transition-all duration-500"
                    style={{ width: `${stage.progress}%` }}
                  />
                  <span className="relative z-10 text-xs">
                    {stage.stationName.replace('Station ', 'S')}
                  </span>
                </div>
              ))}
              
              {/* Overall progress indicator */}
              <div className="absolute -top-1 -right-1 bg-background border border-border rounded-full px-1 text-xs font-medium">
                {task.progress}%
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-3">
              <div className="font-medium text-base">{task.name}</div>
              
              {/* Overall info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>總進度: {task.progress}%</div>
                <div>負責人: {task.assignee}</div>
                <div>狀態: {task.status}</div>
                <div>優先度: {task.priority}</div>
              </div>
              
              {/* Stage details */}
              <div className="space-y-2">
                <div className="font-medium text-sm border-b pb-1">測試站點進度:</div>
                {stageProgress.map((stage) => (
                  <div key={stage.stationName} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ 
                          backgroundColor: stage.status === 'completed' ? 'hsl(var(--success))' :
                                         stage.status === 'in_progress' ? 'hsl(var(--primary))' :
                                         'hsl(var(--muted))' 
                        }}
                      />
                      <span>{stage.stationName}</span>
                    </div>
                    <div className="text-xs">
                      {stage.completedItems}/{stage.totalItems} ({Math.round(stage.progress)}%)
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Time info */}
              <div className="text-xs text-muted-foreground border-t pt-2">
                <div>開始: {task.startDate.toLocaleDateString('zh-TW')}</div>
                <div>結束: {task.endDate.toLocaleDateString('zh-TW')}</div>
                {task.notes && <div>備註: {task.notes}</div>}
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
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
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
            {/* Timeline Header - Double layer design */}
            <div className="sticky top-0 bg-background z-10 pb-4">
              <div className="relative h-20 bg-muted/30 rounded border overflow-hidden">
                {/* Primary time markers */}
                {timeMarkers.map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${marker.percent}%` }}
                  >
                    {/* Primary label */}
                    <div className="absolute top-1 left-1 text-xs text-muted-foreground whitespace-nowrap bg-background/80 px-1 rounded">
                      {marker.label}
                    </div>
                    {/* Secondary label */}
                    <div className="absolute top-8 left-1 text-xs text-muted-foreground/70 whitespace-nowrap bg-background/60 px-1 rounded">
                      {marker.secondaryLabel}
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
                  <div className="absolute -top-2 -left-6 text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
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
      
      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="專案甘特圖"
        data={tasks.map(task => ({
          任務名稱: task.name,
          負責人: task.assignee,
          開始日期: task.startDate.toLocaleDateString('zh-TW'),
          結束日期: task.endDate.toLocaleDateString('zh-TW'),
          進度: `${task.progress}%`,
          狀態: task.status,
          優先度: task.priority,
          團隊: task.group,
          備註: task.notes || ''
        }))}
      />
    </Card>
  );
}