import { useMemo } from "react";
import { MachineTimelineData } from "@/hooks/useMachineTimelineData";

interface MachineRowProps {
  machine: MachineTimelineData;
  bounds: { start: Date; end: Date };
}

export function MachineRow({ machine, bounds }: MachineRowProps) {
  const progressBar = useMemo(() => {
    if (!machine.start_time) {
      return null;
    }

    const totalDuration = bounds.end.getTime() - bounds.start.getTime();
    const startTime = new Date(machine.start_time);
    const endTime = machine.end_time ? new Date(machine.end_time) : new Date();
    
    // Calculate position and width
    const startPosition = ((startTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    const endPosition = ((endTime.getTime() - bounds.start.getTime()) / totalDuration) * 100;
    
    const left = Math.max(0, Math.min(startPosition, 100));
    const width = Math.max(1, Math.min(endPosition - startPosition, 100 - left));
    
    return {
      left: `${left}%`,
      width: `${width}%`,
      progress: machine.overall_progress
    };
  }, [machine, bounds]);

  return (
    <div className="relative h-16 border-b">
      {progressBar ? (
        <div className="relative h-full flex items-center">
          {/* Background bar (total time range) */}
          <div
            className="absolute h-8 bg-muted/40 rounded"
            style={{
              left: progressBar.left,
              width: progressBar.width,
              top: '16px'
            }}
          />
          
          {/* Progress bar (completed portion) */}
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
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          尚未開始
        </div>
      )}
    </div>
  );
}