import { memo } from 'react';
import { GanttTask } from '@/hooks/useGanttTasks';
import { GanttTaskBar } from './GanttTaskBar';

interface GanttMachineRowProps {
  task: GanttTask;
  viewRange: { start: Date; end: Date };
}

export const GanttMachineRow = memo(function GanttMachineRow({ 
  task, 
  viewRange 
}: GanttMachineRowProps) {
  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  return (
    <div className="flex h-12 border-b border-border/30 hover:bg-muted/30 transition-colors">
      {/* Machine Name Column */}
      <div className="w-48 flex-shrink-0 flex items-center px-4 bg-muted/20 border-r border-border/30">
        <div className="flex items-center gap-3">
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0" 
            style={{ backgroundColor: getStatusColor(task.status) }}
            title={task.status}
          />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{task.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {task.progress}% · {task.assignee}
            </div>
          </div>
        </div>
      </div>
      
      {/* Gantt Bar Column */}
      <div className="flex-1 relative">
        <GanttTaskBar task={task} viewRange={viewRange} />
      </div>
    </div>
  );
});