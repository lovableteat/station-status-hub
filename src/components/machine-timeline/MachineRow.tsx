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
    
    // Calculate estimated time bar (orange/yellow background)
    if (machine.estimated_end_time) {
      const estimatedEndTime = new Date(machine.estimated_end_time);
      const estimatedStartPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
      const estimatedDuration = estimatedEndTime.getTime() - startTime.getTime();
      const estimatedWidth = (estimatedDuration / totalDuration) * 100;
      
      const actualEstimatedWidth = Math.max(estimatedWidth, 2);
      const actualEstimatedStartPosition = Math.max(0, Math.min(estimatedStartPosition, 98));
      
      return {
        left: `${actualEstimatedStartPosition}%`,
        width: `${actualEstimatedWidth}%`,
        progress: machine.overall_progress,
        status: machine.status
      };
    }
    
    return null;
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
        {/* Dual-layer progress bar */}
        {progressBar && (
          <div className="relative h-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative h-8 rounded-md bg-orange-200 border-2 border-background shadow-sm transition-all cursor-pointer hover:scale-105 overflow-hidden",
                    isSelected && "ring-2 ring-primary ring-offset-2"
                  )}
                  style={{
                    position: 'absolute',
                    left: progressBar.left,
                    width: progressBar.width,
                    top: '16px',
                    zIndex: 10
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetail?.();
                  }}
                >
                  {/* Progress fill */}
                  <div 
                    className="h-full bg-orange-400 transition-all duration-300"
                    style={{ width: `${progressBar.progress}%` }}
                  />
                  
                  {/* Progress text */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-orange-900 drop-shadow-sm">
                      {progressBar.progress}%
                    </span>
                  </div>
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
          <div className="h-full border-l-2 border-destructive/40" />
        </div>
      </div>
    </TooltipProvider>
  );
}