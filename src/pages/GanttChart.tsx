import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useGanttTasks } from '@/hooks/useGanttTasks';
import { GanttTimeline } from '@/components/gantt/GanttTimeline';
import { GanttMachineRow } from '@/components/gantt/GanttMachineRow';

export default function GanttChart() {
  const { systems, progress, isLoading } = useUnifiedData();
  const ganttTasks = useGanttTasks(systems, progress);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Memoize sorted tasks for better performance
  const sortedTasks = useMemo(() => {
    return [...ganttTasks].sort((a, b) => a.name.localeCompare(b.name));
  }, [ganttTasks]);

  // Set view range based on actual data
  useEffect(() => {
    if (sortedTasks.length > 0) {
      const allDates = sortedTasks.flatMap(task => [task.startDate, task.endDate]).filter(Boolean) as Date[];
      
      if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        
        // Add buffer
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);
        
        setViewRange({ start: minDate, end: maxDate });
      }
    }
  }, [sortedTasks]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">載入中...</div>
          <div className="text-muted-foreground">正在載入甘特圖資料</div>
        </div>
      </div>
    );
  }

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
          <div className="flex flex-col">
            {/* Header Section */}
            <div className="flex bg-muted/10 border-b">
              {/* Machine Name Header */}
              <div className="w-48 flex-shrink-0 px-4 py-3 bg-muted/20 border-r border-border/30">
                <h3 className="font-semibold text-sm">機台名稱</h3>
                <p className="text-xs text-muted-foreground">共 {sortedTasks.length} 台</p>
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
            
            {/* Gantt Chart Body */}
            <ScrollArea className="h-[600px]">
              <div className="min-w-full">
                {sortedTasks.map(task => (
                  <GanttMachineRow 
                    key={task.id} 
                    task={task} 
                    viewRange={viewRange} 
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}