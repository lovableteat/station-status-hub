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
  const progressBars = useMemo(() => {
    if (!machine.start_time) {
      return null;
    }

    const totalDuration = bounds.end.getTime() - bounds.start.getTime();
    const startTime = new Date(machine.start_time);
    
    // Calculate estimated bar (yellow - full planned duration)
    let estimatedBar = null;
    if (machine.estimated_end_time) {
      const estimatedEndTime = new Date(machine.estimated_end_time);
      const estimatedStartPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
      const estimatedDuration = estimatedEndTime.getTime() - startTime.getTime();
      const estimatedWidth = (estimatedDuration / totalDuration) * 100;
      
      const actualEstimatedWidth = Math.max(estimatedWidth, 2);
      const actualEstimatedStartPosition = Math.max(0, Math.min(estimatedStartPosition, 98));
      
      estimatedBar = {
        left: `${actualEstimatedStartPosition}%`,
        width: `${actualEstimatedWidth}%`
      };
    }
    
    // Calculate progress bar (green - actual progress based on completion percentage)
    let progressBar = null;
    if (machine.overall_progress > 0 && machine.estimated_end_time) {
      const progressStartPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
      const estimatedEndTime = new Date(machine.estimated_end_time);
      const totalEstimatedDuration = estimatedEndTime.getTime() - startTime.getTime();
      const progressDuration = totalEstimatedDuration * (machine.overall_progress / 100);
      const progressWidth = (progressDuration / totalDuration) * 100;

      const finalProgressWidth = Math.max(progressWidth, 1);
      const finalProgressStartPosition = Math.max(0, Math.min(progressStartPosition, 99));

      progressBar = {
        left: `${finalProgressStartPosition}%`,
        width: `${finalProgressWidth}%`,
        progress: machine.overall_progress
      };
    }

    return { estimatedBar, progressBar };
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
        {/* Progress bars */}
        {progressBars && (
          <div className="relative h-full">
            {/* Estimated time bar (yellow background) */}
            {progressBars.estimatedBar && (
              <div
                className="h-4 rounded-sm bg-yellow-200 border border-yellow-300/30"
                style={{
                  position: 'absolute',
                  left: progressBars.estimatedBar.left,
                  width: progressBars.estimatedBar.width,
                  top: '22px'
                }}
              />
            )}
            
            {/* Progress bar (green foreground) */}
            {progressBars.progressBar && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "h-6 rounded-sm bg-green-500 border border-green-600/20 shadow-sm transition-all cursor-pointer hover:scale-105",
                      isSelected && "ring-2 ring-primary ring-offset-2"
                    )}
                    style={{
                      position: 'absolute',
                      left: progressBars.progressBar.left,
                      width: progressBars.progressBar.width,
                      top: '20px',
                      zIndex: 10
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDetail?.();
                    }}
                  >
                    <div className="flex items-center justify-center h-full px-2">
                      <span className="text-xs font-medium text-white">
                        {machine.overall_progress}%
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
            )}
          </div>
        )}

        {/* No data indicator */}
        {!progressBars && (
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