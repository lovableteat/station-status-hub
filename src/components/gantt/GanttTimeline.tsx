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
  );
}