import { useMemo } from "react";
import { TimelineViewType } from "./MachineTimeline";

interface TimelineGridProps {
  viewType: TimelineViewType;
  bounds: { start: Date; end: Date };
}

export function TimelineGrid({ viewType, bounds }: TimelineGridProps) {
  const timeMarkers = useMemo(() => {
    const markers: Array<{ date: Date; label: string; isMain: boolean }> = [];
    const start = new Date(bounds.start);
    const end = new Date(bounds.end);
    
    // Add some padding to the timeline
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() + 1);
    
    const current = new Date(start);
    
    while (current <= end) {
      switch (viewType) {
        case 'day':
          markers.push({
            date: new Date(current),
            label: current.toLocaleDateString('zh-TW', { 
              month: 'numeric', 
              day: 'numeric',
              hour: 'numeric'
            }),
            isMain: current.getHours() === 0
          });
          current.setHours(current.getHours() + 4);
          break;
          
        case 'week':
          markers.push({
            date: new Date(current),
            label: current.toLocaleDateString('zh-TW', { 
              month: 'numeric', 
              day: 'numeric' 
            }),
            isMain: current.getDay() === 1 // Monday
          });
          current.setDate(current.getDate() + 1);
          break;
          
        case 'month':
          markers.push({
            date: new Date(current),
            label: current.toLocaleDateString('zh-TW', { 
              month: 'numeric', 
              day: 'numeric' 
            }),
            isMain: current.getDate() === 1
          });
          current.setDate(current.getDate() + 3);
          break;
      }
    }
    
    return markers;
  }, [viewType, bounds]);

  const now = new Date();
  const isInBounds = now >= bounds.start && now <= bounds.end;

  return (
    <div className="relative h-16 border-b bg-muted/10">
      {/* Grid lines and labels */}
      <div className="relative h-full">
        {timeMarkers.map((marker, index) => {
          const totalDuration = bounds.end.getTime() - bounds.start.getTime();
          const markerPosition = ((marker.date.getTime() - bounds.start.getTime()) / totalDuration) * 100;
          
          return (
            <div
              key={index}
              className="absolute top-0 h-full"
              style={{ left: `${markerPosition}%` }}
            >
              <div className={`h-full border-l ${marker.isMain ? 'border-border' : 'border-border/50'}`} />
              <div className="absolute top-2 -translate-x-1/2 left-0 min-w-max px-1">
                <span className={`text-sm ${marker.isMain ? 'font-medium' : 'text-muted-foreground'}`}>
                  {marker.label}
                </span>
              </div>
            </div>
          );
        })}
        
        {/* Current time indicator */}
        {isInBounds && (
          <div
            className="absolute top-0 h-full z-10"
            style={{ 
              left: `${((now.getTime() - bounds.start.getTime()) / (bounds.end.getTime() - bounds.start.getTime())) * 100}%` 
            }}
          >
            <div className="h-full border-l-2 border-destructive" />
            <div className="absolute top-1 -translate-x-1/2 left-0">
              <div className="w-2 h-2 bg-destructive rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}