import { useMemo } from "react";
import { MachineTimelineData } from "@/hooks/useMachineTimelineData";

interface MachineRowProps {
  machine: MachineTimelineData;
  bounds: { start: Date; end: Date };
  onClick: () => void;
}

export function MachineRow({ machine, bounds, onClick }: MachineRowProps) {
  const progressBar = useMemo(() => {
    if (!machine.planned_start_time) {
      return null;
    }

    const totalDuration = bounds.end.getTime() - bounds.start.getTime();
    const plannedStartTime = new Date(machine.planned_start_time);
    const plannedEndTime = machine.planned_end_time ? new Date(machine.planned_end_time) : new Date();
    
    // Calculate planned time range position and width
    const startPosition = ((plannedStartTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    const endPosition = ((plannedEndTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    
    const left = Math.max(0, Math.min(startPosition, 100));
    const width = Math.max(1, Math.min(endPosition - startPosition, 100 - left));
    
    return {
      left: `${left}%`,
      width: `${width}%`,
      progress: machine.overall_progress,
      hasActualTimes: machine.actual_start_time || machine.actual_end_time
    };
  }, [machine, bounds]);

  return (
    <div 
      className="relative h-16 border-b cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={onClick}
    >
      {progressBar ? (
        <div className="relative h-full flex items-center">
          {/* Background bar (planned time range) - light grey */}
          <div
            className="absolute h-8 bg-muted/30 rounded border border-muted/50 hover:bg-muted/40 transition-colors"
            style={{
              left: progressBar.left,
              width: progressBar.width,
              top: '16px'
            }}
          />
          
          {/* Progress bar (actual completion) - blue fill based on progress percentage */}
          <div
            className="absolute h-8 bg-primary rounded"
            style={{
              left: progressBar.left,
              width: `${(parseFloat(progressBar.width) * progressBar.progress) / 100}%`,
              top: '16px'
            }}
          />
          
          {/* Progress text */}
          <div
            className="absolute flex items-center justify-center text-xs font-medium text-foreground pointer-events-none"
            style={{
              left: progressBar.left,
              width: progressBar.width,
              height: '32px',
              top: '16px'
            }}
          >
            {progressBar.progress}%
          </div>
          
          {/* Actual completion indicator (if available) */}
          {machine.actual_end_time && (
            <div
              className="absolute w-0.5 h-10 bg-success -top-1 shadow-sm"
              style={{
                left: `${progressBar.left}`,
                marginLeft: `${(parseFloat(progressBar.width) * progressBar.progress) / 100}%`
              }}
            >
              <div className="absolute -top-2 -left-1 w-3 h-3 bg-success rounded-full shadow-sm" />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          尚未開始
        </div>
      )}
    </div>
  );
}