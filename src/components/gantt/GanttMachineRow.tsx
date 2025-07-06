import { memo } from 'react';
import { GanttTask } from '@/hooks/useGanttTasks';
import { GanttTaskBar } from './GanttTaskBar';

interface GanttMachineRowProps {
  task: GanttTask;
  viewRange: { start: Date; end: Date };
  isHovered?: boolean;
  onHover?: (taskId: string | null) => void;
}

export const GanttMachineRow = memo(function GanttMachineRow({ 
  task, 
  viewRange,
  isHovered,
  onHover
}: GanttMachineRowProps) {
  const getStatusIndicator = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-gradient-success';
      case 'in_progress': return 'bg-gradient-primary';
      case 'delayed': return 'bg-gradient-danger';
      default: return 'bg-muted';
    }
  };

  return (
    <div 
      className={`flex bg-card/50 border border-border/20 rounded-lg mb-2 transition-all duration-300 hover:shadow-station hover:scale-[1.02] hover:bg-card/80 backdrop-blur-sm ${
        isHovered ? 'shadow-glow scale-[1.02] bg-card/80' : ''
      }`}
      onMouseEnter={() => onHover?.(task.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Machine Name Section */}
      <div className="w-48 flex-shrink-0 px-4 py-4 bg-gradient-to-r from-muted/20 via-muted/10 to-transparent border-r border-border/30 rounded-l-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div 
              className={`w-4 h-4 rounded-full shadow-md ${getStatusIndicator(task.status)} transition-all duration-300`}
            />
            <div 
              className={`absolute inset-0 w-4 h-4 rounded-full animate-ping ${getStatusIndicator(task.status)} opacity-30`}
            />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-foreground mb-1 transition-colors duration-200">
              {task.name}
            </h4>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{task.assignee}</p>
              <div className="w-1 h-1 bg-muted-foreground/50 rounded-full"></div>
              <p className="text-xs text-primary font-medium">{task.progress}%</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Timeline Section */}
      <div className="flex-1 relative p-3">
        <GanttTaskBar task={task} viewRange={viewRange} isHovered={isHovered} />
      </div>
    </div>
  );
});