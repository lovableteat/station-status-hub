import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useGanttTasks } from '@/hooks/useGanttTasks';
import { GanttTimeline } from '@/components/gantt/GanttTimeline';
import { GanttMachineRow } from '@/components/gantt/GanttMachineRow';

// Memoized loading skeleton
const GanttSkeleton = memo(() => (
  <div className="space-y-2">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex gap-4">
        <Skeleton className="w-48 h-12" />
        <Skeleton className="flex-1 h-12" />
      </div>
    ))}
  </div>
));

// Memoized header component
const GanttHeader = memo(({
  onBack,
  onNavigateToTracker,
  onZoom,
  onTimeNavigation,
  taskCount
}: {
  onBack: () => void;
  onNavigateToTracker: () => void;
  onZoom: (direction: 'in' | 'out') => void;
  onTimeNavigation: (direction: 'prev' | 'next') => void;
  taskCount: number;
}) => (
  <CardHeader>
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <Button variant="outline" onClick={onNavigateToTracker}>
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
          <Button variant="outline" size="sm" onClick={() => onZoom('out')}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onZoom('in')}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onTimeNavigation('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onTimeNavigation('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </CardHeader>
));

// Memoized table header
const GanttTableHeader = memo(({ 
  taskCount, 
  viewRange 
}: { 
  taskCount: number; 
  viewRange: { start: Date; end: Date };
}) => (
  <div className="flex bg-muted/10 border-b">
    {/* Machine Name Header */}
    <div className="w-48 flex-shrink-0 px-4 py-3 bg-muted/20 border-r border-border/30">
      <h3 className="font-semibold text-sm">機台名稱</h3>
      <p className="text-xs text-muted-foreground">共 {taskCount} 台</p>
    </div>
    
    {/* Timeline Header */}
    <div className="flex-1">
      <div className="px-4 py-3">
        <h3 className="font-semibold text-sm">時間軸圖表</h3>
        <p className="text-xs text-muted-foreground">機台排程與進度視覺化</p>
      </div>
      <GanttTimeline viewRange={viewRange} />
    </div>
  </div>
));

export default function OptimizedGanttChart() {
  const { systems, progress, isLoading } = useUnifiedData();
  const ganttTasks = useGanttTasks(systems, progress);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Memoize sorted tasks with better performance
  const sortedTasks = useMemo(() => {
    if (!ganttTasks.length) return [];
    return [...ganttTasks].sort((a, b) => a.name.localeCompare(b.name));
  }, [ganttTasks]);

  // Set view range based on actual data with better logic
  useEffect(() => {
    if (sortedTasks.length === 0) return;
    
    const allDates = sortedTasks
      .flatMap(task => [task.startDate, task.endDate])
      .filter((date): date is Date => date !== null);
    
    if (allDates.length === 0) return;

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add buffer
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);
    
    setViewRange({ start: minDate, end: maxDate });
  }, [sortedTasks]);

  // Optimized event handlers
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setZoomLevel(prev => direction === 'in' ? Math.min(prev * 1.5, 3) : Math.max(prev / 1.5, 0.5));
  }, []);

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

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-10" />
              <Skeleton className="w-24 h-10" />
              <div>
                <Skeleton className="w-48 h-8 mb-2" />
                <Skeleton className="w-64 h-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <GanttSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <Card className="w-full">
        <GanttHeader
          onBack={handleBack}
          onNavigateToTracker={handleNavigateToTracker}
          onZoom={handleZoom}
          onTimeNavigation={handleTimeNavigation}
          taskCount={sortedTasks.length}
        />
        
        <CardContent className="p-0">
          <div className="flex flex-col">
            <GanttTableHeader taskCount={sortedTasks.length} viewRange={viewRange} />
            
            {/* Gantt Chart Body with Virtual Scrolling */}
            <ScrollArea className="h-[600px]">
              <div className="min-w-full">
                {sortedTasks.map(task => (
                  <GanttMachineRow 
                    key={task.id} 
                    task={task} 
                    viewRange={viewRange} 
                  />
                ))}
                {sortedTasks.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    暫無機台資料
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}