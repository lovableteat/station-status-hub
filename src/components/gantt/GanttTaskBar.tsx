import { GanttTask } from '@/hooks/useGanttTasks';

interface GanttTaskBarProps {
  task: GanttTask;
  viewRange: { start: Date; end: Date };
}

export function GanttTaskBar({ task, viewRange }: GanttTaskBarProps) {
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
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };
  
  return (
    <div
      className="relative h-8 rounded-md cursor-pointer transition-all duration-200 hover:h-9 shadow-sm border"
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: getStatusColor(task.status),
        minWidth: '80px'
      }}
      title={`${task.name} - ${task.progress}%`}
    >
      {/* Progress fill */}
      <div 
        className="h-full bg-white/30 rounded-md transition-all duration-500"
        style={{ width: `${task.progress}%` }}
      />
      
      {/* Task content */}
      <div className="absolute inset-0 flex items-center justify-between px-3 text-white text-sm font-medium">
        <span className="truncate max-w-[60%]">
          {task.name}
        </span>
        <span className="text-xs bg-black/20 px-2 py-1 rounded">
          {task.progress}%
        </span>
      </div>
    </div>
  );
}