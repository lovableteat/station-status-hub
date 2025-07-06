import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface TimelineGridProps {
  bounds: { start: Date; end: Date };
}

export function TimelineGrid({ bounds }: TimelineGridProps) {
  const calendarData = useMemo(() => {
    const days: Array<{
      date: Date;
      day: number;
      month: number;
      year: number;
      isWeekend: boolean;
      isToday: boolean;
      isNewMonth: boolean;
      monthLabel?: string;
    }> = [];

    const start = new Date(bounds.start);
    const end = new Date(bounds.end);
    const current = new Date(start);
    const today = new Date();
    
    let lastMonth = -1;
    
    while (current <= end) {
      const currentMonth = current.getMonth();
      const isNewMonth = currentMonth !== lastMonth;
      
      days.push({
        date: new Date(current),
        day: current.getDate(),
        month: currentMonth,
        year: current.getFullYear(),
        isWeekend: current.getDay() === 0 || current.getDay() === 6,
        isToday: current.toDateString() === today.toDateString(),
        isNewMonth,
        monthLabel: isNewMonth ? current.toLocaleDateString('zh-TW', { month: 'long' }) : undefined
      });
      
      lastMonth = currentMonth;
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [bounds]);

  const getDayWidth = () => {
    const totalDays = calendarData.length;
    if (totalDays === 0) return 0;
    return 100 / totalDays;
  };

  const dayWidth = getDayWidth();
  const now = new Date();
  const isInBounds = now >= bounds.start && now <= bounds.end;

  return (
    <div className="relative h-20 border-b bg-background">
      {/* Month headers */}
      <div className="h-6 border-b bg-muted/30 flex">
        {calendarData.map((day, index) => {
          if (!day.isNewMonth) return null;
          
          // Calculate month span
          let monthDays = 1;
          for (let i = index + 1; i < calendarData.length; i++) {
            if (calendarData[i].month === day.month) {
              monthDays++;
            } else {
              break;
            }
          }
          
          return (
            <div
              key={`month-${day.year}-${day.month}`}
              className="flex items-center justify-center border-r text-xs font-semibold text-muted-foreground bg-muted/50"
              style={{ 
                width: `${dayWidth * monthDays}%`,
                minWidth: '60px'
              }}
            >
              {day.monthLabel}
            </div>
          );
        })}
      </div>

      {/* Date grid */}
      <div className="h-14 flex">
        {calendarData.map((day, index) => {
          const todayPosition = isInBounds && day.isToday ? 
            (index / calendarData.length) * 100 : null;
          
          return (
            <div
              key={day.date.toISOString()}
              className={cn(
                "relative flex items-center justify-center border-r text-sm font-medium transition-colors",
                day.isWeekend ? "bg-muted/20 text-muted-foreground" : "bg-background",
                day.isToday && "bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
              )}
              style={{ width: `${dayWidth}%`, minWidth: '30px' }}
            >
              <span className="select-none">{day.day}</span>
              
              {/* Today indicator line */}
              {day.isToday && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-primary/60 z-10" />
              )}
            </div>
          );
        })}
      </div>

      {/* Current time indicator (for precise time within day) */}
      {isInBounds && (
        <div
          className="absolute top-6 h-14 z-20 pointer-events-none"
          style={{ 
            left: `${((now.getTime() - bounds.start.getTime()) / (bounds.end.getTime() - bounds.start.getTime())) * 100}%` 
          }}
        >
          <div className="h-full border-l-2 border-destructive shadow-sm" />
          <div className="absolute top-1 -translate-x-1/2 left-0">
            <div className="w-2 h-2 bg-destructive rounded-full shadow-sm" />
          </div>
        </div>
      )}
    </div>
  );
}