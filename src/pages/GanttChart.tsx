import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useGanttTasks } from '@/hooks/useGanttTasks';
import { GanttTimeline } from '@/components/gantt/GanttTimeline';
import { GanttTaskBar } from '@/components/gantt/GanttTaskBar';
import { GanttTaskList } from '@/components/gantt/GanttTaskList';

export default function GanttChart() {
  const { systems, progress, isLoading } = useUnifiedData();
  const ganttTasks = useGanttTasks(systems, progress);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [zoomLevel, setZoomLevel] = useState(1);

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
          <div className="flex">
            {/* Left Panel - Task List */}
            <GanttTaskList tasks={ganttTasks} />
            
            {/* Right Panel - Gantt Chart */}
            <div className="flex-1">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold">時間軸圖表</h3>
                <p className="text-sm text-muted-foreground">機台排程與進度視覺化</p>
              </div>
              
              {/* Timeline Header */}
              <GanttTimeline viewRange={viewRange} />
              
              {/* Gantt Bars */}
              <ScrollArea className="h-[600px]">
                <div className="p-4 space-y-4">
                  {ganttTasks.map(task => (
                    <div key={task.id} className="relative h-12 hover:bg-muted/20 rounded p-2">
                      <GanttTaskBar task={task} viewRange={viewRange} />
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