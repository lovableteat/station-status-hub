import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MachineTimelineData } from "@/hooks/useMachineTimelineData";
import { TimelineViewType } from "./MachineTimeline";
import { cn } from "@/lib/utils";

interface MachineRowProps {
  machine: MachineTimelineData;
  viewType: TimelineViewType;
  bounds: { start: Date; end: Date };
  isSelected: boolean;
  onSelect: () => void;
  onDetail?: () => void;
}

export function MachineRow({ 
  machine, 
  viewType, 
  bounds, 
  isSelected, 
  onSelect,
  onDetail
}: MachineRowProps) {
  const progressBar = useMemo(() => {
    if (!machine.start_time) {
      return null;
    }

    const totalDuration = bounds.end.getTime() - bounds.start.getTime();
    const startTime = new Date(machine.start_time);
    const endTime = machine.end_time ? new Date(machine.end_time) : new Date();
    
    const startPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    const duration = endTime.getTime() - startTime.getTime();
    const width = (duration / totalDuration) * 100;

    // Ensure minimum visibility
    const actualWidth = Math.max(width, 2);
    const actualStartPosition = Math.max(0, Math.min(startPosition, 98));

    return {
      left: `${actualStartPosition}%`,
      width: `${actualWidth}%`,
      status: machine.status
    };
  }, [machine, bounds]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done':
        return 'bg-success';
      case 'On-going':
        return 'bg-warning';
      case 'Not Start':
        return 'bg-muted';
      default:
        return 'bg-muted';
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '未設定';
    return new Date(dateStr).toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "relative h-16 border-b cursor-pointer transition-colors",
          isSelected ? "bg-muted/70" : "hover:bg-muted/30"
        )}
        onClick={onSelect}
      >
        {/* Progress bar */}
        {progressBar && (
          <div className="relative h-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-8 rounded-md border-2 border-background shadow-sm transition-all cursor-pointer hover:scale-105",
                    getStatusColor(progressBar.status),
                    isSelected && "ring-2 ring-primary ring-offset-2"
                  )}
                  style={{
                    position: 'absolute',
                    left: progressBar.left,
                    width: progressBar.width,
                    top: '16px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetail?.();
                  }}
                >
                  <div className="flex items-center justify-center h-full px-2">
                    <span className="text-xs font-medium text-background">
                      {machine.overall_progress}%
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                  <div className="space-y-1 max-w-xs">
                    <div className="font-medium">{machine.system_name}</div>
                    <div className="text-sm">
                      <div>狀態: {machine.status}</div>
                      <div>進度: {machine.overall_progress}%</div>
                      <div>開始: {formatDateTime(machine.start_time)}</div>
                      <div>完成: {formatDateTime(machine.end_time)}</div>
                      {machine.duration_hours && (
                        <div>時長: {machine.duration_hours.toFixed(1)} 小時</div>
                      )}
                    </div>
                  </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* No data indicator */}
        {!progressBar && (
          <div className="flex items-center justify-center h-full">
            <Badge variant="outline" className="text-xs">
              尚未開始
            </Badge>
          </div>
        )}

        {/* Current time indicator line (extends through all rows) */}
        <div
          className="absolute top-0 h-full pointer-events-none z-10"
          style={{ 
            left: `${((new Date().getTime() - bounds.start.getTime()) / (bounds.end.getTime() - bounds.start.getTime())) * 100}%` 
          }}
        >
          <div className="h-full border-l-2 border-destructive opacity-30" />
        </div>
      </div>
    </TooltipProvider>
  );
}