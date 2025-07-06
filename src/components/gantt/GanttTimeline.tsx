import { useMemo } from 'react';

interface TimeMarker {
  date: Date;
  percent: number;
  label: string;
}

interface GanttTimelineProps {
  viewRange: { start: Date; end: Date };
}

export function GanttTimeline({ viewRange }: GanttTimelineProps) {
  const timeMarkers = useMemo(() => {
    const markers: TimeMarker[] = [];
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

  return (
    <div className="relative h-16 bg-gradient-to-r from-muted/10 via-muted/20 to-muted/10 border-b border-border/50 overflow-hidden backdrop-blur-sm">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent"></div>
      </div>
      
      {timeMarkers.map((marker, idx) => (
        <div
          key={idx}
          className="absolute top-0 bottom-0 border-l border-border/20 hover:border-primary/50 transition-colors duration-200"
          style={{ left: `${marker.percent}%` }}
        >
          <div className="absolute top-2 left-2 text-xs text-muted-foreground whitespace-nowrap bg-background/80 px-2 py-1 rounded-md shadow-sm border border-border/20 backdrop-blur-sm">
            {marker.label}
          </div>
          <div className="absolute bottom-2 left-2 text-xs text-muted-foreground/60 whitespace-nowrap">
            {marker.date.toLocaleDateString('zh-TW', { weekday: 'short' })}
          </div>
        </div>
      ))}
      
      {/* Today Line with enhanced styling */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-gradient-primary z-20 shadow-glow animate-pulse-slow"
        style={{ 
          left: `${((new Date().getTime() - viewRange.start.getTime()) / (viewRange.end.getTime() - viewRange.start.getTime())) * 100}%` 
        }}
      >
        <div className="absolute -top-2 -left-8 text-xs text-primary font-semibold bg-primary/10 px-3 py-1 rounded-full border border-primary/30 shadow-md backdrop-blur-sm">
          今日
        </div>
        <div className="absolute top-4 -left-1 w-3 h-3 bg-primary rounded-full shadow-glow animate-pulse-slow"></div>
      </div>
    </div>
  );
}