import { GanttTask } from '@/hooks/useGanttTasks';

interface GanttTaskBarProps {
  task: GanttTask;
  viewRange: { start: Date; end: Date };
  isHovered?: boolean;
}

export function GanttTaskBar({ task, viewRange, isHovered }: GanttTaskBarProps) {
  if (!task.startDate) return null;
  
  const { start, end } = viewRange;
  const totalDuration = end.getTime() - start.getTime();
  const taskStart = Math.max(0, task.startDate.getTime() - start.getTime());
  const taskEnd = task.endDate 
    ? Math.min(totalDuration, task.endDate.getTime() - start.getTime())
    : taskStart + (24 * 60 * 60 * 1000); // Default 1 day if no end date
  
  const taskDuration = taskEnd - taskStart;
  
  if (taskDuration <= 0) return null;
  
  const leftPercent = (taskStart / totalDuration) * 100;
  const widthPercent = Math.max((taskDuration / totalDuration) * 100, 5);

  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-gradient-success';
      case 'in_progress': return 'bg-gradient-primary';
      case 'delayed': return 'bg-gradient-danger';
      default: return 'bg-gradient-to-r from-muted to-muted/70';
    }
  };

  const getStatusShadow = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'shadow-lg shadow-success/20';
      case 'in_progress': return 'shadow-lg shadow-primary/20';
      case 'delayed': return 'shadow-lg shadow-destructive/20';
      default: return 'shadow-md shadow-muted/10';
    }
  };
  
  return (
    <div
      className={`relative h-10 rounded-lg cursor-pointer transition-all duration-300 hover:h-12 hover:scale-105 border border-border/20 backdrop-blur-sm ${getStatusColor(task.status)} ${getStatusShadow(task.status)} ${
        isHovered ? 'scale-105 h-12 shadow-glow' : ''
      }`}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        minWidth: '100px'
      }}
      title={`${task.name} - ${task.progress}%`}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5 rounded-lg"></div>
      
      {/* Progress fill with enhanced visuals */}
      <div 
        className="h-full bg-gradient-to-r from-white/40 via-white/20 to-white/40 rounded-lg transition-all duration-500 shadow-inner"
        style={{ width: `${task.progress}%` }}
      >
        <div className="h-full bg-gradient-to-b from-white/20 to-transparent rounded-lg"></div>
      </div>
      
      {/* Completion indicator */}
      {task.progress === 100 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-success rounded-full flex items-center justify-center shadow-md">
          <div className="w-3 h-3 text-success-foreground">✓</div>
        </div>
      )}
      
      {/* Task content with enhanced typography */}
      <div className="absolute inset-0 flex items-center justify-between px-4 text-white text-sm font-semibold">
        <span className="truncate max-w-[50%] drop-shadow-sm">
          {task.name}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-black/30 px-3 py-1 rounded-full border border-white/20 backdrop-blur-sm">
            {task.progress}%
          </span>
        </div>
      </div>
      
      {/* Shimmer effect for in-progress tasks */}
      {task.status === 'in_progress' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-lg animate-pulse-slow"></div>
      )}
    </div>
  );
}