import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GanttTask } from '@/hooks/useGanttTasks';

interface GanttTaskListProps {
  tasks: GanttTask[];
}

export function GanttTaskList({ tasks }: GanttTaskListProps) {
  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  return (
    <div className="w-80 border-r bg-muted/30">
      <div className="p-4 border-b bg-background">
        <h3 className="font-semibold">機台列表</h3>
        <p className="text-sm text-muted-foreground">共 {tasks.length} 台機器</p>
      </div>
      <ScrollArea className="h-[600px]">
        <div className="p-2 space-y-2">
          {tasks.map(task => (
            <div 
              key={task.id} 
              className="p-3 bg-background rounded border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{task.name}</span>
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: getStatusColor(task.status) }}
                  title={task.status}
                />
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                負責人: {task.assignee}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>進度</span>
                  <span className="font-medium">{task.progress}%</span>
                </div>
                <Progress value={task.progress} className="h-1" />
              </div>
              {task.startDate && (
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{task.startDate.toLocaleDateString('zh-TW')}</span>
                  {task.endDate && <span>{task.endDate.toLocaleDateString('zh-TW')}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}