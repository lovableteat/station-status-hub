import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimelineViewType } from "./MachineTimeline";

interface TimelineControlsProps {
  viewType: TimelineViewType;
  onViewTypeChange: (type: TimelineViewType) => void;
  timelineBounds: { start: Date; end: Date };
}

export function TimelineControls({ 
  viewType, 
  onViewTypeChange, 
  timelineBounds 
}: TimelineControlsProps) {
  const formatDateRange = () => {
    const start = timelineBounds.start.toLocaleDateString('zh-TW');
    const end = timelineBounds.end.toLocaleDateString('zh-TW');
    return `${start} - ${end}`;
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">時間範圍:</span>
        <Badge variant="outline" className="text-xs">
          {formatDateRange()}
        </Badge>
      </div>
      
      <div className="flex items-center gap-1 border rounded-lg p-1">
        {(['day', 'week', 'month'] as const).map((type) => (
          <Button
            key={type}
            variant={viewType === type ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewTypeChange(type)}
            className="text-xs px-3"
          >
            {type === 'day' ? '日' : type === 'week' ? '週' : '月'}
          </Button>
        ))}
      </div>
    </div>
  );
}