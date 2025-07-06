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
  <CardHeader className="bg-gradient-to-r from-card via-card/80 to-card backdrop-blur-sm">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack} className="shadow-md hover:shadow-lg transition-shadow duration-200">
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <Button variant="outline" onClick={onNavigateToTracker} className="shadow-md hover:shadow-lg transition-shadow duration-200">
          測試進度表
        </Button>
        <div>
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            機台排程甘特圖
          </CardTitle>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            基於測試進度的機台排程時間軸
            <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
              {taskCount} 台機器
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={() => onZoom('out')} className="hover:bg-muted/50">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onZoom('in')} className="hover:bg-muted/50">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={() => onTimeNavigation('prev')} className="hover:bg-muted/50">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onTimeNavigation('next')} className="hover:bg-muted/50">
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
  <div className="flex bg-gradient-to-r from-muted/20 via-muted/30 to-muted/20 border-b border-border/50 backdrop-blur-sm">
    {/* Machine Name Header */}
    <div className="w-48 flex-shrink-0 px-4 py-4 bg-gradient-to-r from-card/80 to-card/40 border-r border-border/30 rounded-tl-lg backdrop-blur-sm">
      <h3 className="font-bold text-sm text-foreground mb-1">機台名稱</h3>
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">共 {taskCount} 台</span>
      </p>
    </div>
    
    {/* Timeline Header */}
    <div className="flex-1 bg-gradient-to-r from-card/40 to-transparent">
      <div className="px-4 py-4">
        <h3 className="font-bold text-sm text-foreground mb-1">時間軸圖表</h3>
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
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
        <Card className="w-full shadow-lg border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-card via-card/80 to-card backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-10 rounded-lg" />
              <Skeleton className="w-24 h-10 rounded-lg" />
              <div>
                <Skeleton className="w-48 h-8 mb-2 rounded-lg" />
                <Skeleton className="w-64 h-4 rounded-lg" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <Skeleton className="w-48 h-16 rounded-lg" />
                  <Skeleton className="flex-1 h-16 rounded-lg" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <Card className="w-full shadow-lg border-0 bg-card/50 backdrop-blur-sm">
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
            
            {/* Gantt Chart Body with Enhanced Visual Design */}
            <ScrollArea className="h-[calc(100vh-300px)] min-h-[500px]">
              <div className="min-w-full space-y-1 p-2">
                {sortedTasks.map((task, index) => (
                  <div 
                    key={task.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <GanttMachineRow 
                      task={task} 
                      viewRange={viewRange}
                      isHovered={hoveredTask === task.id}
                      onHover={setHoveredTask}
                    />
                  </div>
                ))}
                {sortedTasks.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <div className="text-center space-y-2">
                      <div className="text-lg">暫無機台資料</div>
                      <div className="text-sm opacity-70">等待系統資料載入中...</div>
                    </div>
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