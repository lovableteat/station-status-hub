import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TimelineNavigationProps {
  bounds: { start: Date; end: Date };
  onNavigate: (direction: 'prev' | 'next') => void;
}

export function TimelineNavigation({ bounds, onNavigate }: TimelineNavigationProps) {
  const formatDateRange = (start: Date, end: Date) => {
    const startStr = start.toLocaleDateString('zh-TW', { 
      month: 'short', 
      day: 'numeric' 
    });
    const endStr = end.toLocaleDateString('zh-TW', { 
      month: 'short', 
      day: 'numeric' 
    });
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onNavigate('prev')}
        className="flex items-center gap-2"
      >
        <ChevronLeft className="h-4 w-4" />
        上一期
      </Button>
      
      <div className="text-sm font-medium text-muted-foreground">
        {formatDateRange(bounds.start, bounds.end)}
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onNavigate('next')}
        className="flex items-center gap-2"
      >
        下一期
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}