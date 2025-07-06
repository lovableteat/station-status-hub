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
  const timelineBars = useMemo(() => {
    if (!machine.start_time) {
      return null;
    }

    const totalDuration = bounds.end.getTime() - bounds.start.getTime();
    const startTime = new Date(machine.start_time);
    const startPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    const actualStartPosition = Math.max(0, Math.min(startPosition, 98));
    
    // Calculate estimated bar (background) - full planned duration
    let estimatedBar = null;
    if (machine.estimated_end_time) {
      const estimatedEndTime = new Date(machine.estimated_end_time);
      const estimatedDuration = estimatedEndTime.getTime() - startTime.getTime();
      const estimatedWidth = Math.max((estimatedDuration / totalDuration) * 100, 2);
      
      estimatedBar = {
        left: `${actualStartPosition}%`,
        width: `${estimatedWidth}%`
      };
    }

    // Calculate actual progress bar (foreground) - based on progress percentage
    let actualBar = null;
    if (estimatedBar && machine.overall_progress > 0) {
      // Progress bar width = estimated bar width × progress percentage
      const progressWidth = parseFloat(estimatedBar.width) * (machine.overall_progress / 100);
      
      actualBar = {
        left: `${actualStartPosition}%`,
        width: `${Math.max(progressWidth, 1)}%`
      };
    }
    
    return {
      estimated: estimatedBar,
      actual: actualBar,
      progress: machine.overall_progress,
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
        {/* Dual-layer Gantt chart */}
        {timelineBars && (
          <div className="relative h-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  {/* Estimated time bar (background layer) */}
                  {timelineBars.estimated && (
                    <div
                      className={cn(
                        "absolute h-6 bg-amber-100 border border-amber-200 transition-all",
                        isSelected && "ring-1 ring-amber-400"
                      )}
                      style={{
                        left: timelineBars.estimated.left,
                        width: timelineBars.estimated.width,
                        top: '20px',
                        zIndex: 5
                      }}
                    />
                  )}
                  
                  {/* Actual time bar (foreground layer) */}
                  {timelineBars.actual && (
                    <div
                      className="absolute h-6 bg-amber-600 cursor-pointer hover:bg-amber-700 transition-all"
                      style={{
                        left: timelineBars.actual.left,
                        width: timelineBars.actual.width,
                        top: '20px',
                        zIndex: 10
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDetail?.();
                      }}
                    />
                  )}
                  
                  {/* Progress text - positioned over the longest bar */}
                  {(timelineBars.estimated || timelineBars.actual) && (
                    <div 
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        left: timelineBars.estimated?.left || timelineBars.actual?.left,
                        width: timelineBars.estimated?.width || timelineBars.actual?.width,
                        height: '24px',
                        top: '20px',
                        zIndex: 15
                      }}
                    >
                      <span className="text-xs font-medium text-amber-800 drop-shadow-sm">
                        {timelineBars.progress}%
                      </span>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                  <div className="space-y-1 max-w-xs">
                    <div className="font-medium">{machine.system_name}</div>
                    <div className="text-sm space-y-1">
                      <div>狀態: {machine.status}</div>
                      <div>進度: {machine.overall_progress}%</div>
                      <div>開始: {formatDateTime(machine.start_time)}</div>
                      <div>完成: {formatDateTime(machine.end_time)}</div>
                      {machine.duration_hours && (
                        <div>實際時長: {machine.duration_hours.toFixed(1)} 小時</div>
                      )}
                      {machine.estimated_duration_hours && (
                        <div>預估時長: {machine.estimated_duration_hours.toFixed(1)} 小時</div>
                      )}
                      {machine.estimated_end_time && (
                        <div>預計完成: {formatDateTime(machine.estimated_end_time)}</div>
                      )}
                    </div>
                  </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* No data indicator */}
        {!timelineBars && (
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
          <div className="h-full border-l-2 border-destructive/40" />
        </div>
      </div>
    </TooltipProvider>
  );
}